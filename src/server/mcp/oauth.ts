import "server-only";
import { and, eq, lt } from "drizzle-orm";
import type { Database } from "@/db";
import {
  apiTokens,
  oauthClients,
  oauthCodes,
  oauthGrants,
  oauthTokens,
} from "@/db/schema";
import {
  ACCESS_TOKEN_TTL_MS,
  AUTH_CODE_TTL_MS,
  hashToken,
  mintAuthCode,
  mintClientId,
  mintToken,
  REFRESH_TOKEN_TTL_MS,
  verifyPkce,
} from "./tokens";

/** The database half of the OAuth 2.1 authorization server: registration, the
 * code round trip, token issuance and rotation, revocation.
 *
 * The pure parts it leans on (hashing, PKCE, prefixes, TTLs) are in ./tokens.ts.
 * Nothing in this file reads a Request or writes a Response — the route handlers
 * own the wire format, this owns the state. */

// ── Client registration ─────────────────────────────────────────────────────

export type ClientRegistration = {
  clientName: string;
  redirectUris: string[];
  clientUri?: string | null;
  logoUri?: string | null;
  softwareId?: string | null;
  tokenEndpointAuthMethod?: string;
};

/** RFC 7591 dynamic registration. Returns the row plus, for a confidential
 * client, the one-time secret.
 *
 * Nothing here is trusted. A registration is an unauthenticated stranger
 * describing itself, and the only field with teeth is `redirectUris`, which is
 * validated by the caller before it reaches this function. */
export async function registerClient(
  db: Database,
  input: ClientRegistration,
): Promise<{ clientId: string; clientSecret: string | null }> {
  const wantsSecret = input.tokenEndpointAuthMethod === "client_secret_post";
  const secret = wantsSecret ? mintToken("personal").token : null;
  const clientId = mintClientId();

  await db.insert(oauthClients).values({
    clientId,
    clientSecretHash: secret ? hashToken(secret) : null,
    name: input.clientName,
    redirectUris: input.redirectUris,
    clientUri: input.clientUri ?? null,
    logoUri: input.logoUri ?? null,
    softwareId: input.softwareId ?? null,
    tokenEndpointAuthMethod: wantsSecret ? "client_secret_post" : "none",
  });

  return { clientId, clientSecret: secret };
}

export async function findClient(db: Database, clientId: string) {
  return db.query.oauthClients.findFirst({
    where: eq(oauthClients.clientId, clientId),
  });
}

/** Exact string match against the registered set, and nothing cleverer.
 *
 * Prefix matching, subdomain matching and "same origin is close enough" are all
 * the same bug: they let an attacker who can register a client — which is
 * anyone — nominate a redirect that collects somebody else's authorization
 * code. The value the client sends must be one it registered, character for
 * character. */
export function redirectUriAllowed(
  registered: string[],
  candidate: string,
): boolean {
  return registered.includes(candidate);
}

// ── Authorization codes ─────────────────────────────────────────────────────

/** Mint a code for a consent the user just gave. Returns the plaintext code,
 * which exists only long enough to be put in the redirect. */
export async function issueAuthCode(
  db: Database,
  input: {
    clientRowId: string;
    userId: string;
    redirectUri: string;
    codeChallenge: string;
    scope: string;
    resource: string | null;
  },
): Promise<string> {
  const { code, hash } = mintAuthCode();
  await db.insert(oauthCodes).values({
    codeHash: hash,
    clientId: input.clientRowId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    scope: input.scope,
    resource: input.resource,
    expires: new Date(Date.now() + AUTH_CODE_TTL_MS),
  });
  return code;
}

export type CodeExchangeError =
  | "invalid_grant"
  | "invalid_client"
  | "invalid_request";

/** Redeem an authorization code for a token pair.
 *
 * Single use is enforced by deleting the row before anything else can go
 * wrong — the delete is the claim. Two concurrent exchanges of the same code
 * therefore race on the database, and exactly one of them sees a deleted row
 * come back; the loser gets `invalid_grant`, which is the correct answer for a
 * replay. */
export async function exchangeAuthCode(
  db: Database,
  input: {
    code: string;
    clientId: string;
    redirectUri: string;
    codeVerifier: string;
    clientSecret: string | null;
  },
): Promise<
  | { ok: true; accessToken: string; refreshToken: string; scope: string }
  | { ok: false; error: CodeExchangeError; description: string }
> {
  const client = await findClient(db, input.clientId);
  if (!client) {
    return {
      ok: false,
      error: "invalid_client",
      description: "Unknown client_id.",
    };
  }

  if (client.clientSecretHash) {
    if (
      !input.clientSecret ||
      hashToken(input.clientSecret) !== client.clientSecretHash
    ) {
      return {
        ok: false,
        error: "invalid_client",
        description: "Client authentication failed.",
      };
    }
  }

  // Claim the code. `returning()` on the delete makes this atomic: whoever gets
  // a row back owns the exchange.
  const [row] = await db
    .delete(oauthCodes)
    .where(eq(oauthCodes.codeHash, hashToken(input.code)))
    .returning();

  if (!row) {
    return {
      ok: false,
      error: "invalid_grant",
      description: "Authorization code is invalid or already used.",
    };
  }

  if (row.expires.getTime() <= Date.now()) {
    return {
      ok: false,
      error: "invalid_grant",
      description: "Authorization code has expired.",
    };
  }

  // The code belongs to the client that requested it. Without this check any
  // registered client could redeem a code issued to another one.
  if (row.clientId !== client.id) {
    return {
      ok: false,
      error: "invalid_grant",
      description: "Authorization code was issued to a different client.",
    };
  }

  // Same redirect_uri as the authorization request — RFC 6749 §4.1.3, and the
  // reason a code stolen mid-redirect can't be redeemed from somewhere else.
  if (row.redirectUri !== input.redirectUri) {
    return {
      ok: false,
      error: "invalid_grant",
      description: "redirect_uri does not match the authorization request.",
    };
  }

  if (!verifyPkce(input.codeVerifier, row.codeChallenge)) {
    return {
      ok: false,
      error: "invalid_grant",
      description: "PKCE verification failed.",
    };
  }

  const grantId = await upsertGrant(db, {
    clientRowId: row.clientId,
    userId: row.userId,
    scope: row.scope,
  });
  const pair = await issueTokenPair(db, grantId);
  return { ok: true, ...pair, scope: row.scope };
}

// ── Grants and tokens ───────────────────────────────────────────────────────

/** Find or create the durable "this client is connected to this account" row.
 *
 * Re-consenting has to land on the existing grant: a second row would show up
 * as a duplicate entry on the connections page, and revoking the one the user
 * can see would leave the other one working. The unique index on
 * (client_id, user_id) is what makes that structural rather than hopeful. */
export async function upsertGrant(
  db: Database,
  input: { clientRowId: string; userId: string; scope: string },
): Promise<string> {
  const [row] = await db
    .insert(oauthGrants)
    .values({
      clientId: input.clientRowId,
      userId: input.userId,
      scope: input.scope,
    })
    .onConflictDoUpdate({
      target: [oauthGrants.clientId, oauthGrants.userId],
      set: { scope: input.scope, lastUsedAt: new Date() },
    })
    .returning({ id: oauthGrants.id });
  return row.id;
}

export async function issueTokenPair(
  db: Database,
  grantId: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const access = mintToken("access");
  const refresh = mintToken("refresh");
  const now = Date.now();

  await db.insert(oauthTokens).values([
    {
      grantId,
      tokenHash: access.hash,
      kind: "access",
      expires: new Date(now + ACCESS_TOKEN_TTL_MS),
    },
    {
      grantId,
      tokenHash: refresh.hash,
      kind: "refresh",
      expires: new Date(now + REFRESH_TOKEN_TTL_MS),
    },
  ]);

  // Opportunistic GC, same posture as the OTP sweep in src/server/auth.ts:
  // access tokens turn over hourly, so without this the table grows forever.
  // Spent refresh tokens are kept — see the reuse check below, which is the
  // whole reason `replaced_at` exists — until they pass their own expiry.
  await db
    .delete(oauthTokens)
    .where(
      and(
        eq(oauthTokens.grantId, grantId),
        lt(oauthTokens.expires, new Date(now)),
      ),
    )
    .catch((err) => console.error("[oauth] token GC failed:", err));

  return { accessToken: access.token, refreshToken: refresh.token };
}

/** Rotate a refresh token: issue a new pair and spend the old one.
 *
 * The reuse branch is the interesting one. A rotated token presented a second
 * time means two parties hold it — the legitimate client already exchanged it
 * and moved on — so the only safe reading is that it leaked. Failing the
 * request would leave the thief's *other* copy working, so instead the entire
 * grant is revoked and both parties are logged out. The user sees the
 * connection disappear from their connections page, which is the correct amount
 * of alarming. */
export async function rotateRefreshToken(
  db: Database,
  input: {
    refreshToken: string;
    clientId: string;
    clientSecret: string | null;
  },
): Promise<
  | { ok: true; accessToken: string; refreshToken: string; scope: string }
  | { ok: false; error: CodeExchangeError; description: string }
> {
  const client = await findClient(db, input.clientId);
  if (!client) {
    return {
      ok: false,
      error: "invalid_client",
      description: "Unknown client_id.",
    };
  }
  if (client.clientSecretHash) {
    if (
      !input.clientSecret ||
      hashToken(input.clientSecret) !== client.clientSecretHash
    ) {
      return {
        ok: false,
        error: "invalid_client",
        description: "Client authentication failed.",
      };
    }
  }

  const row = await db.query.oauthTokens.findFirst({
    where: and(
      eq(oauthTokens.tokenHash, hashToken(input.refreshToken)),
      eq(oauthTokens.kind, "refresh"),
    ),
  });
  if (!row) {
    return {
      ok: false,
      error: "invalid_grant",
      description: "Refresh token is invalid.",
    };
  }

  if (row.replacedAt) {
    await revokeGrant(db, row.grantId);
    return {
      ok: false,
      error: "invalid_grant",
      description:
        "Refresh token was already used; the grant has been revoked.",
    };
  }

  if (row.expires.getTime() <= Date.now()) {
    return {
      ok: false,
      error: "invalid_grant",
      description: "Refresh token has expired.",
    };
  }

  const grant = await db.query.oauthGrants.findFirst({
    where: eq(oauthGrants.id, row.grantId),
  });
  // The grant must still exist and still belong to the client presenting the
  // token — a revoked grant cascades its tokens away, so this is belt and
  // braces against a token that outlived its row.
  if (!grant || grant.clientId !== client.id) {
    return {
      ok: false,
      error: "invalid_grant",
      description: "Refresh token does not belong to this client.",
    };
  }

  await db
    .update(oauthTokens)
    .set({ replacedAt: new Date() })
    .where(eq(oauthTokens.id, row.id));

  const pair = await issueTokenPair(db, row.grantId);
  return { ok: true, ...pair, scope: grant.scope };
}

/** Cut a connection. Deleting the grant cascades to every token under it, so
 * the next call from that client is anonymous. */
export async function revokeGrant(
  db: Database,
  grantId: string,
): Promise<void> {
  await db.delete(oauthGrants).where(eq(oauthGrants.id, grantId));
}

/** RFC 7009 revocation, by either half of a pair.
 *
 * Revoking a refresh token takes the whole grant with it, which is what a
 * client signing out means by the request. Revoking an access token takes only
 * that token, so a client can drop a leaked one without disconnecting. */
export async function revokeToken(db: Database, token: string): Promise<void> {
  const row = await db.query.oauthTokens.findFirst({
    where: eq(oauthTokens.tokenHash, hashToken(token)),
  });
  if (!row) return;
  if (row.kind === "refresh") await revokeGrant(db, row.grantId);
  else await db.delete(oauthTokens).where(eq(oauthTokens.id, row.id));
}

// ── Personal access tokens ──────────────────────────────────────────────────

/** Mint a hand-made token. The returned string is the only copy that will ever
 * exist in the clear — the caller shows it once and then it is gone. */
export async function createApiToken(
  db: Database,
  input: { userId: string; name: string; expiresInDays: number | null },
): Promise<{ id: string; token: string }> {
  const minted = mintToken("personal");
  const [row] = await db
    .insert(apiTokens)
    .values({
      userId: input.userId,
      name: input.name,
      tokenHash: minted.hash,
      hint: minted.hint,
      expires:
        input.expiresInDays === null
          ? null
          : new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000),
    })
    .returning({ id: apiTokens.id });
  return { id: row.id, token: minted.token };
}

/** Sweep tokens and codes that are past their expiry, for the whole table.
 *
 * Called from the connections page's list query — the one place a user is
 * already waiting on a round trip about exactly these rows — rather than from a
 * cron this deployment doesn't have. Best-effort by design: a failed sweep must
 * never fail the request it rode in on. */
export async function sweepExpired(db: Database): Promise<void> {
  const now = new Date();
  try {
    await Promise.all([
      db.delete(oauthCodes).where(lt(oauthCodes.expires, now)),
      db.delete(oauthTokens).where(lt(oauthTokens.expires, now)),
      // `expires` is null for a token the user chose to make permanent, and
      // `null < now` is null in SQL — never true — so those rows are excluded
      // by the comparison itself rather than by a second condition.
      db.delete(apiTokens).where(lt(apiTokens.expires, now)),
    ]);
  } catch (err) {
    console.error("[oauth] expiry sweep failed:", err);
  }
}

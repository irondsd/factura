import "server-only";
import { and, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { apiTokens, oauthGrants, oauthTokens } from "@/db/schema";
import { HEARTBEAT_MS } from "../sessions";
import { hashToken, isExpired, tokenKind } from "./tokens";

/** The single seam between "a request arrived with a bearer token" and "this is
 * whose data it may see".
 *
 * Everything downstream — every tool, every tRPC caller, every property scope —
 * takes a `userId` and nothing else, exactly as the web app's session does.
 * That is deliberate: a personal token and an OAuth grant differ in how they
 * were obtained and in nothing else, so the difference stops here rather than
 * spreading into the tools. The `via` field exists for logging and for the
 * connections page, never for authorization.
 */

export type McpCaller = {
  userId: string;
  via:
    | { kind: "oauth"; grantId: string }
    | { kind: "personal"; tokenId: string };
};

/**
 * Resolve a bearer string to a caller, or null.
 *
 * Null is returned for every kind of failure — unknown prefix, no such token,
 * expired, orphaned — and the caller turns all of them into the same 401. Not
 * distinguishing them is the point: an error that says "that token exists but
 * has expired" tells an attacker their guess was structurally right.
 */
export async function resolveBearer(
  db: Database,
  token: string,
): Promise<McpCaller | null> {
  const kind = tokenKind(token);
  // Refresh tokens are deliberately not accepted here. They are valid strings
  // in `oauth_token`, and without this check a client could skip rotation
  // entirely and use its long-lived credential as a permanent access token.
  if (kind !== "personal" && kind !== "access") return null;

  const hash = hashToken(token);
  return kind === "personal"
    ? resolvePersonal(db, hash)
    : resolveOauth(db, hash);
}

/** Refresh a `last_used_at` reading, but only once the old one has gone stale.
 *
 * Same throttle as the session heartbeat, for the same reason: every MCP call
 * already reads this row, and this bounds how often it also writes one. A
 * chatty client would otherwise turn every tool call into a write. Best-effort —
 * a failed timestamp update must never fail the call it rode in on. */
async function touch(
  last: Date | null,
  run: () => Promise<unknown>,
): Promise<void> {
  if (last && Date.now() - last.getTime() < HEARTBEAT_MS) return;
  await run().catch((err) =>
    console.error("[mcp] last-used update failed:", err),
  );
}

async function resolvePersonal(
  db: Database,
  hash: string,
): Promise<McpCaller | null> {
  const row = await db.query.apiTokens.findFirst({
    where: eq(apiTokens.tokenHash, hash),
  });
  if (!row || isExpired(row.expires)) return null;

  await touch(row.lastUsedAt, () =>
    db
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, row.id)),
  );

  return { userId: row.userId, via: { kind: "personal", tokenId: row.id } };
}

async function resolveOauth(
  db: Database,
  hash: string,
): Promise<McpCaller | null> {
  const row = await db.query.oauthTokens.findFirst({
    where: and(eq(oauthTokens.tokenHash, hash), eq(oauthTokens.kind, "access")),
  });
  if (!row || isExpired(row.expires)) return null;

  const grant = await db.query.oauthGrants.findFirst({
    where: eq(oauthGrants.id, row.grantId),
  });
  // A token whose grant is gone is a token the user revoked. The cascade should
  // already have deleted it; this is the check that makes the outcome correct
  // even if it somehow didn't.
  if (!grant) return null;

  await touch(grant.lastUsedAt, () =>
    db
      .update(oauthGrants)
      .set({ lastUsedAt: new Date() })
      .where(eq(oauthGrants.id, grant.id)),
  );

  return { userId: grant.userId, via: { kind: "oauth", grantId: grant.id } };
}

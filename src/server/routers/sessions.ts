import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, ne } from "drizzle-orm";
import { z } from "zod";
import { apiTokens, oauthClients, oauthGrants, sessions } from "@/db/schema";
import { isInstalled } from "@/lib/displayMode";
import { parseUserAgent } from "@/lib/userAgent";
import { createApiToken, revokeGrant, sweepExpired } from "../mcp/oauth";
import { protectedProcedure, router } from "../trpc";

/** Where the user is signed in, and how to end any of it.
 *
 * Every procedure is scoped by `userId`, so one account can neither see nor
 * revoke another's sessions. Rows are addressed by `id` (see the schema note):
 * the session token never leaves this file, in either direction.
 *
 * Connected apps and personal access tokens live here too, as planned: all
 * three are the same shape — a thing holding a credential to this account, with
 * the standing to be cut off — and "who can reach my data, and how do I stop
 * them" is one question that deserves one answer in one place. */
export const sessionsRouter = router({
  /** Active sessions, newest activity first. Expired rows are filtered out
   * rather than shown: Auth.js only deletes one when it is next presented, so
   * they can sit in the table long after they stopped being sign-ins. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.sessions.findMany({
      where: and(
        eq(sessions.userId, ctx.userId),
        gt(sessions.expires, new Date()),
      ),
      orderBy: [desc(sessions.lastActiveAt)],
    });

    return rows.map((row) => ({
      id: row.id,
      ...parseUserAgent(row.userAgent),
      installed: isInstalled(row.displayMode),
      ip: row.ip,
      city: row.city,
      country: row.country,
      createdAt: row.createdAt.toISOString(),
      lastActiveAt: row.lastActiveAt.toISOString(),
      expires: row.expires.toISOString(),
      current: row.sessionToken === ctx.sessionToken,
    }));
  }),

  /** End one other session. Deleting the row is the revocation — database
   * sessions are looked up on every request, so the next one it makes is
   * anonymous. */
  revoke: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.sessions.findFirst({
        where: and(eq(sessions.id, input.id), eq(sessions.userId, ctx.userId)),
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      // The current session ends through sign-out, which also clears the
      // cookie; revoking it here would leave this browser holding a token for a
      // row that no longer exists.
      if (row.sessionToken === ctx.sessionToken) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Use sign out to end the current session.",
        });
      }
      await ctx.db.delete(sessions).where(eq(sessions.id, row.id));
      return { revoked: 1 };
    }),

  /** The panic button: end every session but this one. Includes the expired
   * rows `list` hides — they are dead weight, and this is the sweep. */
  revokeOthers: protectedProcedure.mutation(async ({ ctx }) => {
    // A protected call always arrives with the cookie that authenticated it, so
    // the fallback is unreachable in practice — and if it ever isn't, sweeping
    // this session too is the safe way to be wrong.
    const scope = ctx.sessionToken
      ? and(
          eq(sessions.userId, ctx.userId),
          ne(sessions.sessionToken, ctx.sessionToken),
        )
      : eq(sessions.userId, ctx.userId);
    const gone = await ctx.db.delete(sessions).where(scope).returning({
      id: sessions.id,
    });
    return { revoked: gone.length };
  }),

  // ── Connected apps (MCP over OAuth) ───────────────────────────────────────

  /** Every MCP client the user has approved, newest activity first.
   *
   * `client.name` is text the client chose for itself at registration, so it is
   * rendered as a name and never as a claim — the consent screen makes the same
   * point at more length. */
  apps: protectedProcedure.query(async ({ ctx }) => {
    // The one place a user is already waiting on a round trip about exactly
    // these rows, so it is where the expiry sweep rides along.
    await sweepExpired(ctx.db);

    // Explicit join rather than a relational `with`: this schema declares no
    // drizzle relations, and adding them for one query would be a new
    // convention rather than a use of an existing one.
    const rows = await ctx.db
      .select({
        id: oauthGrants.id,
        scope: oauthGrants.scope,
        createdAt: oauthGrants.createdAt,
        lastUsedAt: oauthGrants.lastUsedAt,
        name: oauthClients.name,
        clientUri: oauthClients.clientUri,
      })
      .from(oauthGrants)
      .innerJoin(oauthClients, eq(oauthGrants.clientId, oauthClients.id))
      .where(eq(oauthGrants.userId, ctx.userId))
      .orderBy(desc(oauthGrants.lastUsedAt));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      clientUri: row.clientUri,
      scope: row.scope,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt.toISOString(),
    }));
  }),

  /** Disconnect an app. The grant's tokens cascade with it, so the client's
   * next call is anonymous and its refresh token buys it nothing. */
  revokeApp: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.oauthGrants.findFirst({
        where: and(
          eq(oauthGrants.id, input.id),
          eq(oauthGrants.userId, ctx.userId),
        ),
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      await revokeGrant(ctx.db, row.id);
      return { revoked: 1 };
    }),

  // ── Personal access tokens ────────────────────────────────────────────────

  /** The user's hand-made tokens. Never the tokens themselves — only the hint,
   * which is the tail of the string and cannot reconstruct it. */
  tokens: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.apiTokens.findMany({
      where: eq(apiTokens.userId, ctx.userId),
      orderBy: [desc(apiTokens.createdAt)],
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      hint: row.hint,
      expires: row.expires?.toISOString() ?? null,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }),

  /** Mint one. The returned `token` is the only time the value exists outside a
   * hash — the client shows it once and the user copies it or loses it. That is
   * the trade a hashed store makes, and it is the right one: a token this
   * server could read back is a token a database dump hands out. */
  createToken: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(60),
        /** Null means no expiry — the user's explicit choice, offered because
         * the config files these get pasted into are not rotated by anyone. */
        expiresInDays: z.union([
          z.literal(30),
          z.literal(90),
          z.literal(365),
          z.null(),
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // A cap on how many can exist at once: each one is a permanent key to the
      // account, and an unbounded list is one nobody audits.
      const existing = await ctx.db.query.apiTokens.findMany({
        where: eq(apiTokens.userId, ctx.userId),
        columns: { id: true },
      });
      if (existing.length >= 10) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Revoke an existing token before creating another.",
        });
      }

      const { id, token } = await createApiToken(ctx.db, {
        userId: ctx.userId,
        name: input.name,
        expiresInDays: input.expiresInDays,
      });
      return { id, token };
    }),

  revokeToken: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const gone = await ctx.db
        .delete(apiTokens)
        .where(
          and(eq(apiTokens.id, input.id), eq(apiTokens.userId, ctx.userId)),
        )
        .returning({ id: apiTokens.id });
      if (gone.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return { revoked: 1 };
    }),
});

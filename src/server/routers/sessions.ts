import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, ne } from "drizzle-orm";
import { z } from "zod";
import { sessions } from "@/db/schema";
import { isInstalled } from "@/lib/displayMode";
import { parseUserAgent } from "@/lib/userAgent";
import { protectedProcedure, router } from "../trpc";

/** Where the user is signed in, and how to end any of it.
 *
 * Every procedure is scoped by `userId`, so one account can neither see nor
 * revoke another's sessions. Rows are addressed by `id` (see the schema note):
 * the session token never leaves this file, in either direction.
 *
 * This is also the home for connected apps once MCP lands — same shape (a thing
 * holding a credential to this account, with the standing to be cut off), so it
 * belongs in the same router and on the same page. */
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
});

import { initTRPC, TRPCError } from "@trpc/server";
import { db } from "@/db";
import { auth } from "./auth";
import { accessibleProperties } from "./ownership";
import { currentSessionToken } from "./sessions";

/** Resolve the signed-in user from the Auth.js session cookie. userId is null
 * for anonymous requests; protectedProcedure rejects those.
 *
 * `sessionToken` is the caller's own cookie value, carried so the sessions
 * router can tell which row is this browser and refuse to revoke it. It stays
 * on the server — never put it in a procedure's return value. */
export async function createContext() {
  const [session, sessionToken] = await Promise.all([
    auth(),
    currentSessionToken(),
  ]);
  return { db, userId: session?.user?.id ?? null, sessionToken };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/** Every domain query is per-user; this guarantees a non-null userId. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

/** protectedProcedure plus the caller's accessible property ids, resolved once
 * and attached as `ctx.accessiblePropertyIds`. Use for any procedure that scopes
 * a query/mutation to the properties the user belongs to, so the resolver
 * doesn't repeat the membership lookup. */
export const scopedProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const accessiblePropertyIds = await accessibleProperties(ctx.db, ctx.userId);
  return next({ ctx: { ...ctx, accessiblePropertyIds } });
});

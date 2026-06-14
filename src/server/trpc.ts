import { initTRPC, TRPCError } from "@trpc/server";
import { db } from "@/db";
import { auth } from "./auth";

/** Resolve the signed-in user from the Auth.js session cookie. userId is null
 * for anonymous requests; protectedProcedure rejects those. */
export async function createContext() {
  const session = await auth();
  return { db, userId: session?.user?.id ?? null };
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

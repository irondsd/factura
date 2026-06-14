import { createTRPCReact } from "@trpc/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/root";

export const trpc = createTRPCReact<AppRouter>();

/** Inferred result types of every procedure, e.g. RouterOutputs["insights"]["series"]. */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

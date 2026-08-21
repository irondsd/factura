import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cmsMembers } from "@/db/schema";
import { safeNext } from "@/lib/nextPath";
import { auth } from "@/server/auth";
import type { CmsAccess, CmsActor } from "../types";
import { resolveCmsAccess } from "./policy";

// The CMS authorization adapter: the one place CMS code touches Auth.js and the
// `cms_member` table. Route handlers, server components, mutations and the CMS
// MCP all come through here, so there is exactly one answer to "may this
// request use the CMS" and exactly one place to change when the deployments
// split and the session stops being Auth.js (cms.md §2.3).
//
// The rules themselves are in `./policy` and are pure; this file only fetches
// the two facts they need and turns the verdict into a Next.js response.

/** Look up a user's CMS membership. A missing row is the answer for both a
 * stranger and a removed member — revocation is a delete, and it has to bite on
 * the very next request. */
async function findMembership(userId: string) {
  const row = await db.query.cmsMembers.findFirst({
    where: eq(cmsMembers.userId, userId),
    columns: { role: true },
  });
  return row ?? null;
}

/** Resolve CMS access for the current request without deciding what to do
 * about it. For callers that need to branch themselves — an API route
 * answering 401 vs 404, say — rather than render a page. */
export async function getCmsAccess(): Promise<CmsAccess> {
  const session = await auth();
  const user = session?.user?.id
    ? {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      }
    : null;
  if (!user) return resolveCmsAccess(null, null);
  return resolveCmsAccess(user, await findMembership(user.id));
}

/** The CMS gate for server components and server actions. Returns the actor, or
 * never returns.
 *
 * Anonymous visitors are sent to /login with a `?next=` back to where they were
 * heading — run through `safeNext`, the same gate the rest of the site uses, so
 * a crafted path can't turn the sign-in page into an open redirect.
 *
 * A signed-in account that is not on the allowlist gets `notFound()`. Not a
 * "forbidden" screen: a 404 is the response that says nothing at all about
 * whether /cms is a real surface, and there is no legitimate reader of a
 * more-informative error — membership is granted by hand, out of band. */
export async function requireCmsMember(
  callbackPath?: string,
): Promise<CmsActor> {
  const access = await getCmsAccess();
  if (access.kind === "member") return access.actor;
  if (access.kind === "anonymous") {
    const next = safeNext(callbackPath) ?? "/cms";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  notFound();
}

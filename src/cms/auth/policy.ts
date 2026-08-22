import type { CmsAccess, CmsActor, CmsRole } from "../types";

// The CMS authorization rules, as pure functions over data that has already
// been fetched. Every decision the CMS makes about who may do what is decided
// here and nowhere else, so the rules can be tested exhaustively without a
// database, a session, or a running Next.js — and so a future deployment can
// swap the session/database adapters around them (cms.md) without
// touching the policy itself.
//
// Nothing in this file performs I/O. `requireCmsMember` is the caller that
// does, and it is the only entry point route code uses.

/** The identity half of a request, as far as the CMS cares. `null` is an
 * anonymous visitor. Shaped so an Auth.js session maps onto it directly but
 * nothing here depends on Auth.js. */
export type CmsSessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
} | null;

/** The `cms_member` row for that user, or `null` when they have none — which
 * covers both "never was a member" and "was one and the row was deleted".
 * Those are the same answer on purpose: revocation is a delete, and it must
 * take effect on the next request with no other bookkeeping. */
export type CmsMembership = { role: CmsRole } | null;

/** Resolve what a request may do in the CMS.
 *
 * Anonymous and non-member are separated because they get different responses,
 * not different amounts of access: a visitor who is not signed in can fix that
 * by signing in, so they are sent to /login; a signed-in account that is not on
 * the allowlist gets a 404, which tells them nothing about whether the CMS
 * exists or who edits it. */
export function resolveCmsAccess(
  user: CmsSessionUser,
  membership: CmsMembership,
): CmsAccess {
  if (!user) return { kind: "anonymous" };
  if (!membership) return { kind: "forbidden", userId: user.id };
  return {
    kind: "member",
    actor: {
      userId: user.id,
      email: user.email ?? null,
      name: user.name ?? null,
      role: membership.role,
    },
  };
}

/** Whether an actor may mint and revoke CMS API tokens. Admin only: a token is
 * a long-lived credential that carries its holder's authority into an agent,
 * and handing that out is a different decision from being trusted to write. */
export const canManageTokens = (actor: CmsActor): boolean =>
  actor.role === "admin";

/** Roles allowed to publish and unpublish.
 *
 * Iteration 1 lets both publish (cms.md): there are two trusted editors
 * and an approval workflow is explicitly deferred. This array is the toggle
 * that decision lives behind — narrowing it to `admin` later is an edit here
 * plus its test, and no call site moves. */
const PUBLISH_ROLES: readonly CmsRole[] = ["admin", "editor"];

/** Roles allowed to create and edit content. Both, in iteration 1: membership
 * *is* the write grant. */
const AUTHOR_ROLES: readonly CmsRole[] = ["admin", "editor"];

/** Whether an actor may publish or unpublish. */
export const canPublish = (actor: CmsActor): boolean =>
  PUBLISH_ROLES.includes(actor.role);

/** Whether an actor may create and edit content. */
export const canAuthor = (actor: CmsActor): boolean =>
  AUTHOR_ROLES.includes(actor.role);

// Types shared across the private CMS module. Deliberately free of any
// dependency on the bill app: `src/cms` is meant to move to the public-site
// deployment as one unit (cms.md §2.2), so nothing here may reach into
// `src/components/app`, the tRPC routers, or the bill domain.

/** A CMS membership role. Mirrors the `cms_role` database enum. */
export type CmsRole = "admin" | "editor";

/** The signed-in CMS user, resolved once per request. The only identity object
 * CMS code should pass around — it carries the role, so no consumer needs to go
 * back to the database to ask what someone may do. */
export type CmsActor = {
  userId: string;
  email: string | null;
  role: CmsRole;
};

/** The outcome of resolving CMS access for a request. A closed union rather
 * than a boolean, because the three cases get three different responses: a
 * redirect to sign in, a 404 that reveals nothing, and the editor itself. */
export type CmsAccess =
  | { kind: "anonymous" }
  | { kind: "forbidden"; userId: string }
  | { kind: "member"; actor: CmsActor };

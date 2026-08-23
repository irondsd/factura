import type { ContentSummary } from "@/content-system/types";

// Types shared across the private CMS module. Deliberately free of any
// dependency on the bill app: `src/cms` is meant to move to the public-site
// deployment as one unit (cms.md), so nothing here may reach into
// `src/components/app`, the tRPC routers, or the bill domain.

/** The CMS list needs one piece of editorial state that the public content
 * summary deliberately does not expose: whether a saved working copy exists
 * behind the page's current publication status. */
export type CmsContentSummary = ContentSummary & {
  hasWip: boolean;
};

/** A CMS membership role. Mirrors the `cms_role` database enum. */
export type CmsRole = "admin" | "editor";

/** The signed-in CMS user, resolved once per request. The only identity object
 * CMS code should pass around — it carries the role, so no consumer needs to go
 * back to the database to ask what someone may do. */
export type CmsActor = {
  userId: string;
  email: string | null;
  name: string | null;
  role: CmsRole;
  /** How this actor reached the CMS. Absent means the browser — a person
   * signed in — and `mcp` means an agent holding one of their tokens. The user
   * id is the same either way, so the page history has no other way to tell a
   * person's edit from their agent's. Optional rather than required because
   * every authority decision above ignores it: an agent may do exactly what its
   * holder may, and only the record of what happened cares which it was. */
  source?: "browser" | "mcp";
};

/** The outcome of resolving CMS access for a request. A closed union rather
 * than a boolean, because the three cases get three different responses: a
 * redirect to sign in, a 404 that reveals nothing, and the editor itself. */
export type CmsAccess =
  | { kind: "anonymous" }
  | { kind: "forbidden"; userId: string }
  | { kind: "member"; actor: CmsActor };

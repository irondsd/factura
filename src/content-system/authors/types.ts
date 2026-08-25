/** A person credited on a published page. The vocabulary the CMS writes and the
 * public renderer reads, in the shared content system for the same reason
 * `ContentCategory` is: neither side owns the shape.
 *
 * Deliberately not the CMS `cms_member` row. A member may sign in; an author is
 * a byline. Revoking someone's console access must not rewrite the attribution
 * of everything they wrote. */
export type ContentAuthor = {
  id: string;
  name: string;
  /** One line of standing — «10 años construyendo sitios web». */
  tagline: string | null;
  jobTitle: string | null;
  /** Media-library id of the portrait, never a URL. */
  imageMediaId: string | null;
  /** The future `/autores/<slug>` address. Null until that page exists. */
  slug: string | null;
  /** Long-form biography, for the author page. Nothing reads it yet. */
  about: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/** What the public site needs about one credited person: enough to build a
 * schema.org `Person`, and nothing more. Lives here rather than beside the
 * query that produces it so the structured-data builders — which are pure and
 * run in the browser bundle's type space — can name it without importing a
 * `server-only` module. */
export type AuthorRef = {
  id: string;
  name: string;
  /** Null until `/autores/<slug>` exists. Without it the Person node is
   * anonymous — valid markup, just not addressable. */
  slug: string | null;
  jobTitle: string | null;
  tagline: string | null;
  /** Absolute URL of the portrait, or null. */
  image: string | null;
};

/** The two roles a page can credit. One list, two slots: the same people write
 * and check each other's work.
 *
 * `author` is who wrote it. `factChecker` is who verified the numbers — the
 * page's `reviewedBy` in structured data, and «Verificado por» wherever it
 * eventually shows. */
export const AUTHOR_ROLE_FIELDS = ["authorId", "factCheckerId"] as const;

export type AuthorRoleField = (typeof AUTHOR_ROLE_FIELDS)[number];

/** The author ids one metadata blob names, de-duplicated and lowercased.
 *
 * Pure, and shared by every caller that needs the question answered: the public
 * article routes resolving a byline, the validator checking the ids exist, and
 * the CMS asking which pages credit someone. */
export function authorIdsIn(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const record = metadata as Record<string, unknown>;
  const ids = AUTHOR_ROLE_FIELDS.map((field) => record[field]).filter(
    (value): value is string => typeof value === "string" && value !== "",
  );
  return [...new Set(ids.map((id) => id.toLowerCase()))];
}

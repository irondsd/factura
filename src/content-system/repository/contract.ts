import type { ContentDocument, ContentSection, ContentSummary } from "../types";

// The read contract the public site codes against (cms.md §6). Introduced
// before any route changes so the cutover in Phase 7 is a change of
// implementation, not a change of shape: a filesystem-backed and a
// PostgreSQL-backed repository both satisfy this, and the composite that mixes
// them does too.

export interface ContentRepository {
  /** One page by its public path. May return a `preview` page so a shared
   * preview URL renders; never returns a `draft` to a public caller. Returns
   * null for "no such page" *and* for "exists but not publicly renderable" —
   * the caller cannot tell the difference, which is the point. */
  getByPath(
    section: ContentSection,
    slug: string[],
  ): Promise<ContentDocument | null>;

  /** Everything publicly listable: indexes, category hubs, related content,
   * sitemap, feed, `llms.txt`, OG routes. `published` only. Newest first. */
  listPublished(section: ContentSection): Promise<ContentSummary[]>;

  /** Everything a public URL would render — `published` plus `preview`. For
   * the few callers that need to know a path resolves at all, such as
   * `generateStaticParams`. Never feed this to a listing. */
  listPubliclyRenderable(section: ContentSection): Promise<ContentSummary[]>;
}

/** Slug arrays are how the sections differ: `/guias/[slug]` is one segment,
 * `/estadisticas/[...slug]` can be several. Joined with "/" for storage so one
 * column serves both. */
export const pathToSlug = (segments: string[]): string => segments.join("/");

export const slugToPath = (slug: string): string[] => slug.split("/");

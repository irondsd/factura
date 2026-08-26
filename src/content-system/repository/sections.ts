import "server-only";
import { unstable_cache } from "next/cache";
import {
  CONTENT_SECTIONS,
  type ContentDocument,
  type ContentSection,
  type ContentSummary,
} from "../types";
import { slugToPath } from "./contract";
import { publicContentRepository } from "./public";
import { contentTag } from "./tags";

// The cached public read model for every CMS-backed content section.
//
// Two things live here rather than in `PostgresContentRepository`, for the same
// reasons they do for guides:
//
//  1. **The lifecycle rule.** Every read below goes through the repository, so
//     a `draft` is invisible to a public caller by construction. `section.ts`
//     used to reach for `documentFromDatabase`, which answers "whatever is
//     stored" and is explicitly not for rendering — that is how a draft ended
//     up serving 200 at its real URL.
//
//  2. **The cache.** cms.md puts the one-hour TTL at the call site, where
//     `revalidate` is a literal Next can see. Without it these routes prerender
//     with no revalidation at all, and a published edit never reaches the site
//     until the next deployment. The TTL is the floor; the section's cache tag
//     is what the CMS expires on publish so the wait is not an hour
//     (`@/cms/server/invalidation`). Every read below has to carry it.
//
// One cached repository per section, built once at module load. The section is in
// the cache key, and `unstable_cache` adds the function's own arguments, so a
// path lookup is keyed by section *and* slug.

type CachedSection = {
  listPublished: () => Promise<ContentSummary[]>;
  listPubliclyRenderable: () => Promise<ContentSummary[]>;
  getByPath: (slug: string) => Promise<ContentDocument | null>;
  redirectFor: (slug: string) => Promise<string[] | null>;
};

function cachedSection(section: ContentSection): CachedSection {
  const tags = [contentTag(section)];
  return {
    listPublished: unstable_cache(
      () => publicContentRepository.listPublished(section),
      ["content", section, "published"],
      { revalidate: 3600, tags },
    ),
    listPubliclyRenderable: unstable_cache(
      () => publicContentRepository.listPubliclyRenderable(section),
      ["content", section, "renderable"],
      { revalidate: 3600, tags },
    ),
    getByPath: unstable_cache(
      (slug: string) =>
        publicContentRepository.getByPath(section, slugToPath(slug)),
      ["content", section, "path"],
      { revalidate: 3600, tags },
    ),
    // Same tag as the rest: a rename expires the section, so an old path stops
    // being a cached 404 and becomes a cached redirect on the next request.
    redirectFor: unstable_cache(
      (slug: string) =>
        publicContentRepository.redirectFor(section, slugToPath(slug)),
      ["content", section, "redirect"],
      { revalidate: 3600, tags },
    ),
  };
}

const CACHED = Object.fromEntries(
  CONTENT_SECTIONS.map((section) => [section, cachedSection(section)]),
) as Record<ContentSection, CachedSection>;

/** The cached reads for one registry section, or `undefined` for a section that
 * has none — `normativa` is a hand-built page, not CMS content. */
export const sectionRepository = (id: string): CachedSection | undefined =>
  Object.hasOwn(CACHED, id) ? CACHED[id as ContentSection] : undefined;

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
//  2. **The cache.** These reads are cached indefinitely and expire only when
//     the CMS calls `revalidateTag` (`@/cms/server/invalidation`) — that is the
//     documented contract for `revalidate: false`: cache until a matching
//     `revalidateTag()`. There was a one-hour TTL here as well, written before
//     on-demand invalidation existed and left in place after. It bought nothing
//     the tag does not already do, and it put every content route on an hourly
//     regeneration cycle whose output Vercel re-stores as ISR writes. So the
//     tag is now the whole mechanism, and every read below has to carry one: a
//     read without a tag is a read the CMS cannot expire at all.
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
      { revalidate: false, tags },
    ),
    listPubliclyRenderable: unstable_cache(
      () => publicContentRepository.listPubliclyRenderable(section),
      ["content", section, "renderable"],
      { revalidate: false, tags },
    ),
    getByPath: unstable_cache(
      (slug: string) =>
        publicContentRepository.getByPath(section, slugToPath(slug)),
      ["content", section, "path"],
      { revalidate: false, tags },
    ),
    // Same tag as the rest: a rename expires the section, so an old path stops
    // being a cached 404 and becomes a cached redirect on the next request.
    redirectFor: unstable_cache(
      (slug: string) =>
        publicContentRepository.redirectFor(section, slugToPath(slug)),
      ["content", section, "redirect"],
      { revalidate: false, tags },
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

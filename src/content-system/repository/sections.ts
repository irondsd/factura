import "server-only";
import { unstable_cache } from "next/cache";
import type { ContentDocument, ContentSection, ContentSummary } from "../types";
import { slugToPath } from "./contract";
import { publicContentRepository } from "./public";

// The public read model for the registry sections — `/estadisticas` and
// `/investigaciones` — and the exact counterpart of `./guias.ts`.
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
//  2. **The cache.** cms.md §3.3 puts the one-hour TTL at the call site, where
//     `revalidate` is a literal Next can see. Without it these routes prerender
//     with no revalidation at all, and a published edit never reaches the site
//     until the next deployment.
//
// One cached triple per section, built once at module load. The section is in
// the cache key, and `unstable_cache` adds the function's own arguments, so a
// path lookup is keyed by section *and* slug.

type CachedSection = {
  listPublished: () => Promise<ContentSummary[]>;
  listPubliclyRenderable: () => Promise<ContentSummary[]>;
  getByPath: (slug: string) => Promise<ContentDocument | null>;
};

function cachedSection(section: ContentSection): CachedSection {
  return {
    listPublished: unstable_cache(
      () => publicContentRepository.listPublished(section),
      ["content", section, "published"],
      { revalidate: 3600 },
    ),
    listPubliclyRenderable: unstable_cache(
      () => publicContentRepository.listPubliclyRenderable(section),
      ["content", section, "renderable"],
      { revalidate: 3600 },
    ),
    getByPath: unstable_cache(
      (slug: string) =>
        publicContentRepository.getByPath(section, slugToPath(slug)),
      ["content", section, "path"],
      { revalidate: 3600 },
    ),
  };
}

const CACHED: Record<string, CachedSection> = {
  estadisticas: cachedSection("estadisticas"),
  investigacion: cachedSection("investigacion"),
};

/** The cached reads for one registry section, or `undefined` for a section that
 * has none — `normativa` is a hand-built page, not CMS content. */
export const sectionRepository = (id: string): CachedSection | undefined =>
  CACHED[id];

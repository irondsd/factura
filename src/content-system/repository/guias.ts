import "server-only";
import { unstable_cache } from "next/cache";
import type { ContentCategory } from "../categories/types";
import { relatedDocuments } from "../document";
import { contentTag } from "./tags";
import type { ContentDocument, ContentSummary } from "../types";
import { publicContentRepository } from "./public";
import {
  contentByPrimaryCategory,
  contentInCategory,
  nonEmptyContentCategories,
} from "./categories";

// The public guides read model. Keeping the cache at this call site (rather
// than inside PostgresContentRepository) lets the CMS use the same repository
// uncached while making the public one-hour TTL explicit and testable.
// `revalidate` must remain a literal for Next's static analysis.
//
// The TTL is the floor, not the mechanism: the tag is what the CMS expires the
// moment a publicly visible page changes, so an editor does not wait an hour
// (see `@/cms/server/invalidation`). Every cached read below carries it, and a
// read that forgets it is a surface that keeps serving the old copy after a
// publish — with no symptom until an hour later.
const TAGS = [contentTag("guias")];

const listPublishedGuides = unstable_cache(
  () => publicContentRepository.listPublished("guias"),
  ["content", "guias", "published"],
  { revalidate: 3600, tags: TAGS },
);

const listRenderableGuides = unstable_cache(
  () => publicContentRepository.listPubliclyRenderable("guias"),
  ["content", "guias", "renderable"],
  { revalidate: 3600, tags: TAGS },
);

const getGuideBySlug = unstable_cache(
  (slug: string) => publicContentRepository.getByPath("guias", [slug]),
  ["content", "guias", "path"],
  { revalidate: 3600, tags: TAGS },
);

// Cached under the same tag as everything else, which is what makes a rename
// visible immediately: the rename expires the section, so the old path stops
// being a cached 404 and starts being a cached redirect on the next request.
const getGuideRedirect = unstable_cache(
  (slug: string) => publicContentRepository.redirectFor("guias", [slug]),
  ["content", "guias", "redirect"],
  { revalidate: 3600, tags: TAGS },
);

/** Published guides only: safe for every discovery surface. */
export const publishedGuides = (): Promise<ContentSummary[]> =>
  listPublishedGuides();

/** Published and shareable-preview guides, for static paths only. */
export const publiclyRenderableGuides = (): Promise<ContentSummary[]> =>
  listRenderableGuides();

/** A public URL may resolve a `preview`, but never a draft. */
export const publicGuideBySlug = (
  slug: string,
): Promise<ContentDocument | null> => getGuideBySlug(slug);

/** Where a guide path that no longer holds a page should send the reader — the
 * guide's current slug, or null. Asked only after a miss. */
export const guideRedirect = async (slug: string): Promise<string | null> =>
  (await getGuideRedirect(slug))?.join("/") ?? null;

export const primaryCategoryOf = (
  guide: Pick<ContentSummary, "metadata">,
): string => guide.metadata.categories[0] ?? "";

export async function guidesInCategory(key: string): Promise<ContentSummary[]> {
  return contentInCategory("guias", key);
}

export async function guidesByPrimaryCategory(): Promise<
  { category: ContentCategory; guides: ContentSummary[]; total: number }[]
> {
  return (await contentByPrimaryCategory("guias")).map(
    ({ category, pages, total }) => ({ category, guides: pages, total }),
  );
}

export const nonEmptyCategories = (): Promise<ContentCategory[]> =>
  nonEmptyContentCategories("guias");

export async function relatedGuides(
  guide: Pick<ContentSummary, "slug" | "metadata">,
  limit = 3,
): Promise<ContentSummary[]> {
  return relatedDocuments(guide, await publishedGuides(), limit);
}

import "server-only";
import { unstable_cache } from "next/cache";
import {
  CATEGORIES,
  type Category,
  type CategoryId,
} from "@/content/guias/categories";
import { relatedDocuments } from "../document";
import type { ContentDocument, ContentSummary } from "../types";
import { publicContentRepository } from "./public";

// The public guides read model. Keeping the cache at this call site (rather
// than inside PostgresContentRepository) lets the CMS use the same repository
// uncached while making the public one-hour TTL explicit and testable.
// `revalidate` must remain a literal for Next's static analysis.
const listPublishedGuides = unstable_cache(
  () => publicContentRepository.listPublished("guias"),
  ["content", "guias", "published"],
  { revalidate: 3600 },
);

const listRenderableGuides = unstable_cache(
  () => publicContentRepository.listPubliclyRenderable("guias"),
  ["content", "guias", "renderable"],
  { revalidate: 3600 },
);

const getGuideBySlug = unstable_cache(
  (slug: string) => publicContentRepository.getByPath("guias", [slug]),
  ["content", "guias", "path"],
  { revalidate: 3600 },
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

export const primaryCategoryOf = (
  guide: Pick<ContentSummary, "metadata">,
): string => guide.metadata.categories[0] ?? "";

export async function guidesInCategory(
  id: CategoryId,
): Promise<ContentSummary[]> {
  return (await publishedGuides()).filter((guide) =>
    guide.metadata.categories.includes(id),
  );
}

export async function guidesByPrimaryCategory(): Promise<
  { category: Category; guides: ContentSummary[]; total: number }[]
> {
  const guides = await publishedGuides();
  return CATEGORIES.map((category) => ({
    category,
    guides: guides.filter((guide) => primaryCategoryOf(guide) === category.id),
    total: guides.filter((guide) =>
      guide.metadata.categories.includes(category.id),
    ).length,
  })).filter((section) => section.guides.length > 0);
}

export async function nonEmptyCategories(): Promise<Category[]> {
  const guides = await publishedGuides();
  return CATEGORIES.filter((category) =>
    guides.some((guide) => guide.metadata.categories.includes(category.id)),
  );
}

export async function relatedGuides(
  guide: Pick<ContentSummary, "slug" | "metadata">,
  limit = 3,
): Promise<ContentSummary[]> {
  return relatedDocuments(guide, await publishedGuides(), limit);
}

import "server-only";
import type { ContentCategory } from "../categories/types";
import { relatedDocuments } from "../document";
import type { ContentDocument, ContentSummary } from "../types";
import { fold } from "../validation/text";
import { sectionRepository } from "./sections";
import {
  contentByPrimaryCategory,
  contentInCategory,
  nonEmptyContentCategories,
} from "./categories";

// Guides have guide-specific category and related-content helpers below, but
// their lifecycle and cache are the same cached section repository as every
// other CMS-backed page.
const guides = sectionRepository("guias")!;

/** Published guides only: safe for every discovery surface. */
export const publishedGuides = (): Promise<ContentSummary[]> =>
  guides.listPublished();

/** Published and shareable-preview guides, for static paths only. */
export const publiclyRenderableGuides = (): Promise<ContentSummary[]> =>
  guides.listPubliclyRenderable();

/** A public URL may resolve a `preview`, but never a draft. */
export const publicGuideBySlug = (
  slug: string,
): Promise<ContentDocument | null> => guides.getByPath(slug);

/** Where a guide path that no longer holds a page should send the reader — the
 * guide's current slug, or null. Asked only after a miss. */
export const guideRedirect = async (slug: string): Promise<string | null> =>
  (await guides.redirectFor(slug))?.join("/") ?? null;

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

/** Every published guide about one company: those whose `vendor` names it.
 * What `<RelatedGuides />` lists on a /proveedores page. Case and accents are
 * folded, so "MetroGAS" and "Metrogas" are one company; anything looser (Telecom
 * vs Personal) is an editorial choice the `vendor` values have to make. */
export async function guidesForVendor(
  vendor: string | undefined,
): Promise<ContentSummary[]> {
  const wanted = vendor ? fold(vendor.trim()) : "";
  if (!wanted) return [];
  return (await publishedGuides())
    .filter(
      (guide) =>
        !guide.canonicalSlug &&
        fold(guide.metadata.vendor?.trim() ?? "") === wanted,
    )
    .sort((a, b) => a.title.localeCompare(b.title, "es"));
}

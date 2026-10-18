import "server-only";
import type { ContentCategory } from "../categories/types";
import { unstable_cache } from "next/cache";
import { RAIL_LIMIT, relatedDocuments } from "../document";
import type { ContentDocument, ContentSummary } from "../types";
import { fold } from "../validation/text";
import { publicContentRepository } from "./public";
import { sectionRepository } from "./sections";
import { contentRailTag } from "./tags";
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

/** One guide's related rail: the pages it links to and the titles it shows.
 *
 * Cached per guide under its own tag (`contentRailTag`), and deliberately not
 * read through `publishedGuides()`. A route inherits the tags of the cached
 * reads it runs, and that list carries the section tag — which made every
 * article in the section a route every publication refreshed, at one ISR
 * write each, when a publication moves ~3 rails. A cached read nested inside
 * this one contributes no tag of its own, but it would still bypass its cache,
 * so the candidates are read directly, in the slim shape the rail needs.
 *
 * The CMS refreshes exactly the rails a write moved (`@/cms/server/rails`).
 * The guide's own categories and locations are part of the key as well, so a
 * guide whose classification changed never reads a rail ranked for the old
 * one even if a refresh were missed. */
export async function relatedGuides(
  guide: Pick<ContentSummary, "slug" | "metadata">,
  limit = RAIL_LIMIT,
): Promise<{ slug: string; title: string }[]> {
  return unstable_cache(
    async (
      slug: string,
      categories: readonly string[],
      locations: readonly string[],
      size: number,
    ) =>
      relatedDocuments(
        { slug, metadata: { categories, locations } },
        await publicContentRepository.listRailCandidates("guias"),
        size,
      ).map(({ slug: related, title }) => ({ slug: related, title })),
    ["content", "guias", "rail"],
    { revalidate: false, tags: [contentRailTag("guias", guide.slug)] },
  )(
    guide.slug,
    guide.metadata.categories ?? [],
    guide.metadata.locations ?? [],
    limit,
  );
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

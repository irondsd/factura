import type { Metadata } from "next";
import { guideMetadata } from "@/i18n/metadata";
import { shouldNoindex, UNPUBLISHED_ROBOTS } from "../repository/visibility";
import type { ContentDocument, ContentSummary } from "../types";

// Page metadata built from a `ContentDocument`, for the public routes after the
// Phase 7 cutover — and defined here, now, because the rule it encodes is a
// lifecycle rule and belongs beside the lifecycle.
//
// It delegates to `guideMetadata`, which the filesystem route already uses, so
// there is one definition of a guide's `<head>` and the cutover changes where
// the *data* comes from rather than what is emitted.

/** The `<head>` for one content page.
 *
 * The lifecycle rule: anything that is not `published` is `noindex, nofollow`.
 * A `preview` page renders at its real URL on purpose — that is what makes the
 * link shareable — so the markup is the only thing standing between it and a
 * search index, and it is not optional. `shouldNoindex` is the same function
 * the repository uses, so "which states are public" has one answer. */
export function contentPageMetadata(
  document: Pick<
    ContentSummary,
    | "slug"
    | "status"
    | "title"
    | "titleTag"
    | "description"
    | "canonicalSlug"
    | "metadata"
    | "publishedAt"
    | "contentUpdatedAt"
  >,
): Metadata {
  const noindex = shouldNoindex(document.status);

  const base = guideMetadata({
    slug: document.slug,
    title: document.title,
    titleTag: document.titleTag ?? undefined,
    description: document.description,
    ogTitle: document.metadata.ogTitle,
    ogDescription: document.metadata.ogDescription,
    keywords: document.metadata.keywords ?? [],
    published: document.publishedAt ?? document.contentUpdatedAt,
    updated: document.contentUpdatedAt,
    // A page that is not published does not consolidate ranking onto anything:
    // it has none to give, and a canonical from a `noindex` URL is a mixed
    // signal. Dropped rather than emitted.
    canonical: noindex ? undefined : (document.canonicalSlug ?? undefined),
    noindex,
  });

  if (!noindex) return base;

  // `buildMetadata`'s own `noindex` keeps `follow: true` on purpose — a page
  // there is "unlisted, not disowned". The stricter pair cms.md asks for
  // is applied here rather than in `buildMetadata`, which every other page on
  // the site shares, and comes from `UNPUBLISHED_ROBOTS` so the registry
  // sections emit exactly the same thing.
  return { ...base, robots: { ...UNPUBLISHED_ROBOTS } };
}

/** Whether this page belongs in the sitemap, the feed, `llms.txt` and IndexNow.
 * A convenience over the repository's own rule, so a discovery route reads as
 * what it means. */
export const isDiscoverablePage = (
  document: Pick<ContentDocument, "status">,
): boolean => !shouldNoindex(document.status);

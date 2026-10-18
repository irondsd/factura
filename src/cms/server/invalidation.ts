import "server-only";
import { revalidateTag } from "next/cache";
import {
  contentCategoriesTag,
  contentDocumentsTag,
  contentDocumentTag,
  contentRenderableTag,
  contentTag,
  insightsTag,
  locationsTag,
} from "@/content-system/repository/tags";
import { CONTENT_SECTIONS, type ContentSection } from "@/content-system/types";

// On-demand invalidation of the public content cache (cms.md).
//
// Before this, publishing meant waiting out an hour-long `unstable_cache` TTL
// and hoping the next visitor was the one who paid for the refresh. The tags
// are attached in `@/content-system/repository/tags`; this is the other half —
// the CMS expiring them the moment it changes something a reader can see.
//
// That TTL is gone now (`repository/sections.ts`), which promotes this file
// from "the fast path" to "the only path": a public read expires when something
// here says so, and otherwise not until the next deployment.
//
// *Which* writes reach here is decided in `./lifecycle`, and the answer for
// most of them is "none": a draft is invisible, so saving one leaves nothing
// cached that is now wrong.

/** How the content service expires the public cache. Injected rather than
 * imported by the service so a test can watch the decision without a Next.js
 * request context, which `revalidateTag` requires and a unit test has not
 * got. */
export type PublicCacheInvalidator = (
  section: ContentSection,
  slugs?: readonly string[],
  scope?: PublicCacheScope,
) => void;

/** How far a write reaches.
 *
 * - `"listings"` (the default): something every listing can show moved — a
 *   page went up, came down, or changed what the index, the category hubs, the
 *   related rails, the sitemap and the feed say about it.
 * - `"page"`: only the named pages' own addresses changed. A public preview
 *   appearing, refreshing or going back to draft is this: a preview is never
 *   listed, so the only other readers are the tree sections' breadcrumbs, which
 *   follow `contentRenderableTag`. */
export type PublicCacheScope = "listings" | "page";

/** Expire what the public site has cached for one section.
 *
 * `revalidateTag`, not `updateTag`, because this runs under both transports and
 * cms.md allows only one implementation: `updateTag` throws outside a Server
 * Action, and the CMS MCP is a Route Handler.
 *
 * **What this costs.** Every route a tag reaches is regenerated on its next
 * request and stored again, and Vercel bills that store as ISR writes (8 KB
 * units, ~10 for a guide) whether or not the page came out different. Its docs
 * say an unchanged regeneration is free; on factura it measurably was not
 * (October 2026: a day whose only refresh was alt text on unused images still
 * cost ~4k units against a 200k/month Hobby cap). So the lever is how many
 * routes a write reaches, not how they are revalidated. The section tag reaches
 * every route in the section (every article reads the section's listing for
 * its related rail), which is why `scope` exists.
 *
 * Two profiles:
 *
 * - **Shared tags are marked stale (`"max"`).** A stale route is served once
 *   more and regenerated in the background instead of blocking a visitor. That
 *   is safe because a route's regeneration re-reads stale data in the
 *   foreground (Next's `unstable_cache` blocks on a stale entry while the page
 *   is being generated), so the regenerated page never captures the old list.
 * - **The changed pages expire now (`{ expire: 0 }`).** One mutable copy means
 *   "unpublish" has to actually take the page down, and stale-while-revalidate
 *   would serve the withdrawn copy to the next visitor. Each named slug's
 *   document tag reaches its own route, and the cached 404 of a slug that did
 *   not resolve until this write.
 *
 * Without `slugs` (a category, author or media edit) no single page was taken
 * up or down, so the whole section's documents and its category rows are
 * marked stale.
 *
 * Neither the section tag nor this reaches the articles' related rails, which
 * have a tag per page; `./rails` refreshes the ones a write moved. */
export function revalidatePublicContent(
  section: ContentSection,
  slugs?: readonly string[],
  scope: PublicCacheScope = "listings",
): void {
  revalidateTag(
    scope === "page" ? contentRenderableTag(section) : contentTag(section),
    "max",
  );
  if (!slugs) {
    revalidateTag(contentDocumentsTag(section), "max");
    revalidateTag(contentCategoriesTag(section), "max");
    return;
  }
  for (const slug of slugs) {
    revalidateTag(contentDocumentTag(section, slug), { expire: 0 });
  }
}

/** Registry copy appears across every section and all global location hubs. */
export function revalidatePublicLocations(): void {
  revalidateTag(locationsTag, "max");
  for (const section of CONTENT_SECTIONS) {
    revalidatePublicContent(section);
  }
}

/** The «destacados» rails — the homepage and the four section indexes. The
 * pages an insight points at keep their own tags; only the list moved. */
export function revalidatePublicInsights(): void {
  revalidateTag(insightsTag, "max");
}

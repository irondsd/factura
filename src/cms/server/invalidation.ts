import "server-only";
import { revalidateTag } from "next/cache";
import {
  contentDocumentsTag,
  contentDocumentTag,
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
) => void;

/** Expire everything the public site has cached for one section.
 *
 * `revalidateTag`, not `updateTag`, because this runs under both transports and
 * cms.md allows only one implementation: `updateTag` throws outside a Server
 * Action, and the CMS MCP is a Route Handler.
 *
 * Two profiles, because the section tag and a page's own tag answer different
 * questions:
 *
 * - **The section tag is marked stale (`"max"`).** Every route in the section
 *   carries it, because every article's related rail reads the section's
 *   listing. With `{ expire: 0 }` each of those routes was *deleted* (Vercel
 *   logs it as `cacheReason: delete_tag`), and a deleted entry has no previous
 *   copy to compare with, so its regeneration appears to be billed as a full
 *   ISR write even when it comes out byte-identical. In October 2026 a guide
 *   publish cost ~1.4k write units on prod, against a 200k/month Hobby cap,
 *   when locally only ~9 routes' bytes changed. Marked stale instead, a route is regenerated in the
 *   background and an unchanged one costs nothing. The price is one visitor
 *   per route seeing the old listing once. That is safe because a route's
 *   regeneration re-reads stale data in the foreground (Next's `unstable_cache`
 *   blocks on a stale entry while the page is being generated), so the
 *   regenerated page never captures the old listing permanently.
 * - **The changed pages expire now (`{ expire: 0 }`).** One mutable copy means
 *   "unpublish" has to actually take the page down, and stale-while-revalidate
 *   would serve the withdrawn copy to the next visitor. Each named slug's
 *   document tag reaches its own route, and the cached 404 of a slug that did
 *   not resolve until this write, so those block for one request and are right
 *   from then on.
 *
 * Without `slugs` (a category, author or media edit) no single page was taken
 * up or down, so the whole section's documents are marked stale too, not
 * deleted. */
export function revalidatePublicContent(
  section: ContentSection,
  slugs?: readonly string[],
): void {
  revalidateTag(contentTag(section), "max");
  if (!slugs) {
    revalidateTag(contentDocumentsTag(section), "max");
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

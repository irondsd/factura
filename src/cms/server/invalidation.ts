import "server-only";
import { revalidateTag } from "next/cache";
import { contentTag } from "@/content-system/repository/tags";
import type { ContentSection } from "@/content-system/types";

// On-demand invalidation of the public content cache (cms.md §3.3, Task 4).
//
// Before this, publishing meant waiting out the one-hour `unstable_cache` TTL
// and hoping the next visitor was the one who paid for the refresh. The tags
// are attached in `@/content-system/repository/tags`; this is the other half —
// the CMS expiring them the moment it changes something a reader can see.
//
// *Which* writes reach here is decided in `./lifecycle`, and the answer for
// most of them is "none": a draft is invisible, so saving one leaves nothing
// cached that is now wrong.

/** How the content service expires the public cache. Injected rather than
 * imported by the service so a test can watch the decision without a Next.js
 * request context, which `revalidateTag` requires and a unit test has not
 * got. */
export type PublicCacheInvalidator = (section: ContentSection) => void;

/** Expire everything the public site has cached for one section.
 *
 * `revalidateTag`, not `updateTag`, because this runs under both transports and
 * §2.2 allows only one implementation: `updateTag` throws outside a Server
 * Action, and the CMS MCP is a Route Handler. `{ expire: 0 }` rather than the
 * `"max"` profile for the same reason the CMS has no revision history — one
 * mutable copy means "unpublish" has to actually take the page down, and
 * stale-while-revalidate would serve the withdrawn copy to the next visitor
 * while it fetched. Blocking that one request is the point.
 *
 * Section-wide because a page is never the only thing that changed: its
 * section index, the category hubs, the related rail, the sitemap, the feed and
 * `llms.txt` all carry the same tag, and so does the cached 404 of a slug that
 * did not resolve until this write. */
export function revalidatePublicContent(section: ContentSection): void {
  revalidateTag(contentTag(section), { expire: 0 });
}

import type { ContentSection } from "../types";

// The cache tags the public read model attaches to everything it caches, and
// the CMS invalidates when it changes something the public can see (cms.md
// §3.3, Task 4). It lives here rather than in `src/cms` because the tag is a
// property of the *read*: whoever writes the `unstable_cache` call is the only
// one who can guarantee the tag is on it, and `src/content-system` may not
// import `src/cms` anyway (§2.2).
//
// One tag per section, not one per page. Every published save can move a
// section's listings too — a title or summary shows up in the index, the
// category hub, the related-articles rail, the feed and `llms.txt` — so a
// page-level tag would have to be invalidated together with the section tag on
// essentially every write, and would only add a second thing to keep in sync.
//
// Nothing else has to be tagged by hand: a route that renders while one of
// these cached reads runs inherits its tags on its own cache entry, which is
// what makes one `revalidateTag` reach the article, the indexes, the category
// hubs, the sitemap, the feed, `llms.txt` — and the cached 404 of a path that
// had no page yet.

/** Everything the public site reads out of one CMS section. */
export const contentTag = (section: ContentSection): string =>
  `content:${section}`;

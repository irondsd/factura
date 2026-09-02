import type { ContentSection } from "../types";

// The cache tags the public read model attaches to everything it caches, and
// the CMS invalidates when it changes something the public can see (cms.md
// cms.md). It lives here rather than in `src/cms` because the tag is a
// property of the *read*: whoever writes the `unstable_cache` call is the only
// one who can guarantee the tag is on it, and `src/content-system` may not
// import `src/cms` anyway (cms.md).
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
//
// What inheritance does *not* buy is an order. Expiring a tag promises that
// every entry carrying it will be rebuilt, not that the routes are rebuilt
// after the reads they depend on. A route purged from the CDN and re-rendered
// before a data-cache entry it reads has caught up produces a wrong page, and —
// with no TTL anywhere in this scheme — that page is then correct-looking and
// permanent. So the surfaces that aggregate several of these reads at once
// (`sitemap.ts`, `feed.xml`, `llms.txt`) carry an hourly `revalidate` as a
// repair floor. Two things follow for anything added here. A read that skips
// the cache contributes no tag and is not simply "fresher" — it makes the route
// disagree with itself, which is what it did in `repository/categories.ts`. And
// a new site-wide surface built on several of these reads wants the same floor.

/** Everything the public site reads out of one CMS section. */
export const contentTag = (section: ContentSection): string =>
  `content:${section}`;

/** The one global registry read by articles, hubs and discovery surfaces. */
export const locationsTag = "content:locations";

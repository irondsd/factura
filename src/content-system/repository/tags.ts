import type { ContentSection } from "../types";

// The cache tags the public read model attaches to everything it caches, and
// the CMS invalidates when it changes something the public can see (cms.md
// cms.md). It lives here rather than in `src/cms` because the tag is a
// property of the *read*: whoever writes the `unstable_cache` call is the only
// one who can guarantee the tag is on it, and `src/content-system` may not
// import `src/cms` anyway (cms.md).
//
// Listings are tagged per section: every published save can move them — a
// title or summary shows up in the index, the category hub, the related-articles
// rail, the feed and `llms.txt` — so the section tag is expired on every public
// write. Single documents are the exception, tagged per page as well as per
// section (`contentDocumentTag`, `contentDocumentsTag`). A document read is the
// one read whose answer depends on nothing but its own row, and under the
// section tag one publish expired every document in the section: each page's
// next render then re-read its full body from the database even though only
// its related rail had moved. That was a whole section's worth of bodies of
// database egress per publish, on a plan metered by the byte.
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

/** One document's cached read, by its path. Expired with the section tag when
 * that page's public copy changes — including the cached `null` of a path that
 * did not resolve until now. */
export const contentDocumentTag = (
  section: ContentSection,
  slug: string,
): string => `content:${section}:doc:${slug}`;

/** Every document read of one section, for the writes that cannot name the
 * pages they touched: a rename that moves a subtree, a registry change. */
export const contentDocumentsTag = (section: ContentSection): string =>
  `content:${section}:docs`;

/** The one global registry read by articles, hubs and discovery surfaces. */
export const locationsTag = "content:locations";

/** The «destacados» list. Its own tag rather than a section's: one insight can
 * surface on the homepage and its section index, and editing it should not
 * rebuild every article in that section. What an insight *derives* from its
 * page (address, category, whether it is published) is read through the
 * section's own cached reads, so a route rendering insights also carries
 * those sections' tags. */
export const insightsTag = "content:insights";

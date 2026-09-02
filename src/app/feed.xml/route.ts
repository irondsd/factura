import { publishedGuides } from "@/content-system/repository/guias";
import { contentCategories } from "@/content-system/repository/categories";
import { CONTENT_SECTIONS } from "@/content-system/types";
import { SECTIONS } from "@/content/sections";
import { siteName } from "@/config/meta";
import { siteUrl } from "@/config/urls";
import { guideUrl, sectionUrl } from "@/i18n/metadata";

// Build-time generated RSS 2.0 feed over every section that actually publishes:
// the guides, the statistics pages and the research pages. All are Spanish-only,
// so the feed declares `es-AR` and carries no /en items — there is nothing there
// to carry.
//
// Why a feed at all, when the sitemap already lists these URLs: a sitemap says
// "these pages exist", a feed says "these pages changed, newest first". That's
// what aggregators and the content-ingestion pipelines behind the LLM crawlers
// subscribe to, and it's the cheapest way for anything watching the site to
// learn about a monthly statistics refresh without recrawling 78 URLs.
//
// `force-static` prerenders it once per build, like /llms.txt and the rest of
// the static site.
export const dynamic = "force-static";
// A repair floor for the same reason the sitemap has one, and the comment there
// is the long version: every read below is cached with `revalidate: false`, so
// a render that ran while one of those entries was purged but not yet refreshed
// would otherwise be served as a fresh `HIT` until the next unrelated publish.
// The tag is still the update path — this only bounds how long a lost race can
// survive. `force-static` above and a TTL are not in conflict: one says the
// route is prerendered rather than per-request, the other says how long a
// prerender stands.
export const revalidate = 3600;

/** Everything a feed item needs, flattened out of the two content registries so
 * the rendering below doesn't care which section an entry came from. */
type Item = {
  url: string;
  title: string;
  summary: string;
  /** When it first went up — the honest `<pubDate>`. */
  published: string;
  /** When it last changed. The sort key, and `<atom:updated>`. */
  updated: string;
  category: string;
};

/** XML text escaping. `<title>` and `<description>` carry author-written prose
 * with ampersands and quotes in it, and an unescaped `&` is a hard parse error
 * in XML rather than something a reader recovers from. */
const xml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** RSS 2.0 dates are RFC 822, which is not what the content stores (ISO 8601
 * with an offset). `toUTCString()` produces the GMT form the spec's examples
 * use, and it round-trips the instant correctly from any offset. */
const rfc822 = (iso: string): string => new Date(iso).toUTCString();

export async function GET(): Promise<Response> {
  const [guides, sections, categoryLists] = await Promise.all([
    publishedGuides(),
    Promise.all(
      SECTIONS.map(async (section) => ({
        section,
        pages: await section.listed(),
      })),
    ),
    Promise.all(
      CONTENT_SECTIONS.map(async (section) => ({
        section,
        categories: await contentCategories(section),
      })),
    ),
  ]);
  const categoryLabel = new Map(
    categoryLists.flatMap(({ section, categories }) =>
      categories.map((category) => [
        `${section}:${category.key}`,
        category.label,
      ]),
    ),
  );

  const items: Item[] = [
    // Same exclusion the sitemap applies: a guide whose canonical points at
    // another guide is asking not to be the indexed copy, so pushing it to
    // subscribers as a fresh item would contradict its own markup. `noindex` is
    // already gone — `listedGuides` dropped it.
    ...guides
      .filter((g) => !g.canonicalSlug)
      .map((g) => ({
        url: guideUrl(g.slug),
        title: g.title,
        summary: g.summary,
        published: g.publishedAt ?? g.contentUpdatedAt,
        updated: g.contentUpdatedAt,
        // The primary category — the first id, the one that decides where the
        // guide is grouped everywhere else. Falls back to the section name so a
        // category id that outlives its registry entry can't drop the item.
        category:
          categoryLabel.get(`guias:${g.metadata.categories[0]}`) ?? "Guías",
      })),
    ...sections.flatMap(({ section, pages }) =>
      pages.map((p) => ({
        url: sectionUrl(section.id, p.slug),
        title: p.meta.title,
        summary: p.meta.summary,
        published: p.meta.published,
        updated: p.meta.updated,
        category:
          categoryLabel.get(`${section.id}:${p.meta.categoryKeys[0] ?? ""}`) ??
          section.label,
      })),
    ),
  ];

  // Newest change first. `updated` rather than `published` is the whole point
  // for the data sections: those pages are republished every month as IDECBA
  // and INDEC publish, and a feed sorted by original publication date would
  // never resurface them.
  items.sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated));

  const lastBuild = items.length
    ? rfc822(items[0].updated)
    : rfc822(new Date().toISOString());

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xml(siteName)} — Noticias, Guías, Estadísticas e Investigación</title>
    <link>${siteUrl}</link>
    <description>Noticias y guías sobre las facturas del hogar en Argentina, estadísticas de precios, alquileres y servicios, e investigaciones que las cruzan.</description>
    <language>es-AR</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml"/>
${items
  .map(
    (item) => `    <item>
      <title>${xml(item.title)}</title>
      <link>${xml(item.url)}</link>
      <description>${xml(item.summary)}</description>
      <category>${xml(item.category)}</category>
      <pubDate>${rfc822(item.published)}</pubDate>
      <atom:updated>${new Date(item.updated).toISOString()}</atom:updated>
      <guid isPermaLink="true">${xml(item.url)}</guid>
    </item>`,
  )
  .join("\n")}
  </channel>
</rss>
`;

  return new Response(body, {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
}

import { listedStatsPages } from "@/content/estadisticas/pages";
import { getCategory } from "@/content/guias/categories";
import { listedGuides } from "@/content/guias/guides";
import { siteName } from "@/config/meta";
import { siteUrl } from "@/config/urls";
import { guideUrl, statsUrl } from "@/i18n/metadata";

// Build-time generated RSS 2.0 feed over the two sections that actually publish:
// the guides and the statistics pages. Both are Spanish-only, so the feed
// declares `es-AR` and carries no /en items — there is nothing there to carry.
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
  const [guides, stats] = await Promise.all([
    listedGuides(),
    listedStatsPages(),
  ]);

  const items: Item[] = [
    // Same exclusion the sitemap applies: a guide whose canonical points at
    // another guide is asking not to be the indexed copy, so pushing it to
    // subscribers as a fresh item would contradict its own markup. `noindex` is
    // already gone — `listedGuides` dropped it.
    ...guides
      .filter((g) => !g.meta.canonical)
      .map((g) => ({
        url: guideUrl(g.slug),
        title: g.meta.title,
        summary: g.meta.summary,
        published: g.meta.published,
        updated: g.meta.updated,
        // The primary category — the first id, the one that decides where the
        // guide is grouped everywhere else. Falls back to the section name so a
        // category id that outlives its registry entry can't drop the item.
        category: getCategory(g.meta.categories[0])?.label ?? "Guías",
      })),
    ...stats.map((p) => ({
      url: statsUrl(p.slug),
      title: p.meta.title,
      summary: p.meta.summary,
      published: p.meta.published,
      updated: p.meta.updated,
      category: "Estadísticas",
    })),
  ];

  // Newest change first. `updated` rather than `published` is the whole point
  // for the statistics half: those pages are republished every month as IDECBA
  // and INDEC publish, and a feed sorted by original publication date would
  // never resurface them.
  items.sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated));

  const lastBuild = items.length
    ? rfc822(items[0].updated)
    : rfc822(new Date().toISOString());

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xml(siteName)} — Guías y Estadísticas</title>
    <link>${siteUrl}</link>
    <description>Guías sobre las facturas del hogar en Argentina y estadísticas de precios, alquileres y servicios, actualizadas cada mes.</description>
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

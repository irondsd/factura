import "server-only";
import type { Metadata } from "next";
import { siteUrl } from "@/config/urls";
import { UNPUBLISHED_ROBOTS } from "@/content-system/repository/visibility";
import { buildMetadata } from "@/lib/seo";
import type { Locale } from "./config";

// Per-page SEO metadata: the URL layer. These are thin wrappers that work out
// which absolute URLs a page has, then hand off to `buildMetadata`
// (src/lib/seo.ts), which owns the actual OG/Twitter/canonical composition.

/** Absolute URL for a landing path in a locale. `path` is the canonical (es)
 * path, e.g. "/" or "/faq". */
export function localeUrl(path: string, locale: Locale): string {
  if (path === "/") return locale === "en" ? `${siteUrl}/en` : siteUrl;
  return locale === "en" ? `${siteUrl}/en${path}` : `${siteUrl}${path}`;
}

/** A bilingual landing page. Spanish (default) lives at the bare path and is the
 * canonical/x-default; English lives under `/en`. Emits `canonical`, `hreflang`
 * alternates, and `og:locale` so Google can index both languages as distinct
 * URLs. */
export function pageMetadata({
  path,
  locale,
  title,
  description,
}: {
  path: string;
  locale: Locale;
  title: string;
  description: string;
}): Metadata {
  const esUrl = localeUrl(path, "es");
  const enUrl = localeUrl(path, "en");
  return buildMetadata({
    url: locale === "en" ? enUrl : esUrl,
    locale,
    title,
    description,
    languages: { "es-AR": esUrl, en: enUrl, "x-default": esUrl },
    alternateLocale: locale === "en" ? "es" : "en",
  });
}

// ── Guides (Spanish-only) ─────────────────────────────────────────────────
// The /guias section exists only in Spanish, so — unlike the bilingual landing
// pages above — it emits NO hreflang alternates (pointing hreflang at a /en URL
// that 404s is an SEO error). Canonical is the bare (es) URL.

/** Absolute canonical URL for the guides index. */
export const guidesIndexUrl = `${siteUrl}/guias`;

/** Absolute canonical URL for a single guide. */
export const guideUrl = (slug: string): string => `${siteUrl}/guias/${slug}`;

/** Absolute canonical URL for a category hub. `/categoria/` keeps these under
 * a static segment so they never collide with a guide slug. */
export const guideCategoryUrl = (id: string): string =>
  `${siteUrl}/guias/categoria/${id}`;

/** The guide's generated social card (see the route for why it isn't the
 * `opengraph-image` file convention).
 *
 * `updated` becomes a `?v=` stamp. Facebook, X and WhatsApp cache a scraped
 * image against its URL for a long time, so without this a card would keep
 * showing the old headline after a guide was retitled — the stamp changes only
 * when the guide does, which is exactly when the picture is stale. */
export const guideCardUrl = (slug: string, updated: string): string =>
  `${siteUrl}/og/guias/${slug}/card.png?v=${updated.slice(0, 10).replace(/-/g, "")}`;

/** Shared metadata for a Spanish-only listing page — the guides index, a
 * category hub, the statistics index. Same treatment throughout; only the
 * canonical URL differs.
 *
 * Titles are absolute here for the same reason the articles' are: these are
 * guides pages, five of the eight category titles are over 50 characters, and
 * appending "— Factura" is what would push them past what a search result
 * shows. */
function listingMetadata(
  url: string,
  title: string,
  description: string,
): Metadata {
  return buildMetadata({
    url,
    locale: "es",
    title,
    titleAbsolute: true,
    description,
  });
}

export function guidesIndexMetadata({
  title,
  description,
}: {
  title: string;
  description: string;
}): Metadata {
  return listingMetadata(guidesIndexUrl, title, description);
}

export function guideCategoryMetadata({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}): Metadata {
  return listingMetadata(guideCategoryUrl(id), title, description);
}

// ── Normativa (Spanish-only) ──────────────────────────────────────────────
// Argentine norms, written about in Spanish. Same treatment as the guides: one
// language, no hreflang alternates, canonical is the bare (es) URL.

/** Absolute canonical URL for the normativa page. */
export const normativaUrl = `${siteUrl}/normativa`;

export function normativaMetadata({
  title,
  description,
}: {
  title: string;
  description: string;
}): Metadata {
  return listingMetadata(normativaUrl, title, description);
}

// ── Registry sections: /estadisticas, /investigaciones (Spanish-only) ─────
// Same treatment as the guides: one language, no hreflang alternates, canonical
// is the bare (es) URL. The only structural difference is that a page's slug is
// a path rather than a single segment — see `content/section.ts`.
//
// Parameterised by the section's `id` rather than written once per section: the
// two differ in a URL segment and nothing else here, and a second copy of these
// five functions is a second place for a `?v=` stamp to go missing.

/** Absolute canonical URL for a section index. A section's id is its URL
 * segment, so there is nothing to translate here. */
export const sectionIndexUrl = (id: string): string => `${siteUrl}/${id}`;

/** Absolute canonical URL for one page of a section. */
export const sectionUrl = (id: string, slug: string[]): string =>
  `${sectionIndexUrl(id)}/${slug.join("/")}`;

/** The page's generated social card. `updated` becomes a `?v=` stamp so a
 * re-scraped card follows the page — see `guideCardUrl` for the full reasoning. */
export const sectionCardUrl = (
  id: string,
  slug: string[],
  updated: string,
): string =>
  `${siteUrl}/og/${id}/${slug.join("/")}/card.png?v=${updated.slice(0, 10).replace(/-/g, "")}`;

export function sectionIndexMetadata({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}): Metadata {
  return listingMetadata(sectionIndexUrl(id), title, description);
}

/** One page of a registry section. Takes its `meta` verbatim
 * (`{ id, slug, ...meta }`), like `guideMetadata`, so an optional SEO field is
 * wired up by being declared. */
export function sectionMetadata({
  id,
  slug,
  title,
  titleTag,
  description,
  ogTitle,
  ogDescription,
  keywords,
  published,
  updated,
  noindex,
}: {
  id: string;
  slug: string[];
  title: string;
  titleTag?: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  keywords: string[];
  published: string;
  updated: string;
  noindex?: boolean;
}): Metadata {
  const base = buildMetadata({
    url: sectionUrl(id, slug),
    locale: "es",
    title: titleTag ?? title,
    titleAbsolute: true,
    description,
    ogTitle: ogTitle ?? title,
    ogDescription,
    images: [
      {
        url: sectionCardUrl(id, slug, updated),
        width: 1200,
        height: 630,
        alt: ogTitle ?? title,
      },
    ],
    keywords,
    type: "article",
    publishedTime: published,
    modifiedTime: updated,
    noindex,
  });

  // `noindex` on one of these pages means exactly one thing — it is not
  // published — so it gets the lifecycle's stricter directive rather than
  // `buildMetadata`'s site-wide `noindex, follow`. The same constant the guide
  // route reaches through `contentPageMetadata`, so a preview says the same
  // thing in both sections.
  return noindex ? { ...base, robots: { ...UNPUBLISHED_ROBOTS } } : base;
}

/** A guide article. Takes the guide's `meta` verbatim (`{ slug, ...meta }`), so
 * the optional SEO fields an author sets are wired up by being declared. */
export function guideMetadata({
  slug,
  title,
  titleTag,
  description,
  ogTitle,
  ogDescription,
  keywords,
  published,
  updated,
  canonical,
  noindex,
}: {
  slug: string;
  title: string;
  titleTag?: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  keywords: string[];
  published: string;
  updated: string;
  canonical?: string;
  noindex?: boolean;
}): Metadata {
  return buildMetadata({
    // The guide that should rank, which is this one unless it says otherwise.
    url: guideUrl(canonical ?? slug),
    locale: "es",
    // Verbatim, with no "— Factura" suffix: the brand cost ten characters of a
    // ~60-character search result on all 43 guides, and Google prints the site
    // name beside the result anyway. `titleTag` is the escape hatch for a
    // headline that reads well as an <h1> but not as a snippet.
    title: titleTag ?? title,
    titleAbsolute: true,
    description,
    // The headline, not the snippet-sized `titleTag` — a social card has room
    // for the real thing.
    ogTitle: ogTitle ?? title,
    ogDescription,
    // This guide's own card rather than the site's wordmark. Note it stays the
    // guide's own even when `canonical` points elsewhere: the picture describes
    // the page being shared, and only the ranking signals are consolidated.
    images: [
      {
        url: guideCardUrl(slug, updated),
        width: 1200,
        height: 630,
        alt: ogTitle ?? title,
      },
    ],
    keywords,
    type: "article",
    publishedTime: published,
    modifiedTime: updated,
    noindex,
  });
}

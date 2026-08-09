import "server-only";
import type { Metadata } from "next";
import { siteUrl } from "@/config/urls";
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

/** Shared metadata for the guide listing pages (the index and the category
 * hubs) — same treatment, only the canonical URL differs.
 *
 * Titles are absolute here for the same reason the articles' are: these are
 * guides pages, five of the eight category titles are over 50 characters, and
 * appending "— Factura" is what would push them past what a search result
 * shows. */
function guideListingMetadata(
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
  return guideListingMetadata(guidesIndexUrl, title, description);
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
  return guideListingMetadata(guideCategoryUrl(id), title, description);
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

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

/** Shared metadata for the guide listing pages (the index and the category
 * hubs) — same treatment, only the canonical URL differs. */
function guideListingMetadata(
  url: string,
  title: string,
  description: string,
): Metadata {
  return buildMetadata({ url, locale: "es", title, description });
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

export function guideMetadata({
  slug,
  title,
  description,
  keywords,
  published,
  updated,
}: {
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  published: string;
  updated: string;
}): Metadata {
  return buildMetadata({
    url: guideUrl(slug),
    locale: "es",
    title,
    description,
    keywords,
    type: "article",
    publishedTime: published,
    modifiedTime: updated,
  });
}

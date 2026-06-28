import "server-only";
import type { Metadata } from "next";
import { siteUrl } from "@/config/urls";
import type { Locale } from "./config";

// Per-page SEO metadata for the localized landing. Spanish (default) lives at
// the bare path and is the canonical/x-default; English lives under `/en`.
// Emits `canonical`, `hreflang` alternates, and `og:locale` so Google can
// index both languages as distinct URLs.

const OG_LOCALE: Record<Locale, string> = { es: "es_AR", en: "en_US" };

/** Absolute URL for a landing path in a locale. `path` is the canonical (es)
 * path, e.g. "/" or "/faq". */
export function localeUrl(path: string, locale: Locale): string {
  if (path === "/") return locale === "en" ? `${siteUrl}/en` : siteUrl;
  return locale === "en" ? `${siteUrl}/en${path}` : `${siteUrl}${path}`;
}

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
  const current = locale === "en" ? enUrl : esUrl;
  return {
    title,
    description,
    alternates: {
      canonical: current,
      languages: {
        "es-AR": esUrl,
        en: enUrl,
        "x-default": esUrl,
      },
    },
    openGraph: {
      url: current,
      title,
      description,
      locale: OG_LOCALE[locale],
      alternateLocale: OG_LOCALE[locale === "en" ? "es" : "en"],
      images: [
        { url: "/opengraph-image.png", width: 2400, height: 1260, alt: title },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/twitter-image.png"],
    },
  };
}

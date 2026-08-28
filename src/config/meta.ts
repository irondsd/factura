import type { Metadata, Viewport } from "next";
import type { Locale } from "@/i18n/config";
import { siteUrl } from "./urls";

export const siteName = "Factura";

/** `og:locale` code for each site language. */
export const ogLocale: Record<Locale, string> = { es: "es_AR", en: "en_US" };

/** The shared social card. A public asset referenced through the metadata
 * object rather than the `opengraph-image` file convention, so it resolves on
 * every route across both root layouts instead of only the segment that owns
 * the file. Per-page cards override it (see `buildMetadata`). */
export const ogImage = {
  url: "/opengraph-image.png",
  width: 2400,
  height: 1260,
} as const;

export const twitterImage = "/twitter-image.png";

/** Site-wide metadata: everything that is true on every route regardless of
 * which page is rendering. Each root layout calls this with its own locale, and
 * pages refine it through `buildMetadata` (src/lib/seo.ts).
 *
 * Two fields are deliberately absent, because a site-wide default for either is
 * always wrong somewhere:
 *
 * - `alternates.canonical` — Next merges metadata shallowly, so a canonical set
 *   here is inherited verbatim by every route that doesn't set its own. That
 *   made /login (and the whole signed-in app) declare themselves duplicates of
 *   the homepage.
 * - `keywords` — the tag is per-page by nature; one global list meant the
 *   Spanish pages shipped English keywords. Only the guides set it now. */
export function baseMetadata({
  locale,
  title,
  description,
}: {
  locale: Locale;
  title: string;
  description: string;
}): Metadata {
  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: title,
      template: `%s — ${siteName}`,
    },
    description,
    applicationName: siteName,
    authors: [{ name: siteName }],
    creator: siteName,
    publisher: siteName,
    category: "finance",
    openGraph: {
      type: "website",
      // The brand fallback. Every public page overrides this with its own
      // canonical URL; what's left is the signed-in app, which is where the
      // site's front door is the honest answer.
      url: siteUrl,
      siteName,
      title,
      description,
      locale: ogLocale[locale],
      images: [{ ...ogImage, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [twitterImage],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    // favicon.ico, icon.png and apple-icon.png are picked up automatically from
    // src/app/ as file-based metadata — no manual icons config needed.
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#1f1a17",
};

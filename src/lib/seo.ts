import "server-only";
import type { Metadata } from "next";
import {
  baseMetadata,
  ogImage,
  ogLocale,
  siteName,
  twitterImage,
} from "@/config/meta";
import { siteUrl } from "@/config/urls";
import type { Dictionary, Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getLocale } from "@/i18n/server";

// The one place page metadata is composed. Every public route goes through
// `buildMetadata`, which exists because of how Next merges metadata across
// segments: nested objects like `openGraph` are REPLACED by the last segment to
// define them, not deep-merged (see the "Merging" section of
// next/dist/docs/…/functions/generate-metadata.md). A page that spelled out its
// own `openGraph` silently dropped `og:site_name` and `og:type` from the layout
// — which is exactly what used to happen on every page of this site.
//
// So: pages never write `openGraph`/`twitter`/`alternates` by hand. They
// describe the page, and this builds the complete blocks from that.

type OgImage = { url: string; width: number; height: number; alt?: string };

export type SeoOptions = {
  /** Absolute canonical URL of this page. Always emitted — a page with no
   * canonical is a page competing with its own query-string variants. */
  url: string;
  locale: Locale;
  title: string;
  /** Render `title` verbatim, bypassing the `%s — Factura` template. For pages
   * whose title is already at the ~60-char limit the SERP truncates at. */
  titleAbsolute?: boolean;
  description: string;
  /** Social-card copy, when the click-hook should differ from the search copy.
   * Both default to `title`/`description`. */
  ogTitle?: string;
  ogDescription?: string;
  /** Keep the page out of the index while leaving it readable at its URL.
   * `follow` stays on: the page is unlisted, not disowned, and its links should
   * still carry crawlers to the guides it references. */
  noindex?: boolean;
  /** `article` for anything with a publication date; `website` otherwise. */
  type?: "website" | "article";
  /** Per-page keywords. Google ignores the tag, but it costs nothing and other
   * engines still read it. Omit rather than pad. */
  keywords?: string[];
  /** hreflang map (absolute URLs), for pages that exist in both languages.
   * Spanish-only sections pass nothing: pointing hreflang at a URL that 404s is
   * worse than having no alternates at all. */
  languages?: Record<string, string>;
  /** The other locale this page exists in, for `og:locale:alternate`. */
  alternateLocale?: Locale;
  /** Social card override, used for both OG and Twitter. Defaults to the shared
   * site card. */
  images?: OgImage[];
  publishedTime?: string;
  modifiedTime?: string;
};

export function buildMetadata({
  url,
  locale,
  title,
  titleAbsolute,
  description,
  ogTitle,
  ogDescription,
  noindex,
  type = "website",
  keywords,
  languages,
  alternateLocale,
  images,
  publishedTime,
  modifiedTime,
}: SeoOptions): Metadata {
  const social = ogTitle ?? title;
  const socialDescription = ogDescription ?? description;
  const cards: OgImage[] = images ?? [{ ...ogImage, alt: social }];

  return {
    title: titleAbsolute ? { absolute: title } : title,
    description,
    ...(keywords?.length ? { keywords } : {}),
    ...(noindex
      ? {
          robots: {
            index: false,
            follow: true,
            googleBot: { index: false, follow: true },
          },
        }
      : {}),
    alternates: {
      canonical: url,
      ...(languages ? { languages } : {}),
      // Feed autodiscovery, on the Spanish pages only — /feed.xml carries the
      // guides and the statistics, and both sections exist only in Spanish.
      //
      // It's declared here rather than in a layout for the same reason this
      // module exists at all: Next replaces `alternates` wholesale with the
      // last segment that defines one, so a layout-level feed link would be
      // dropped by every page that sets its own canonical — which is all of
      // them.
      ...(locale === "es"
        ? { types: { "application/rss+xml": `${siteUrl}/feed.xml` } }
        : {}),
    },
    openGraph: {
      type,
      url,
      siteName,
      title: social,
      description: socialDescription,
      locale: ogLocale[locale],
      ...(alternateLocale
        ? { alternateLocale: ogLocale[alternateLocale] }
        : {}),
      images: cards,
      ...(type === "article" ? { publishedTime, modifiedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: social,
      description: socialDescription,
      // A page that brought its own card shows that card on X too. Only the
      // pages falling back to the site default get the Twitter-specific asset,
      // which exists because that one is cropped for it.
      images: images ? images.map((image) => image.url) : [twitterImage],
    },
  };
}

/** Keep this route (and everything under it) out of the index. */
const NOINDEX: Metadata["robots"] = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false },
};

/** Root metadata for the signed-in app + auth subtree: the site defaults, minus
 * any claim to be indexable and minus a canonical.
 *
 * robots.txt already disallows /app and /login, but a disallow only stops the
 * crawl — a URL linked from elsewhere can still be indexed URL-only, and the
 * blocked crawl is precisely what stops Google from seeing a `noindex`. Saying
 * it in the markup is the half we control. */
export function privateMetadata({
  locale,
  title,
  description,
}: {
  locale: Locale;
  title: string;
  description: string;
}): Metadata {
  return { ...baseMetadata({ locale, title, description }), robots: NOINDEX };
}

/** The tab title of a page inside the signed-in app, in the cookie locale.
 * `robots` and everything else come from the subtree root above, so these set
 * the one thing that is actually theirs.
 *
 * Most of them declare it from a `layout.tsx`: the app pages are client
 * components, which can't export `generateMetadata`. */
async function appTitle(key: keyof Dictionary["meta"]["app"]): Promise<string> {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  return t.meta.app[key];
}

export async function appPageMetadata(
  key: keyof Dictionary["meta"]["app"],
): Promise<Metadata> {
  return { title: await appTitle(key) };
}

/** Same, for a segment that has child routes of its own (`/app`).
 *
 * The template has to be repeated here. Metadata merges shallowly, so a plain
 * `title` string in an intermediate segment replaces the parent's whole `title`
 * object — template included — and every route below it would render a bare
 * "Análisis" with no brand. As `title.default` it still picks up the root
 * template for this segment itself, so /app is "Resumen — Factura". */
export async function appSectionMetadata(
  key: keyof Dictionary["meta"]["app"],
): Promise<Metadata> {
  return {
    title: { default: await appTitle(key), template: `%s — ${siteName}` },
  };
}

import type {
  Header,
  Redirect,
  Rewrite,
} from "next/dist/lib/load-custom-routes";
import { LOCALE_COOKIE, type Locale } from "./config";
import { SPANISH_ONLY_PREFIXES } from "./routing";

// Locale routing for the public landing, as `next.config.ts` rules. Spanish is
// canonical and unprefixed; English lives under /en. Pages are statically
// generated under `(site)/[lang]` as /es/* and /en/*, and these rules:
//   • redirect /es and /es/* → the bare path (no duplicate Spanish URL),
//   • send /en/* of a Spanish-only section to its bare Spanish URL, and let
//     every other /en and /en/* through to the English static page,
//   • rewrite every other landing (bare) path → /es/* so the Spanish static
//     page serves at the clean URL (the browser URL stays bare),
//   • for anonymous visitors, keep NEXT_LOCALE pointed at the version they're
//     actually viewing, so the locale captured at sign-up — and the OTP email —
//     matches the page they signed up from. Signed-in visitors are left
//     untouched: their saved preference (set via the in-app switch, mirrored to
//     the DB) must win over passive browsing.
//
// This used to be `src/proxy.ts`. Next 16's proxy only runs on Node.js, and on
// Vercel that makes it a Fluid function invoked before *every* matching
// request — including the ones the CDN then answers from cache. It was most of
// the project's Active CPU on a quiet day (October 2026) for work that is pure
// pattern matching. Config rules run in Vercel's routing layer and cost no
// function invocation at all.
//
// Where they run matters, and it is the same place the proxy ran: Vercel's
// router applies headers, then redirects, then (formerly) the proxy, then
// `beforeFiles` rewrites — all against the URL as requested, *before* it turns
// an RSC request for `/guias` into `/guias.rsc`. So the file exclusion below
// (`.*\..*`) never sees an RSC suffix, exactly as the proxy matcher didn't, and
// the RSC conversion then applies to the rewritten `/es/guias`. An `afterFiles`
// rewrite would run after that conversion and need different patterns.

/** Top-level paths that are not part of the localized landing: the app, auth,
 * account deletion, API, the PostHog reverse proxy (/ingest/*), the CMS (its
 * own root layout, Spanish-only, no `[lang]` segment to rewrite into), the
 * OAuth consent screen (cookie-driven locale like the rest of the app), the
 * share-target endpoint, the media permalink route, standalone embeds, and
 * Next internals.
 *
 * A plain prefix test with no segment boundary — `/application` counts as
 * `app` — because that is what the proxy matcher did, and those paths would
 * only ever 404 either way. */
const OUTSIDE_LANDING = [
  "api",
  "ingest",
  "_next/static",
  "_next/image",
  "app",
  "cms",
  "embed",
  "login",
  "logout",
  "oauth",
  "delete-account",
  "share-target",
  "media",
].join("|");

/** The Spanish-only section names, without their leading slash. */
const SPANISH_ONLY = SPANISH_ONLY_PREFIXES.map((prefix) =>
  prefix.slice(1),
).join("|");

/** A bare landing path after its leading slash: not outside the landing, not a
 * file (anything with a dot — favicon, sitemap.xml, og cards, media
 * permalinks), and not already under a locale segment. `/esx` and `/energia`
 * are bare paths; `/es`, `/es/…`, `/en` and `/en/…` are not. */
const BARE_PATH = `(?!(?:${OUTSIDE_LANDING})|.*\\..*|(?:es|en)(?:/|$)).+`;

/** An /en path after `/en/` that is not in a Spanish-only section. `normal` in
 * `/en/normal` is not `normativa`: the section must end at a slash or the end
 * of the path. */
const ENGLISH_PATH = `(?!(?:${SPANISH_ONLY})(?:/|$)).+`;

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Both names Auth.js can give the session cookie: the plain one in dev and the
 * `__Secure-` one over HTTPS. The same pair as `SESSION_COOKIE_NAMES` in
 * `@/server/authCookie` (a test holds them together); repeated here because
 * `next.config.ts` cannot resolve that module's `@/` imports. */
export const SIGNED_IN_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
] as const;

/** Set NEXT_LOCALE to `locale` — only for an anonymous visitor whose cookie
 * does not already say so. `missing` values are matched as `^value$`, so a
 * cookie that is absent, or holds any other value, gets the header. */
function trackLocale(source: string, locale: Locale): Header {
  return {
    source,
    missing: [
      ...SIGNED_IN_COOKIES.map((key) => ({ type: "cookie" as const, key })),
      { type: "cookie", key: LOCALE_COOKIE, value: locale },
    ],
    headers: [
      {
        key: "Set-Cookie",
        value: `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax`,
      },
    ],
  };
}

/** One rule per locale, the path optional, so `/` and `/en` are covered too.
 * Two rules for a locale would both match `/en/` (the router accepts an
 * optional trailing slash after `/en`) and send the cookie twice. */
export function localeHeaders(): Header[] {
  return [
    trackLocale(`/:path(${BARE_PATH})?`, "es"),
    trackLocale(`/en/:path(${ENGLISH_PATH})?`, "en"),
  ];
}

export function localeRedirects(): Redirect[] {
  return [
    // Spanish is unprefixed — bounce any /es* URL to its bare canonical.
    { source: "/es", destination: "/", permanent: true },
    { source: "/es/:path*", destination: "/:path*", permanent: true },
    // A Spanish-only section has no English page to serve. `ContentChrome`
    // would 404 the request, and on a route with `dynamicParams = true` that
    // 404 is generated and then *stored* — so a crawler working through stale
    // /en links would mint durable cache entries for pages that deliberately
    // do not exist. Sending the visitor to the article they were after costs a
    // redirect and stores nothing.
    //
    // 307, not 308: /en/guias is empty because nobody has translated it yet,
    // not because it moved. A permanent redirect is cached in browsers past the
    // point where anyone could take it back, and this is a rule we expect to
    // retire one section at a time.
    {
      source: `/en/:section(${SPANISH_ONLY})/:path*`,
      destination: "/:section/:path*",
      permanent: false,
    },
  ];
}

/** `beforeFiles` rewrites: see the note at the top about where they run. */
export function localeRewrites(): Rewrite[] {
  return [
    // Config rules match case-insensitively — here and in Vercel's router — so
    // `/EN/faq` is treated as English by every rule above. Without this it
    // would reach `[lang]` as `lang: "EN"`, which the root layout can only
    // `notFound()` into Next's unbranded error page, stored once per URL. The
    // destination is written in lower case, so the rewrite normalises the
    // prefix; for `/en/...` itself it changes nothing. (The proxy compared case
    // sensitively and sent `/EN/faq` into the Spanish tree, as a 404.) Matching
    // `beforeFiles` rewrites carry on to the next, so the rule below still sees
    // the result.
    { source: "/en", destination: "/en" },
    { source: "/en/:path*", destination: "/en/:path*" },
    { source: "/", destination: "/es" },
    { source: `/:path(${BARE_PATH})`, destination: "/es/:path" },
  ];
}

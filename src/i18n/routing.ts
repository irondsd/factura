// The locale routing rules for the public landing, and the helpers that apply
// them. Spanish (the default locale) lives at the bare paths (`/`, `/faq`);
// English lives under `/en` (`/en`, `/en/faq`). The signed-in app (`/app`,
// `/login`, `/api`) is never localized. Keep this free of server-only imports —
// it's used in server components, client links, the proxy, and at build time.

import { defaultLocale, type Locale } from "./config";

// Paths that never take a locale prefix (the app, auth, and API live outside
// the localized landing).
const UNLOCALIZED_PREFIXES = ["/login", "/app", "/api"];

function isUnlocalized(path: string): boolean {
  return UNLOCALIZED_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );
}

/** Prefix a landing path with the locale segment. No-op for Spanish (default),
 * for the app/auth paths, and for hash/external links. */
export function localizedHref(path: string, locale: Locale): string {
  if (locale === defaultLocale) return path;
  if (!path.startsWith("/")) return path; // hash, external, or relative
  if (isUnlocalized(path)) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

// Sections that exist only in Spanish: their `[lang]` layouts 404 for any other
// locale, so nothing may offer a visitor an English counterpart that isn't
// there. One list rather than a check per section — the previous single
// hardcoded `/guias` test is exactly what goes stale when a section is added.
const SPANISH_ONLY_PREFIXES = [
  "/guias",
  "/noticias",
  "/estadisticas",
  "/investigaciones",
  "/normativa",
];

/** Whether a landing pathname belongs to a Spanish-only section. Takes a
 * browser pathname, so it tolerates (and ignores) an `/en` prefix. */
export function isSpanishOnlyPath(pathname: string): boolean {
  const path = stripEnPrefix(pathname);
  return SPANISH_ONLY_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );
}

/** Drop a leading `/en` from a browser pathname (Spanish is unprefixed). */
export function stripEnPrefix(pathname: string): string {
  if (pathname === "/en") return "/";
  return pathname.replace(/^\/en(?=\/)/, "") || "/";
}

/** The build-time half of the Spanish-only rule: prerender a section's paths
 * under `/es` and generate nothing at all under any other locale.
 *
 * Three places enforce one fact, and they have to agree. `ContentChrome` is the
 * render-time guard — it `notFound()`s a non-Spanish request, and that is what
 * makes the rule true. This is the build-time guard: without it these sections
 * inherit both locales from the `[lang]` layout above them and the build spends
 * itself prerendering ~85 English 404s, every one of which is then stored.
 * `proxy.ts` is the third — it redirects a visitor away before the request can
 * reach the section, which is what stops `dynamicParams = true` from minting
 * those same 404s one request at a time.
 *
 * **It stamps the locale; it does not filter on it.** The obvious shape —
 * taking the parent's `lang` and returning `[]` for anything but Spanish — type
 * checks, returns exactly the right params, and silently prerenders nothing at
 * all: a parent combination whose child yields no params is carried forward by
 * Next as a partial combination (`{ lang: "en" }` with no `slug`), and the
 * route then falls back to on-demand rendering for *every* locale, Spanish
 * included. Returning the full param set instead is the "bottom up" form the
 * `generateStaticParams` docs describe. Next merges each result over the parent
 * (`{ ...parentParams, ...item }`), so the `lang` below wins, both parent
 * locales produce the same Spanish combinations, and the duplicates collapse.
 *
 * The cost is that the thunk runs once per locale rather than once. Every
 * caller reads through `unstable_cache`, so the second call is a cache hit. */
export async function spanishOnly<T extends object>(
  paths: () => Promise<T[]>,
): Promise<(T & { lang: Locale })[]> {
  return (await paths()).map((params) => ({ ...params, lang: defaultLocale }));
}

/** The same page in the other language, given the current pathname + locale.
 * Used by the landing language switch. */
export function oppositePath(pathname: string, locale: Locale): string {
  if (locale === "en") return stripEnPrefix(pathname);
  return pathname === "/" ? "/en" : `/en${pathname}`;
}

// Client-safe URL helpers for the localized landing routes. Spanish (the
// default locale) lives at the bare paths (`/`, `/faq`); English lives under
// `/en` (`/en`, `/en/faq`). The signed-in app (`/app`, `/login`, `/api`) is
// never localized. Keep this free of server-only imports — it's used in both
// server components and client links.

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

/** The same page in the other language, given the current pathname + locale.
 * Used by the landing language switch. */
export function oppositePath(pathname: string, locale: Locale): string {
  if (locale === "en") return stripEnPrefix(pathname);
  return pathname === "/" ? "/en" : `/en${pathname}`;
}

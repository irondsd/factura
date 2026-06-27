import { type NextRequest, NextResponse } from "next/server";
import { LOCALE_COOKIE, type Locale } from "@/i18n/config";

// Locale routing for the public landing (Next 16's renamed middleware). Spanish
// is canonical and unprefixed; English lives under /en. Pages are statically
// generated under `(site)/[lang]` as /es/* and /en/*; this proxy:
//   • redirects /es and /es/* → the bare path (no duplicate Spanish URL),
//   • passes /en and /en/* straight through to the English static page,
//   • rewrites every other matched (bare) path → /es/* so the Spanish static
//     page serves at the clean URL (the browser URL stays bare),
//   • on first touch (no cookie yet) persists NEXT_LOCALE = the URL's locale so
//     the signed-in app + transactional emails follow the version browsed; an
//     explicit choice (the language switch) is never overridden.
// The matcher excludes /app, /login, /api, /_next, and files, so the app keeps
// its cookie-driven locale untouched.

const ONE_YEAR = 60 * 60 * 24 * 365;

function withFirstTouchCookie(
  request: NextRequest,
  response: NextResponse,
  locale: Locale,
): NextResponse {
  if (!request.cookies.get(LOCALE_COOKIE)) {
    response.cookies.set(LOCALE_COOKIE, locale, {
      path: "/",
      maxAge: ONE_YEAR,
      sameSite: "lax",
    });
  }
  return response;
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Spanish is unprefixed — bounce any /es* URL to its bare canonical.
  if (pathname === "/es" || pathname.startsWith("/es/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    return NextResponse.redirect(url, 308);
  }

  // English pages are served directly from /en*.
  if (pathname === "/en" || pathname.startsWith("/en/")) {
    return withFirstTouchCookie(request, NextResponse.next(), "en");
  }

  // Bare landing path → serve the Spanish static page at the clean URL.
  const url = request.nextUrl.clone();
  url.pathname = `/es${pathname === "/" ? "" : pathname}`;
  return withFirstTouchCookie(request, NextResponse.rewrite(url), "es");
}

export const config = {
  // Run on landing paths only — exclude the app, auth, API, Next internals, and
  // any file with an extension (favicon, sitemap.xml, robots.txt, og images…).
  matcher: ["/((?!api|_next/static|_next/image|app|login|.*\\..*).*)"],
};

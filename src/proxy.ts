import { type NextRequest, NextResponse } from "next/server";
import { LOCALE_COOKIE, type Locale } from "@/i18n/config";

// Locale routing for the public landing (Next 16's renamed middleware). Spanish
// is canonical and unprefixed; English lives under /en. Pages are statically
// generated under `(site)/[lang]` as /es/* and /en/*; this proxy:
//   • redirects /es and /es/* → the bare path (no duplicate Spanish URL),
//   • passes /en and /en/* straight through to the English static page,
//   • rewrites every other matched (bare) path → /es/* so the Spanish static
//     page serves at the clean URL (the browser URL stays bare),
//   • for anonymous visitors, keeps NEXT_LOCALE pointed at the version they're
//     actually viewing, so the locale captured at sign-up — and the OTP email —
//     matches the page they signed up from (even if they first browsed the other
//     language). Signed-in visitors are left untouched: their saved preference
//     (set via the in-app switch, mirrored to the DB) must win over passive
//     browsing, and is never silently overridden.
// The matcher excludes /app, /login, /api, /_next, and files, so the app keeps
// its cookie-driven locale untouched.

const ONE_YEAR = 60 * 60 * 24 * 365;

// Presence of an Auth.js session cookie marks a signed-in visitor. Covers both
// the dev (`authjs.session-token`) and HTTPS (`__Secure-…`) cookie names.
function isSignedIn(request: NextRequest): boolean {
  return (
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token")
  );
}

function withLocaleCookie(
  request: NextRequest,
  response: NextResponse,
  locale: Locale,
): NextResponse {
  // Only track the browsed locale for anonymous visitors; never overwrite a
  // signed-in user's stored preference.
  if (
    !isSignedIn(request) &&
    request.cookies.get(LOCALE_COOKIE)?.value !== locale
  ) {
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
    return withLocaleCookie(request, NextResponse.next(), "en");
  }

  // Bare landing path → serve the Spanish static page at the clean URL.
  const url = request.nextUrl.clone();
  url.pathname = `/es${pathname === "/" ? "" : pathname}`;
  return withLocaleCookie(request, NextResponse.rewrite(url), "es");
}

export const config = {
  // Run on landing paths only — exclude the app, auth, API, the PostHog reverse
  // proxy (/ingest/*, rewritten in next.config), Next internals, and any file
  // with an extension (favicon, sitemap.xml, robots.txt, og images…).
  matcher: ["/((?!api|ingest|_next/static|_next/image|app|login|.*\\..*).*)"],
};

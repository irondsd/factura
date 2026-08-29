import { publicOrigins, type OriginConfig } from "@/config/origins";

/** Sanitize a `?next=` return destination.
 *
 * Anywhere a URL from the query string decides where the browser goes after
 * signing in, this is the gate. Relative paths stay on the canonical site;
 * absolute URLs are accepted only for the configured app origin. Callers fall
 * back to their own default rather than trusting anything ambiguous.
 *
 * The three ways this goes wrong, all of which are refused here:
 *   • an absolute URL (`https://evil.example`) — the obvious one;
 *   • a protocol-relative URL (`//evil.example`), which browsers treat as
 *     absolute and which a naive "starts with /" check waves straight through;
 *   • a backslash variant (`/\evil.example`, `\\evil.example`), which some
 *     browsers normalize into the protocol-relative form.
 */
export function safeNext(
  value: string | null | undefined,
  origins: OriginConfig = publicOrigins,
): string | null {
  if (!value) return null;
  // Control characters and whitespace can be used to smuggle a scheme past the
  // checks below once the browser strips them.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point
  if (/[\u0000-\u001f\u007f\s\\]/.test(value)) return null;

  if (value.startsWith("/")) {
    if (value.startsWith("//")) return null;
    return value;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.username || url.password || url.origin !== origins.appOrigin) {
    return null;
  }
  return url.href;
}

/** Where a visitor lands once /login is done with them.
 *
 * Both ends of the flow need this answer — the server component that bounces an
 * already-signed-in visitor straight past the page, and the form that hands
 * Auth.js a callbackUrl — so it lives here rather than being spelled twice.
 *
 * `claim` is the flag /probar sets: a bare "1", never a path, so it can't be
 * bent into an open redirect the way `next` could if `safeNext` didn't gate it.
 */
export function loginTarget(
  next: string | null | undefined,
  claim: boolean,
  origins: OriginConfig = publicOrigins,
): string {
  return safeNext(next, origins) ?? appHome(claim, origins);
}

/** The /login URL that returns the visitor to `from` after they sign in.
 *
 * This is what keeps a deep link alive across the auth flow: someone opening a
 * shared /app/bills?property=depto while signed out should land back on that
 * page, not on the app's front door. `/app` itself is already the default
 * destination, so it's left off rather than round-tripped through the query.
 */
export function loginHref(
  from: string | null | undefined,
  origins: OriginConfig = publicOrigins,
): string {
  const split = origins.appOrigin !== origins.siteOrigin;
  const safe = safeNext(from, origins);
  const next =
    split && safe?.startsWith("/")
      ? new URL(safe, origins.appOrigin).href
      : safe;
  const home = appHome(false, origins);
  const login = split ? new URL("/login", origins.siteOrigin).href : "/login";

  if (!next || next === home) return login;
  return `${login}?next=${encodeURIComponent(next)}`;
}

/** Where the canonical marketing-origin logout returns the browser.
 *
 * A signed-in app page supplies an absolute app URL; CMS and monolith callers
 * can keep using relative paths. Hostile destinations fall back to the public
 * site instead of turning logout into an open redirect.
 */
export function logoutTarget(
  next: string | null | undefined,
  origins: OriginConfig = publicOrigins,
): string {
  return (
    safeNext(next, origins) ??
    (origins.appOrigin === origins.siteOrigin ? "/" : origins.siteOrigin)
  );
}

/** Final redirect gate used by Auth.js after a provider callback.
 *
 * Auth.js defaults to its own base origin, which is correct for one deployment
 * but discards an allowlisted `app.factura.uno` callback after the split. Both
 * canonical origins are accepted exactly; everything else returns to the site.
 */
export function authRedirectTarget(
  value: string,
  origins: OriginConfig = publicOrigins,
): string {
  if (value.startsWith("/")) {
    const path = safeNext(value, origins);
    return path
      ? new URL(path, origins.siteOrigin).href
      : `${origins.siteOrigin}/`;
  }

  if (/[\s\\\u0000-\u001f\u007f]/.test(value)) {
    return `${origins.siteOrigin}/`;
  }

  try {
    const url = new URL(value);
    if (
      !url.username &&
      !url.password &&
      (url.origin === origins.siteOrigin || url.origin === origins.appOrigin)
    ) {
      return url.href;
    }
  } catch {
    // Fall through to the canonical site below.
  }

  return `${origins.siteOrigin}/`;
}

function appHome(claim: boolean, origins: OriginConfig): string {
  const query = claim ? "?claim=1" : "";
  if (origins.appOrigin === origins.siteOrigin) return `/app${query}`;
  return new URL(`/${query}`, origins.appOrigin).href;
}

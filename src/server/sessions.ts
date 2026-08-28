import "server-only";
import { cookies, headers } from "next/headers";
import { DISPLAY_MODE_COOKIE, isDisplayMode } from "@/lib/displayMode";
import { SESSION_COOKIE_NAMES } from "./authCookie";

/** Both names Auth.js can give the session cookie: the plain one in dev and the
 * `__Secure-` one it switches to over HTTPS. Same pair proxy.ts checks. */
/** How stale a session's last-active reading may get before the next request
 * that touches it writes a fresh one. Every signed-in request already reads the
 * session row; this bounds how often it also writes one. */
export const HEARTBEAT_MS = 5 * 60 * 1000;

/**
 * The caller's own session token, straight from the cookie.
 *
 * Server-only, and it stays that way: the token IS the credential, so it is
 * used to answer "which row is this browser?" and never travels to the client.
 * Auth.js gives no other handle on the active session — `auth()` returns the
 * user, not the row — so reading the cookie is the way to identify it.
 */
export async function currentSessionToken(): Promise<string | null> {
  const jar = await cookies();
  for (const name of SESSION_COOKIE_NAMES) {
    const value = jar.get(name)?.value;
    if (value) return value;
  }
  return null;
}

export type ClientReading = {
  userAgent: string | null;
  ip: string | null;
  city: string | null;
  country: string | null;
  displayMode: string | null;
};

const NOTHING: ClientReading = {
  userAgent: null,
  ip: null,
  city: null,
  country: null,
  displayMode: null,
};

/** Who is on the other end of the current request, as far as the edge will say.
 * Returns nulls outside a request (scripts, background jobs) rather than
 * throwing — a missing reading must never fail the request it rode in on. */
export async function requestClientInfo(): Promise<ClientReading> {
  try {
    const [h, jar] = await Promise.all([headers(), cookies()]);

    // x-forwarded-for is a chain (client, proxy1, proxy2…); the client is first.
    // Only trustworthy because every deployment of this app sits behind a proxy
    // that rewrites it — it's a display value, never an authorization input.
    const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip =
      forwarded || h.get("cf-connecting-ip") || h.get("x-real-ip") || null;

    // UA strings run long and unbounded; 512 chars is past every real one.
    const userAgent = h.get("user-agent")?.slice(0, 512) || null;

    // Geolocation straight off the CDN — Vercel resolves it at the edge on
    // every plan, so there is no lookup to pay for, no third party to hand a
    // user's address to, and nothing to keep up to date. Absent in local dev
    // (no edge in front), which reads as "unknown" the same way a missing IP
    // does. Vercel percent-encodes the city per RFC 3986.
    const city =
      decodeMaybe(h.get("x-vercel-ip-city")) ??
      decodeMaybe(h.get("cf-ipcity")) ??
      null;
    const country =
      h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || null;

    // The one signal the platform can't give us: no browser ships a
    // display-mode request header, so a client-set cookie carries it (see
    // src/components/app/DisplayModeProbe.tsx). User-controlled input on its
    // way to a column the UI renders — hence the allowlist.
    const reported = jar.get(DISPLAY_MODE_COOKIE)?.value ?? "";
    const displayMode = isDisplayMode(reported) ? reported : null;

    return { userAgent, ip, city, country, displayMode };
  } catch {
    return NOTHING;
  }
}

/** Percent-decoded header value, or null if it is absent or malformed. */
function decodeMaybe(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value).slice(0, 120) || null;
  } catch {
    return value.slice(0, 120);
  }
}

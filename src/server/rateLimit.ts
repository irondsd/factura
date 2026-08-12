import { createHmac } from "node:crypto";

// The app's first rate limiter, added for /probar — the only endpoint anyone on
// the internet can hand bytes to.
//
// BE HONEST ABOUT WHAT THIS IS. `buckets` below is a module-level Map: it lives
// in one instance's memory, is not shared between instances, and is wiped by
// every cold start. With N warm instances the effective ceiling is N × capacity,
// and an attacker who can force cold starts resets it entirely. So this stops
// accidental floods, runaway retry loops and casual scripts — it is NOT a
// control against someone deliberately trying to get through.
//
// The layer that survives instance churn is the per-IP daily count against
// `bill_submissions` (see PUBLIC_SUBMISSIONS_PER_IP_PER_DAY and the
// bill_submission_ip_idx index), checked only once this bucket has passed so the
// common case stays free of a DB round trip. Anything beyond that belongs in a
// WAF in front of the app, not here.

export type LimitSpec = {
  /** Burst size: tokens available when fully refilled. */
  capacity: number;
  /** Sustained rate. `1 / 60` = one request per minute. */
  refillPerSec: number;
};

export type Bucket = { tokens: number; at: number };

/** One token-bucket step. Pure — no clock, no module state — so the policy is
 * directly unit-testable, following the pure-helpers / DB-helpers split the rest
 * of the server modules use. `now` is epoch milliseconds. */
export function consume(
  bucket: Bucket | undefined,
  spec: LimitSpec,
  cost: number,
  now: number,
): { bucket: Bucket; ok: boolean; retryAfterSec: number } {
  const prior = bucket ?? { tokens: spec.capacity, at: now };
  // Refill for elapsed time, capped at capacity. Guard against a clock that went
  // backwards (`now < at`) so a stale bucket can't gain tokens.
  const elapsed = Math.max(0, now - prior.at) / 1000;
  const tokens = Math.min(
    spec.capacity,
    prior.tokens + elapsed * spec.refillPerSec,
  );

  if (tokens < cost) {
    const deficit = cost - tokens;
    return {
      bucket: { tokens, at: now },
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil(deficit / spec.refillPerSec)),
    };
  }
  return {
    bucket: { tokens: tokens - cost, at: now },
    ok: true,
    retryAfterSec: 0,
  };
}

const buckets = new Map<string, Bucket>();
let sinceSweep = 0;

/** Drop buckets idle long enough to have fully refilled — they're
 * indistinguishable from a first-time caller, so keeping them only grows the
 * map. Amortized: swept every 200th call rather than on a timer. */
function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    // Keyed specs vary, but 1h idle refills every spec we define here.
    if (now - bucket.at > 60 * 60 * 1000) buckets.delete(key);
  }
}

/** Stateful wrapper over the module-level map. See the caveat at the top. */
export function take(
  key: string,
  spec: LimitSpec,
  cost = 1,
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  if (++sinceSweep >= 200) {
    sinceSweep = 0;
    sweep(now);
  }
  const { bucket, ok, retryAfterSec } = consume(
    buckets.get(key),
    spec,
    cost,
    now,
  );
  buckets.set(key, bucket);
  return { ok, retryAfterSec };
}

/** Best-effort client address. Takes the LEFTMOST x-forwarded-for entry, which
 * is correct behind a proxy that *overwrites* the header (Vercel's edge does)
 * and spoofable behind one that *appends* to it — verify against your host
 * before treating the result as trustworthy. Returns null when there's no
 * header at all, which is the local-dev case. */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || null;
}

/** Pseudonymize an address for storage and for limiter keys. HMAC, not a bare
 * digest: IPv4 is a 2^32 space, so `sha256(ip)` is reversible by brute force in
 * seconds and would be storing the address in all but name. Keyed with
 * AUTH_SECRET, which every deployment already has. */
export function hashIp(ip: string): string {
  const secret = process.env.AUTH_SECRET ?? "";
  return createHmac("sha256", secret).update(ip).digest("hex").slice(0, 32);
}

/** Limiter key for a request, falling back to a single shared bucket when the
 * address is unknown. The fallback is deliberately conservative: better to
 * throttle an un-attributable caller than to hand out an unlimited lane. */
export function limitKey(request: Request, scope: string): string {
  const ip = clientIp(request);
  return `${scope}:${ip ? hashIp(ip) : "unknown"}`;
}

// One full 10-file drop plus slack, refilling at ~60/h. Must stay above
// MAX_FILES_PER_DROP or a legitimate drop rate-limits itself partway through.
export const PROBAR_SUBMIT: LimitSpec = { capacity: 12, refillPerSec: 1 / 60 };
// Up to three tier calls per file × a full drop, so the cascade for a 10-file
// drop fits inside one burst.
export const PROBAR_PARSE: LimitSpec = { capacity: 60, refillPerSec: 1 / 2 };
export const PROBAR_CLAIM: LimitSpec = { capacity: 10, refillPerSec: 1 / 60 };
// The "who is this bill from?" field saves itself as you type, so this bucket is
// sized for typing rather than for submitting: several unrecognized bills in one
// drop, each debounced to a request per pause, plus corrections. Deliberately
// generous — the write is one indexed UPDATE of one short string, and throttling
// it silently loses the answer someone actually typed.
export const PROBAR_HINT: LimitSpec = { capacity: 40, refillPerSec: 1 / 5 };

// The contact form. There is no legitimate burst here — a person writes once,
// maybe twice — so this is tighter than the /probar buckets. Not tighter than
// that, though: the check runs before validation (as everywhere else in this
// app), so a rejected body costs a token too, and someone who mistypes an
// address shouldn't be locked out of the message they came to send.
export const CONTACT_SEND: LimitSpec = { capacity: 5, refillPerSec: 1 / 300 };

// Dynamic client registration is open to the internet — that is the point, and
// also the exposure: every call writes a row nobody asked for. Tight, because a
// legitimate client registers ONCE and then reuses its client_id forever, so
// even a handful per hour is generous for real use.
export const OAUTH_REGISTER: LimitSpec = { capacity: 5, refillPerSec: 1 / 600 };
// Token exchange and refresh. Sized for a client reconnecting several accounts
// or retrying a flaky network, not for grinding at codes — which PKCE and the
// two-minute code lifetime already make pointless.
export const OAUTH_TOKEN: LimitSpec = { capacity: 30, refillPerSec: 1 / 20 };
// MCP calls. An assistant working through a question fires several tools in a
// row, and a burst that trips the limiter mid-answer is worse than useless, so
// this is deliberately roomy: it is here to stop a runaway loop, not to meter
// legitimate use. Every call past it is an authenticated one.
export const MCP_CALL: LimitSpec = { capacity: 120, refillPerSec: 2 };

import { describe, expect, it } from "vitest";
import {
  type Bucket,
  clientIp,
  consume,
  hashIp,
  type LimitSpec,
  limitKey,
  PROBAR_CLAIM,
  PROBAR_PARSE,
  PROBAR_SUBMIT,
} from "./rateLimit";
import { MAX_FILES_PER_DROP } from "@/lib/limits";

// One token per second, burst of 3.
const spec: LimitSpec = { capacity: 3, refillPerSec: 1 };
const T0 = 1_700_000_000_000;

/** Run `n` consecutive consumes against one bucket at a fixed instant. */
function drain(n: number, at = T0, start?: Bucket) {
  let bucket = start;
  let last!: ReturnType<typeof consume>;
  for (let i = 0; i < n; i++) {
    last = consume(bucket, spec, 1, at);
    bucket = last.bucket;
  }
  return last;
}

describe("consume", () => {
  it("starts full, so a first-time caller gets the whole burst", () => {
    expect(drain(3).ok).toBe(true);
  });

  it("rejects once the burst is spent", () => {
    const out = drain(4);
    expect(out.ok).toBe(false);
    expect(out.retryAfterSec).toBe(1);
  });

  it("refills over time", () => {
    const spent = drain(3);
    expect(consume(spent.bucket, spec, 1, T0 + 1000).ok).toBe(true);
  });

  it("never refills past capacity", () => {
    // An hour idle on a 3-token bucket must not bank 3600 tokens.
    const spent = drain(3);
    const later = drain(3, T0 + 3_600_000, spent.bucket);
    expect(later.ok).toBe(true);
    expect(drain(1, T0 + 3_600_000, later.bucket).ok).toBe(false);
  });

  it("does not grant tokens when the clock goes backwards", () => {
    const spent = drain(3);
    expect(consume(spent.bucket, spec, 1, T0 - 60_000).ok).toBe(false);
  });

  it("rounds retryAfterSec up to at least a second", () => {
    // A partial token still means "not yet"; a Retry-After of 0 would invite an
    // immediate retry that's guaranteed to fail again.
    const out = consume({ tokens: 0.9, at: T0 }, spec, 1, T0);
    expect(out.ok).toBe(false);
    expect(out.retryAfterSec).toBe(1);
  });

  it("charges multi-token costs atomically", () => {
    const out = consume(undefined, spec, 3, T0);
    expect(out.ok).toBe(true);
    expect(consume(out.bucket, spec, 1, T0).ok).toBe(false);
  });

  it("rejects a cost above capacity rather than partially spending", () => {
    const out = consume(undefined, spec, 5, T0);
    expect(out.ok).toBe(false);
    expect(out.bucket.tokens).toBe(3);
  });
});

describe("PROBAR_SUBMIT", () => {
  it("admits a full drop in one burst", () => {
    // Regression: with capacity <= MAX_FILES_PER_DROP a legitimate 10-file drop
    // would 429 itself partway through, which reads to the user as a bug.
    let bucket: Bucket | undefined;
    for (let i = 0; i < MAX_FILES_PER_DROP; i++) {
      const out = consume(bucket, PROBAR_SUBMIT, 1, T0);
      expect(out.ok).toBe(true);
      bucket = out.bucket;
    }
  });

  it("admits the whole cascade for a full drop", () => {
    // Each file costs up to three parse calls; if the parse bucket couldn't
    // cover a legitimate maximum drop, the last cards would fail with a
    // rate-limit message the visitor did nothing to deserve.
    let bucket: Bucket | undefined;
    for (let i = 0; i < MAX_FILES_PER_DROP * 3; i++) {
      const out = consume(bucket, PROBAR_PARSE, 1, T0);
      expect(out.ok).toBe(true);
      bucket = out.bucket;
    }
  });

  it("keeps every public spec finite and refilling", () => {
    // A zero refill would make a spent bucket permanent for the life of the
    // instance — an accidental ban rather than a throttle.
    for (const spec of [PROBAR_SUBMIT, PROBAR_PARSE, PROBAR_CLAIM]) {
      expect(spec.capacity).toBeGreaterThan(0);
      expect(spec.refillPerSec).toBeGreaterThan(0);
    }
  });
});

describe("hashIp", () => {
  it("is stable for the same address", () => {
    expect(hashIp("1.2.3.4")).toBe(hashIp("1.2.3.4"));
  });

  it("separates different addresses", () => {
    expect(hashIp("1.2.3.4")).not.toBe(hashIp("1.2.3.5"));
  });

  it("does not contain the address it came from", () => {
    expect(hashIp("203.0.113.7")).not.toContain("203.0.113.7");
  });

  it("is keyed, not a bare digest of the address", () => {
    // IPv4 is a 2^32 space, so an unkeyed sha256 reverses by brute force in
    // seconds and would be storing the address in all but name. Changing the
    // key must change the output.
    const before = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "key-one";
    const one = hashIp("1.2.3.4");
    process.env.AUTH_SECRET = "key-two";
    const two = hashIp("1.2.3.4");
    process.env.AUTH_SECRET = before;
    expect(one).not.toBe(two);
  });
});

describe("limitKey", () => {
  const req = (headers: Record<string, string>) =>
    new Request("https://example.test", { headers });

  it("scopes the bucket per endpoint", () => {
    const h = { "x-forwarded-for": "1.2.3.4" };
    expect(limitKey(req(h), "probar:submit")).not.toBe(
      limitKey(req(h), "probar:parse"),
    );
  });

  it("separates callers within one scope", () => {
    expect(limitKey(req({ "x-forwarded-for": "1.2.3.4" }), "s")).not.toBe(
      limitKey(req({ "x-forwarded-for": "5.6.7.8" }), "s"),
    );
  });

  it("never puts a raw address in the key", () => {
    expect(limitKey(req({ "x-forwarded-for": "203.0.113.7" }), "s")).not.toContain(
      "203.0.113.7",
    );
  });

  it("shares one conservative bucket when the address is unknown", () => {
    // Better to throttle an un-attributable caller than to hand out an
    // unlimited lane to anyone who strips the header.
    expect(limitKey(req({}), "s")).toBe("s:unknown");
  });
});

describe("clientIp", () => {
  const req = (headers: Record<string, string>) =>
    new Request("https://example.test", { headers });

  it("takes the leftmost x-forwarded-for entry", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe(
      "1.2.3.4",
    );
  });

  it("falls back to x-real-ip", () => {
    expect(clientIp(req({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
  });

  it("returns null when no address header is present", () => {
    expect(clientIp(req({}))).toBeNull();
  });

  it("ignores an empty x-forwarded-for", () => {
    expect(clientIp(req({ "x-forwarded-for": "" }))).toBeNull();
  });
});

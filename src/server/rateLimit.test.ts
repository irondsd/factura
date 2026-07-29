import { describe, expect, it } from "vitest";
import {
  type Bucket,
  clientIp,
  consume,
  type LimitSpec,
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

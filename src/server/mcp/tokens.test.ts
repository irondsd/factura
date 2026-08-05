import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  bearerFromHeader,
  hashToken,
  isExpired,
  mintAuthCode,
  mintClientId,
  mintToken,
  TOKEN_PREFIX,
  tokenKind,
  verifyPkce,
} from "./tokens";

/** A valid PKCE pair, built the way a client would. */
function pkcePair(verifier = randomBytes(32).toString("base64url")) {
  return {
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
}

describe("mintToken", () => {
  it("prefixes by kind so a bearer string routes without a lookup", () => {
    expect(mintToken("personal").token.startsWith(TOKEN_PREFIX.personal)).toBe(
      true,
    );
    expect(mintToken("access").token.startsWith(TOKEN_PREFIX.access)).toBe(
      true,
    );
    expect(mintToken("refresh").token.startsWith(TOKEN_PREFIX.refresh)).toBe(
      true,
    );
  });

  it("returns the digest of the token it returns", () => {
    const minted = mintToken("access");
    expect(minted.hash).toBe(hashToken(minted.token));
  });

  it("hints with the tail, which cannot reconstruct the token", () => {
    const minted = mintToken("personal");
    expect(minted.hint).toBe(minted.token.slice(-4));
    expect(minted.token.includes(minted.hint)).toBe(true);
    expect(minted.hint.length).toBeLessThan(minted.token.length);
  });

  it("never repeats", () => {
    const seen = new Set(
      Array.from({ length: 200 }, () => mintToken("access").token),
    );
    expect(seen.size).toBe(200);
  });
});

describe("tokenKind", () => {
  it("reads the kind back off a minted token", () => {
    expect(tokenKind(mintToken("personal").token)).toBe("personal");
    expect(tokenKind(mintToken("access").token)).toBe("access");
    expect(tokenKind(mintToken("refresh").token)).toBe("refresh");
  });

  it("rejects anything without one of our prefixes", () => {
    expect(tokenKind("")).toBeNull();
    expect(tokenKind("abc123")).toBeNull();
    // A bare authorization code is never a bearer token.
    expect(tokenKind(mintAuthCode().code)).toBeNull();
    // Close, but not ours — a prefix in the middle must not match.
    expect(tokenKind(`x${TOKEN_PREFIX.access}abc`)).toBeNull();
  });
});

describe("bearerFromHeader", () => {
  it("extracts the token", () => {
    expect(bearerFromHeader("Bearer fct_at_abc")).toBe("fct_at_abc");
  });

  it("accepts the scheme in any case, as RFC 7235 requires", () => {
    expect(bearerFromHeader("bearer fct_at_abc")).toBe("fct_at_abc");
    expect(bearerFromHeader("BEARER fct_at_abc")).toBe("fct_at_abc");
  });

  it("tolerates surrounding and internal whitespace", () => {
    expect(bearerFromHeader("  Bearer   fct_at_abc  ")).toBe("fct_at_abc");
  });

  it("returns null for anything that is not a single bearer token", () => {
    expect(bearerFromHeader(null)).toBeNull();
    expect(bearerFromHeader(undefined)).toBeNull();
    expect(bearerFromHeader("")).toBeNull();
    expect(bearerFromHeader("Basic abc")).toBeNull();
    expect(bearerFromHeader("Bearer")).toBeNull();
    expect(bearerFromHeader("Bearer a b")).toBeNull();
  });
});

describe("verifyPkce", () => {
  it("accepts the verifier that produced the challenge", () => {
    const { verifier, challenge } = pkcePair();
    expect(verifyPkce(verifier, challenge)).toBe(true);
  });

  it("rejects a different verifier", () => {
    const { challenge } = pkcePair();
    const other = pkcePair();
    expect(verifyPkce(other.verifier, challenge)).toBe(false);
  });

  it("rejects a plain-method challenge, which OAuth 2.1 removes", () => {
    // With `plain` the challenge IS the verifier. Accepting that would make
    // PKCE decorative, so it has to fail even though the client "matched".
    const verifier = randomBytes(32).toString("base64url");
    expect(verifyPkce(verifier, verifier)).toBe(false);
  });

  it("rejects verifiers outside the RFC 7636 length bounds", () => {
    const short = "a".repeat(42);
    const long = "a".repeat(129);
    const digest = (v: string) =>
      createHash("sha256").update(v).digest("base64url");
    expect(verifyPkce(short, digest(short))).toBe(false);
    expect(verifyPkce(long, digest(long))).toBe(false);
    // 43 and 128 are inside the bounds and must still work.
    const min = "a".repeat(43);
    expect(verifyPkce(min, digest(min))).toBe(true);
    const max = "a".repeat(128);
    expect(verifyPkce(max, digest(max))).toBe(true);
  });

  it("rejects an empty or malformed challenge", () => {
    const { verifier } = pkcePair();
    expect(verifyPkce(verifier, "")).toBe(false);
    expect(verifyPkce(verifier, "not-a-digest")).toBe(false);
  });
});

describe("hashToken", () => {
  it("is stable and is plain sha256 hex", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toBe(
      createHash("sha256").update("abc").digest("hex"),
    );
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });
});

describe("mintClientId", () => {
  it("is opaque and unique", () => {
    const ids = new Set(Array.from({ length: 100 }, mintClientId));
    expect(ids.size).toBe(100);
    expect(mintClientId().startsWith("fct_client_")).toBe(true);
  });
});

describe("isExpired", () => {
  const now = 1_700_000_000_000;

  it("treats null as never expiring", () => {
    expect(isExpired(null, now)).toBe(false);
  });

  it("expires on and after the instant, not before", () => {
    expect(isExpired(new Date(now - 1), now)).toBe(true);
    expect(isExpired(new Date(now), now)).toBe(true);
    expect(isExpired(new Date(now + 1), now)).toBe(false);
  });
});

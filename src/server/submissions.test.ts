import { describe, expect, it } from "vitest";
import {
  evictableCookieNames,
  findTicket,
  LEGACY_SUBMISSION_COOKIE,
  MAX_TRACKED_SUBMISSIONS,
  mintTicket,
  parseLegacyTickets,
  readTickets,
  secretMatches,
  submissionCookieName,
  submissionCookieValue,
  trackedCookieNames,
  hashSecret,
} from "./submissions";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const SECRET = "abcdefghijklmnopqrstuvwx";
const OTHER_SECRET = "zzzzzzzzzzzzzzzzzzzzzzzz";

/** One `probar_sub_<id>` cookie as /submit would have written it. */
const cookie = (id: string, secret = SECRET, atSec = 1_700_000_000) => ({
  name: submissionCookieName(id),
  value: submissionCookieValue(secret, atSec * 1000),
});

const legacy = (raw: string) => ({ name: LEGACY_SUBMISSION_COOKIE, value: raw });

// The regression this whole layout exists for: /submit used to rebuild one
// shared cookie from the value it was sent, so two concurrent uploads each
// wrote `<their own ticket>` over the other's and one file lost its ticket
// entirely — then 404'd on its next /parse call. Independent cookie names are
// what make a parallel drop survivable.
describe("concurrent submits", () => {
  it("keeps every ticket when responses interleave", () => {
    const jar = [cookie(ID_A, SECRET, 1000), cookie(ID_B, OTHER_SECRET, 1000)];
    expect(findTicket(jar, ID_A)).toEqual({
      id: ID_A,
      secret: SECRET,
      issuedAt: 1_000_000,
    });
    expect(findTicket(jar, ID_B)).toEqual({
      id: ID_B,
      secret: OTHER_SECRET,
      issuedAt: 1_000_000,
    });
  });

  it("evicts nothing while under the cap", () => {
    expect(evictableCookieNames([cookie(ID_A), cookie(ID_B)])).toEqual([]);
  });
});

describe("readTickets", () => {
  it("reads per-submission cookies, newest first", () => {
    expect(
      readTickets([cookie(ID_A, SECRET, 1000), cookie(ID_B, SECRET, 2000)]),
    ).toEqual([
      { id: ID_B, secret: SECRET, issuedAt: 2_000_000 },
      { id: ID_A, secret: SECRET, issuedAt: 1_000_000 },
    ]);
  });

  it("ignores unrelated cookies", () => {
    expect(
      readTickets([
        { name: "session", value: "whatever" },
        { name: "probar_sub_not-a-uuid", value: SECRET },
        cookie(ID_A),
      ]),
    ).toEqual([{ id: ID_A, secret: SECRET, issuedAt: 1_700_000_000_000 }]);
  });

  // Every value here is attacker-controlled: each must be dropped quietly
  // rather than throwing or reaching the DB.
  it.each([
    ["empty value", ""],
    ["timestamp only", ".abc"],
    ["secret too short", "short.abc"],
    ["cookie-hostile chars", "abc;def=ghi jkl.abc"],
  ])("drops a cookie with %s", (_label, value) => {
    expect(readTickets([{ name: submissionCookieName(ID_A), value }])).toEqual(
      [],
    );
  });

  it("accepts a value with no timestamp", () => {
    // A missing stamp costs the ticket its place in the eviction order, never
    // its validity.
    expect(
      readTickets([{ name: submissionCookieName(ID_A), value: SECRET }]),
    ).toEqual([{ id: ID_A, secret: SECRET, issuedAt: 0 }]);
  });

  it("still reads tickets from the legacy cookie", () => {
    // A visitor who dropped bills before the split must keep them claimable.
    expect(readTickets([legacy(`${ID_A}:${SECRET}|${ID_B}:${SECRET}`)])).toEqual([
      { id: ID_A, secret: SECRET, issuedAt: 0 },
      { id: ID_B, secret: SECRET, issuedAt: 0 },
    ]);
  });

  it("prefers the per-submission cookie over a legacy entry for the same id", () => {
    const out = readTickets([legacy(`${ID_A}:${OTHER_SECRET}`), cookie(ID_A)]);
    expect(out).toEqual([
      { id: ID_A, secret: SECRET, issuedAt: 1_700_000_000_000 },
    ]);
  });

  it("truncates an oversized jar", () => {
    // Otherwise one forged jar turns a single claim request into unbounded DB
    // work.
    const jar = Array.from({ length: MAX_TRACKED_SUBMISSIONS + 25 }, (_, i) =>
      cookie(`${ID_A.slice(0, -2)}${String(i % 100).padStart(2, "0")}`),
    );
    expect(readTickets(jar)).toHaveLength(MAX_TRACKED_SUBMISSIONS);
  });

  it("returns nothing for an empty jar", () => {
    expect(readTickets([])).toEqual([]);
  });
});

describe("findTicket", () => {
  it("returns null for an id the browser doesn't hold", () => {
    // This is the 404 the parse route answers with — the ticket is the only
    // authorization an anonymous submission has.
    expect(findTicket([cookie(ID_A)], ID_B)).toBeNull();
  });
});

describe("evictableCookieNames", () => {
  it("drops the oldest beyond the cap", () => {
    const jar = Array.from({ length: MAX_TRACKED_SUBMISSIONS + 3 }, (_, i) =>
      cookie(
        `${ID_A.slice(0, -2)}${String(i % 100).padStart(2, "0")}`,
        SECRET,
        1000 + i,
      ),
    );
    // The three oldest are the three written first.
    expect(evictableCookieNames(jar)).toEqual(jar.slice(0, 3).map((c) => c.name));
  });

  it("sweeps junk probar_sub_ cookies", () => {
    // A forged jar full of unparseable entries must not hold real tickets out
    // of the cap.
    const junk = { name: submissionCookieName(ID_B), value: "nope" };
    expect(evictableCookieNames([cookie(ID_A), junk])).toEqual([junk.name]);
  });

  it("never evicts the legacy cookie", () => {
    // It holds tickets for ids that have no cookie of their own.
    expect(evictableCookieNames([legacy(`${ID_A}:${SECRET}`)])).toEqual([]);
  });
});

describe("trackedCookieNames", () => {
  it("names every cookie a spent claim must clear", () => {
    expect(
      trackedCookieNames([
        { name: "session", value: "x" },
        cookie(ID_A),
        legacy(`${ID_B}:${SECRET}`),
      ]),
    ).toEqual([submissionCookieName(ID_A), LEGACY_SUBMISSION_COOKIE]);
  });
});

describe("parseLegacyTickets", () => {
  it("parses a well-formed cookie", () => {
    expect(parseLegacyTickets(`${ID_A}:${SECRET}|${ID_B}:${SECRET}`)).toEqual([
      { id: ID_A, secret: SECRET },
      { id: ID_B, secret: SECRET },
    ]);
  });

  it("returns nothing for a missing or empty cookie", () => {
    expect(parseLegacyTickets(undefined)).toEqual([]);
    expect(parseLegacyTickets("")).toEqual([]);
  });

  // The cookie is entirely attacker-controlled: every one of these must be
  // dropped quietly rather than throwing or reaching the DB.
  it.each([
    ["no separator", "justsomegarbage"],
    ["non-uuid id", `not-a-uuid:${SECRET}`],
    ["empty secret", `${ID_A}:`],
    ["secret with cookie-hostile chars", `${ID_A}:abc;def=ghi jkl`],
    ["secret too short", `${ID_A}:short`],
    ["sql-ish id", `${ID_A}' or '1'='1:${SECRET}`],
    ["only a separator", ":"],
    ["pipes only", "|||"],
  ])("drops %s", (_label, raw) => {
    expect(parseLegacyTickets(raw)).toEqual([]);
  });

  it("keeps the valid entries around an invalid one", () => {
    expect(
      parseLegacyTickets(`${ID_A}:${SECRET}|garbage|${ID_B}:${SECRET}`),
    ).toEqual([
      { id: ID_A, secret: SECRET },
      { id: ID_B, secret: SECRET },
    ]);
  });

  it("keeps the first entry when an id repeats", () => {
    const out = parseLegacyTickets(`${ID_A}:${SECRET}|${ID_A}:${OTHER_SECRET}`);
    expect(out).toEqual([{ id: ID_A, secret: SECRET }]);
  });

  it("truncates an oversized cookie", () => {
    const many = Array.from(
      { length: MAX_TRACKED_SUBMISSIONS + 25 },
      (_, i) => `${ID_A.slice(0, -2)}${String(i % 100).padStart(2, "0")}:${SECRET}`,
    ).join("|");
    expect(parseLegacyTickets(many)).toHaveLength(MAX_TRACKED_SUBMISSIONS);
  });
});

describe("mintTicket", () => {
  it("produces a cookie-safe secret and its hash", () => {
    const { ticket, secretHash } = mintTicket(ID_A);
    expect(ticket.id).toBe(ID_A);
    expect(secretHash).toBe(hashSecret(ticket.secret));
    // Must survive its own parser, or the cookie we just set is unreadable.
    const at = Date.now();
    expect(
      findTicket(
        [
          {
            name: submissionCookieName(ID_A),
            value: submissionCookieValue(ticket.secret, at),
          },
        ],
        ID_A,
      ),
    ).toEqual({ ...ticket, issuedAt: Math.floor(at / 1000) * 1000 });
  });

  it("never repeats a secret", () => {
    const secrets = new Set(
      Array.from({ length: 200 }, () => mintTicket(ID_A).ticket.secret),
    );
    expect(secrets.size).toBe(200);
  });

  it("does not store the secret itself", () => {
    const { ticket, secretHash } = mintTicket(ID_A);
    expect(secretHash).not.toContain(ticket.secret);
  });
});

// This is the whole authorization boundary for an anonymous submission: it
// decides who may read a stranger's bill text and who may claim it into an
// account. Everything below is a way of getting it wrong.
describe("secretMatches", () => {
  it("accepts the secret it was minted with", () => {
    const { ticket, secretHash } = mintTicket(ID_A);
    expect(secretMatches(secretHash, ticket.secret)).toBe(true);
  });

  it("rejects a different secret", () => {
    const { secretHash } = mintTicket(ID_A);
    const other = mintTicket(ID_A);
    expect(secretMatches(secretHash, other.ticket.secret)).toBe(false);
  });

  it("rejects a secret that only shares a prefix", () => {
    // Guards against a comparison that stops early.
    const { ticket, secretHash } = mintTicket(ID_A);
    expect(secretMatches(secretHash, `${ticket.secret.slice(0, -1)}Z`)).toBe(
      false,
    );
    expect(secretMatches(secretHash, ticket.secret.slice(0, -1))).toBe(false);
  });

  it("rejects an empty secret against an empty hash", () => {
    // The dangerous degenerate case: two empty buffers compare equal, which
    // would make a blank secret open a row whose hash failed to decode.
    expect(secretMatches("", "")).toBe(false);
  });

  // A corrupted or truncated row must fail closed rather than throw a 500.
  it.each([
    ["empty hash", ""],
    ["not hex", "zzzz"],
    ["truncated digest", "abcd"],
    ["over-long digest", "a".repeat(80)],
  ])("rejects and does not throw on %s", (_label, storedHash) => {
    const { ticket } = mintTicket(ID_A);
    expect(() => secretMatches(storedHash, ticket.secret)).not.toThrow();
    expect(secretMatches(storedHash, ticket.secret)).toBe(false);
  });

  it("agrees with hashSecret", () => {
    expect(secretMatches(hashSecret(SECRET), SECRET)).toBe(true);
  });
});

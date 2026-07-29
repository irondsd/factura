import { describe, expect, it } from "vitest";
import {
  appendTicket,
  MAX_TRACKED_SUBMISSIONS,
  mintTicket,
  parseTickets,
  serializeTickets,
  hashSecret,
} from "./submissions";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const SECRET = "abcdefghijklmnopqrstuvwx";

describe("parseTickets", () => {
  it("parses a well-formed cookie", () => {
    expect(parseTickets(`${ID_A}:${SECRET}|${ID_B}:${SECRET}`)).toEqual([
      { id: ID_A, secret: SECRET },
      { id: ID_B, secret: SECRET },
    ]);
  });

  it("returns nothing for a missing or empty cookie", () => {
    expect(parseTickets(undefined)).toEqual([]);
    expect(parseTickets("")).toEqual([]);
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
    expect(parseTickets(raw)).toEqual([]);
  });

  it("keeps the valid entries around an invalid one", () => {
    expect(parseTickets(`${ID_A}:${SECRET}|garbage|${ID_B}:${SECRET}`)).toEqual([
      { id: ID_A, secret: SECRET },
      { id: ID_B, secret: SECRET },
    ]);
  });

  it("keeps the first entry when an id repeats", () => {
    const out = parseTickets(`${ID_A}:${SECRET}|${ID_A}:zzzzzzzzzzzzzzzzzzzzzzzz`);
    expect(out).toEqual([{ id: ID_A, secret: SECRET }]);
  });

  it("truncates an oversized cookie", () => {
    // Otherwise one forged cookie turns a single claim request into unbounded
    // DB work.
    const many = Array.from(
      { length: MAX_TRACKED_SUBMISSIONS + 25 },
      (_, i) => `${ID_A.slice(0, -2)}${String(i % 100).padStart(2, "0")}:${SECRET}`,
    ).join("|");
    expect(parseTickets(many)).toHaveLength(MAX_TRACKED_SUBMISSIONS);
  });

  it("round-trips through serializeTickets", () => {
    const tickets = [
      { id: ID_A, secret: SECRET },
      { id: ID_B, secret: SECRET },
    ];
    expect(parseTickets(serializeTickets(tickets))).toEqual(tickets);
  });
});

describe("serializeTickets", () => {
  it("keeps the most recent tickets when over the cap", () => {
    const tickets = Array.from(
      { length: MAX_TRACKED_SUBMISSIONS + 3 },
      (_, i) => ({
        id: `${ID_A.slice(0, -2)}${String(i % 100).padStart(2, "0")}`,
        secret: SECRET,
      }),
    );
    const kept = parseTickets(serializeTickets(tickets));
    expect(kept).toHaveLength(MAX_TRACKED_SUBMISSIONS);
    expect(kept.at(-1)).toEqual(tickets.at(-1));
  });
});

describe("appendTicket", () => {
  it("adds to an existing cookie", () => {
    const out = appendTicket(`${ID_A}:${SECRET}`, { id: ID_B, secret: SECRET });
    expect(parseTickets(out)).toHaveLength(2);
  });

  it("replaces the entry for an id instead of duplicating it", () => {
    const out = appendTicket(`${ID_A}:${SECRET}`, {
      id: ID_A,
      secret: "zzzzzzzzzzzzzzzzzzzzzzzz",
    });
    expect(parseTickets(out)).toEqual([
      { id: ID_A, secret: "zzzzzzzzzzzzzzzzzzzzzzzz" },
    ]);
  });

  it("works from an empty cookie", () => {
    expect(parseTickets(appendTicket(undefined, { id: ID_A, secret: SECRET })))
      .toEqual([{ id: ID_A, secret: SECRET }]);
  });
});

describe("mintTicket", () => {
  it("produces a cookie-safe secret and its hash", () => {
    const { ticket, secretHash } = mintTicket(ID_A);
    expect(ticket.id).toBe(ID_A);
    expect(secretHash).toBe(hashSecret(ticket.secret));
    // Must survive its own parser, or the cookie we just set is unreadable.
    expect(parseTickets(serializeTickets([ticket]))).toEqual([ticket]);
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

import { execFileSync } from "node:child_process";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { ParserConfig } from "@/parsers/engine/types";
import { evaluateCandidates } from "./evaluate-in-worker";
import type { SuggestCandidate } from "./protocol";

// The worker runs from a pre-bundled plain-JS file; build it before the suite so
// the test is self-contained (and exercises the real build script too).
beforeAll(() => {
  const root = path.resolve(__dirname, "../../..");
  execFileSync("node", [path.join(root, "scripts/build-suggest-worker.mjs")], {
    stdio: "ignore",
  });
}, 30_000);

const good: ParserConfig = {
  slug: "acme",
  vendor: { slug: "acme", displayName: "ACME" },
  version: 1,
  detect: { allOf: [{ pattern: "ACME" }] },
  captures: [
    { pattern: "ACCT (\\d+)", outputs: { acct: { group: 1 } } },
    { pattern: "TOTAL ([\\d.]+)", outputs: { amt: { group: 1, transform: ["numberUS"] } } },
    { pattern: "PERIOD (\\d{4}-\\d{2}-\\d{2})", outputs: { per: { group: 1 } } },
    { pattern: "DUE (\\d{4}-\\d{2}-\\d{2})", outputs: { due: { group: 1 } } },
  ],
  roles: {
    identity: { sources: ["acct"] },
    amount: { sources: ["amt"] },
    period: { sources: ["per"] },
    dueDate: { sources: ["due"] },
  },
};

// Catastrophic backtracking on a long run of 'a' not terminated by 'a'.
const evil: ParserConfig = {
  ...good,
  slug: "evil",
  vendor: { slug: "evil", displayName: "EVIL" },
  detect: { allOf: [{ pattern: "(a+)+$" }] },
};

const text =
  "ACME ACCT 12345 TOTAL 100.50 PERIOD 2026-06-01 DUE 2026-07-10 " +
  "a".repeat(42) +
  "!";

const cand = (id: string, config: ParserConfig): SuggestCandidate => ({
  token: id,
  config,
});

describe("evaluateCandidates (ReDoS-safe worker)", () => {
  it("returns a matching parser's extraction", async () => {
    const out = await evaluateCandidates(text, [cand("acme", good)], 750);
    expect(out.get("acme")?.result?.identity).toBe("12345");
    expect(out.get("acme")?.result?.amount).toBe(100.5);
  });

  it("caps total time and still returns work finished before a ReDoS candidate stalls", async () => {
    const start = Date.now();
    // good first so it streams back before the worker hangs on evil.
    const out = await evaluateCandidates(text, [cand("acme", good), cand("evil", evil)], 400);
    const elapsed = Date.now() - start;
    expect(out.has("acme")).toBe(true); // legit suggestion preserved
    expect(out.has("evil")).toBe(false); // never finished — dropped
    expect(elapsed).toBeLessThan(1500); // bounded by the budget, not the regex
  });

  it("does not block the event loop while a ReDoS candidate runs", async () => {
    let ticked = false;
    const timer = setTimeout(() => {
      ticked = true;
    }, 50);
    await evaluateCandidates(text, [cand("evil", evil)], 400);
    clearTimeout(timer);
    // A blocked main thread would never have fired the 50ms timer.
    expect(ticked).toBe(true);
  });
});

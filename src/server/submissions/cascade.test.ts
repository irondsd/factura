import { describe, expect, it } from "vitest";
import { TIERS } from "@/lib/probar";
import type { ParsedResult, ParserConfig } from "@/parsers/engine/types";
import type { CandidateResult } from "../suggest/protocol";
import { rankTierRun, type TierCandidate } from "./cascade";

const RESULT: ParsedResult = {
  identity: "1234567",
  amount: 100,
  period: "2026-05-01",
  dueDate: "2026-06-01",
  custom: {},
};

function candidate(name: string): TierCandidate {
  return {
    configId: `config-${name}`,
    versionId: `version-${name}`,
    adoptionCount: 0,
    config: {
      slug: name,
      version: 1,
      vendor: { slug: name, displayName: name.toUpperCase() },
      detect: {},
      captures: [],
      roles: {},
      custom: [{ name: "consumption", type: "quantity", unit: "kWh" }],
    } as unknown as ParserConfig,
  };
}

/** What the worker reports back for a candidate that detected the bill. */
function verdict(
  name: string,
  score: number,
  ok = true,
): [string, CandidateResult] {
  return [
    `config-${name}`,
    {
      token: `config-${name}`,
      score,
      result: ok ? RESULT : null,
      error: ok ? null : "no amount found",
    },
  ];
}

describe("TIERS", () => {
  it("runs most-trusted first", () => {
    // The cascade short-circuits on the first match, so this array IS the trust
    // policy: reorder it and a community parser can claim a bill an official
    // one would have handled. Nothing else would fail if it were wrong.
    expect(TIERS).toEqual(["official", "verified", "community"]);
  });
});

describe("rankTierRun", () => {
  it("reports no match when no candidate detected the bill", () => {
    const run = rankTierRun("official", [candidate("a")], new Map());
    expect(run.best).toBeNull();
    expect(run.ambiguous).toBe(false);
    // The stepper shows this count, so it must be candidates TRIED, not matched.
    expect(run.evaluated).toBe(1);
  });

  it("reports no match for an empty tier", () => {
    const run = rankTierRun("verified", [], new Map());
    expect(run).toEqual({
      tier: "verified",
      best: null,
      alternatives: [],
      ambiguous: false,
      evaluated: 0,
    });
  });

  it("ignores candidates the worker never reported on", () => {
    // A candidate missing from the map either didn't detect the bill or was cut
    // off by the budget — both mean "not a fit", never "matched".
    const run = rankTierRun(
      "community",
      [candidate("a"), candidate("b")],
      new Map([verdict("b", 3)]),
    );
    expect(run.best?.slug).toBe("b");
    expect(run.alternatives).toEqual([]);
    expect(run.evaluated).toBe(2);
  });

  it("picks the highest-scoring parser and lists the rest as alternatives", () => {
    const run = rankTierRun(
      "official",
      [candidate("a"), candidate("b"), candidate("c")],
      new Map([verdict("a", 1), verdict("b", 5), verdict("c", 3)]),
    );
    expect(run.best?.slug).toBe("b");
    expect(run.alternatives.map((m) => m.slug)).toEqual(["c", "a"]);
  });

  it("refuses to guess when the top two tie", () => {
    // The rule ingest already enforces: two parsers claiming a bill equally well
    // means filing it under either is a coin flip, so we file it under neither.
    const run = rankTierRun(
      "community",
      [candidate("a"), candidate("b")],
      new Map([verdict("a", 4), verdict("b", 4)]),
    );
    expect(run.best).toBeNull();
    expect(run.ambiguous).toBe(true);
    // Both stay listed — the visitor should see WHY it was ambiguous.
    expect(run.alternatives).toHaveLength(2);
  });

  it("does not treat a lower tie as ambiguous", () => {
    const run = rankTierRun(
      "official",
      [candidate("a"), candidate("b"), candidate("c")],
      new Map([verdict("a", 9), verdict("b", 2), verdict("c", 2)]),
    );
    expect(run.best?.slug).toBe("a");
    expect(run.ambiguous).toBe(false);
  });

  it("still reports a parser that detected but could not extract", () => {
    // parse_failed is a distinct, more actionable story than "unknown vendor":
    // we know the vendor, the parser just needs fixing.
    const run = rankTierRun(
      "verified",
      [candidate("a")],
      new Map([verdict("a", 2, false)]),
    );
    expect(run.best?.ok).toBe(false);
    expect(run.best?.error).toBe("no amount found");
    expect(run.best?.result).toBeNull();
  });

  it("prefers a clean extraction over a failed one at equal score", () => {
    const run = rankTierRun(
      "official",
      [candidate("a"), candidate("b"), candidate("c")],
      new Map([verdict("a", 1, false), verdict("b", 1), verdict("c", 5)]),
    );
    expect(run.best?.slug).toBe("c");
    expect(run.alternatives.map((m) => m.slug)).toEqual(["b", "a"]);
  });

  it("carries the tier and the parser's custom field definitions through", () => {
    // The card labels extracted values from these; losing them would render the
    // custom fields as bare unlabeled numbers.
    const run = rankTierRun(
      "community",
      [candidate("a")],
      new Map([verdict("a", 1)]),
    );
    expect(run.best?.tier).toBe("community");
    expect(run.best?.customDefs).toEqual([
      { name: "consumption", type: "quantity", unit: "kWh" },
    ]);
    expect(run.best?.versionId).toBe("version-a");
  });
});

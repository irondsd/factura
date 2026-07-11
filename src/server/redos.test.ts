import { describe, expect, it } from "vitest";
import { ENGINE_CONFIGS } from "@/parsers/engine/configs";
import type { ParserConfig } from "@/parsers/engine/types";
import { collectPatterns, findUnsafeRegexes } from "./redos";

/** Config stub with every regex-bearing section populated. */
function fullConfig(): ParserConfig {
  return {
    slug: "test",
    version: 1,
    vendor: { slug: "test", displayName: "Test" },
    region: { before: "RECIBO ANTERIOR", after: "^Página 2" },
    detect: {
      allOf: [{ pattern: "EDESUR", flags: "i" }],
      anyOf: [{ pattern: "Factura A" }, { pattern: "Factura B" }],
      noneOf: [{ pattern: "DUPLICADO" }],
    },
    captures: [
      {
        pattern: "Total\\s+\\$\\s*([\\d.,]+)",
        flags: "i",
        outputs: { total: { group: 1 } },
      },
    ],
    validations: [
      { type: "agree", a: "x", b: "y", label: "amounts" },
      {
        type: "lineContainsAll",
        linePattern: "^\\d{40,60}$",
        flags: "m",
        values: ["total"],
        label: "barcode",
      },
    ],
    roles: {
      identity: { sources: [] },
      amount: { sources: [] },
      period: { sources: [] },
      dueDate: { sources: [] },
    },
  };
}

describe("collectPatterns", () => {
  it("walks every regex-bearing field with runtime flags", () => {
    const sites = collectPatterns(fullConfig());
    expect(sites.map((s) => s.path)).toEqual([
      "detect.allOf[0]",
      "detect.anyOf[0]",
      "detect.anyOf[1]",
      "detect.noneOf[0]",
      "region.before",
      "region.after",
      "captures[0] (total)",
      'validations[1] "barcode"',
    ]);
    // Flags mirror evaluate.ts: region defaults to "i", lineContainsAll gets "g".
    const byPath = new Map(sites.map((s) => [s.path, s.flags]));
    expect(byPath.get("region.before")).toBe("i");
    expect(byPath.get('validations[1] "barcode"')).toBe("mg");
    expect(byPath.get("detect.anyOf[0]")).toBe("");
  });

  it("skips absent optional sections", () => {
    const config = fullConfig();
    config.region = undefined;
    config.validations = undefined;
    config.detect = { allOf: [{ pattern: "X" }] };
    expect(collectPatterns(config).map((s) => s.path)).toEqual([
      "detect.allOf[0]",
      "captures[0] (total)",
    ]);
  });
});

// recheck's pure-JS backend needs seconds per non-trivial pattern, so every
// test that actually runs the analysis carries an explicit timeout.
const ANALYSIS_TIMEOUT = 120_000;

describe("findUnsafeRegexes", () => {
  it(
    "accepts a realistic safe config",
    { timeout: ANALYSIS_TIMEOUT },
    async () => {
      expect(await findUnsafeRegexes(fullConfig())).toEqual([]);
    },
  );

  it(
    "flags a catastrophically backtracking capture",
    { timeout: ANALYSIS_TIMEOUT },
    async () => {
      const config = fullConfig();
      config.captures[0].pattern = "(a+)+$";
      const unsafe = await findUnsafeRegexes(config);
      expect(unsafe).toHaveLength(1);
      expect(unsafe[0].path).toBe("captures[0] (total)");
      expect(unsafe[0].reason).toContain("backtracking");
    },
  );

  it(
    "flags a pattern that does not compile",
    { timeout: ANALYSIS_TIMEOUT },
    async () => {
      const config = fullConfig();
      config.detect.allOf = [{ pattern: "(unclosed" }];
      const unsafe = await findUnsafeRegexes(config);
      expect(unsafe.map((u) => u.path)).toEqual(["detect.allOf[0]"]);
    },
  );

  it(
    "accepts every shipped official config (seeding publishes them)",
    { timeout: ANALYSIS_TIMEOUT },
    async () => {
      for (const config of ENGINE_CONFIGS) {
        expect.soft(await findUnsafeRegexes(config), config.slug).toEqual([]);
      }
    },
  );
});

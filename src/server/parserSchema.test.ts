import { describe, expect, it } from "vitest";
import {
  type ConfigInput,
  configInputSchema,
  toEngineConfig,
} from "./parserSchema";

/** A minimal-but-valid create payload; tests tweak one field at a time. */
function input(overrides: Partial<ConfigInput> = {}): ConfigInput {
  return {
    slug: "edesur",
    displayName: "Edesur",
    vendorSlug: "edesur",
    definition: {
      detect: { allOf: [{ pattern: "EDESUR" }] },
      captures: [
        { pattern: "Total\\s+(\\d+)", outputs: { total: { group: 1 } } },
      ],
      roles: {
        identity: { sources: ["total"] },
        amount: { sources: ["total"] },
        period: { sources: ["total"] },
        dueDate: { sources: ["total"] },
      },
    },
    ...overrides,
  };
}

describe("configInputSchema", () => {
  it("accepts a well-formed payload", () => {
    expect(configInputSchema.safeParse(input()).success).toBe(true);
  });

  it("rejects slugs with uppercase or spaces", () => {
    expect(configInputSchema.safeParse(input({ slug: "Edesur" })).success).toBe(
      false,
    );
    expect(
      configInputSchema.safeParse(input({ slug: "ed esur" })).success,
    ).toBe(false);
  });

  it("rejects an empty slug and an over-long slug", () => {
    expect(configInputSchema.safeParse(input({ slug: "" })).success).toBe(
      false,
    );
    expect(
      configInputSchema.safeParse(input({ slug: "a".repeat(61) })).success,
    ).toBe(false);
  });

  it("requires all four roles", () => {
    const bad = input();
    // @ts-expect-error drop a required role
    delete bad.definition.roles.dueDate;
    expect(configInputSchema.safeParse(bad).success).toBe(false);
  });

  it("requires at least one source per role", () => {
    const bad = input();
    bad.definition.roles.amount = { sources: [] };
    expect(configInputSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts known transform ops and object-form transforms", () => {
    const ok = input();
    ok.definition.captures[0].outputs.total.transform = [
      "numberAR",
      { slice: 2 },
      { parseDate: "DMY" },
      { lookup: { a: 1, b: "two" } },
    ];
    expect(configInputSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects an unknown transform op", () => {
    const bad = input();
    // @ts-expect-error invalid transform op
    bad.definition.captures[0].outputs.total.transform = ["numberDE"];
    expect(configInputSchema.safeParse(bad).success).toBe(false);
  });

  it("makes version optional", () => {
    expect(configInputSchema.safeParse(input()).success).toBe(true);
    expect(configInputSchema.safeParse(input({ version: 3 })).success).toBe(
      true,
    );
  });
});

describe("toEngineConfig", () => {
  it("defaults the version to 1 when omitted", () => {
    expect(toEngineConfig(input()).version).toBe(1);
  });

  it("preserves an explicit version", () => {
    expect(toEngineConfig(input({ version: 5 })).version).toBe(5);
  });

  it("folds column metadata into the vendor block and spreads the body", () => {
    const cfg = toEngineConfig(input());
    expect(cfg.slug).toBe("edesur");
    expect(cfg.vendor).toEqual({
      slug: "edesur",
      displayName: "Edesur",
    });
    expect(cfg.detect).toEqual({ allOf: [{ pattern: "EDESUR" }] });
    expect(cfg.captures).toHaveLength(1);
  });
});

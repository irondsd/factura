import { describe, expect, it } from "vitest";
import type { ParserConfig } from "@/parsers/engine/types";
import { findLikelyPii, hasSlugCollision, mergeConfigSets } from "./registry";

/** Minimal ParserConfig stub — only `slug` matters to the set-composition
 * logic, so the rest is filled with empty engine sections. */
function cfg(slug: string, version = 1): ParserConfig {
  return {
    slug,
    version,
    vendor: { slug, displayName: slug, category: "other" },
    detect: {},
    captures: [],
    roles: {
      identity: { sources: [] },
      amount: { sources: [] },
      period: { sources: [] },
      dueDate: { sources: [] },
    },
  };
}

describe("mergeConfigSets", () => {
  it("returns adopted configs when the user owns none", () => {
    const merged = mergeConfigSets([], [cfg("edesur"), cfg("metrogas")]);
    expect(merged.map((c) => c.slug).sort()).toEqual(["edesur", "metrogas"]);
  });

  it("returns own configs when nothing is adopted", () => {
    const merged = mergeConfigSets([cfg("mine")], []);
    expect(merged.map((c) => c.slug)).toEqual(["mine"]);
  });

  it("unions distinct slugs from both sides", () => {
    const merged = mergeConfigSets([cfg("a")], [cfg("b"), cfg("c")]);
    expect(merged.map((c) => c.slug).sort()).toEqual(["a", "b", "c"]);
  });

  it("lets the user's OWN package shadow an adopted one with the same slug", () => {
    // Same slug, different draft revision: the owner's edit must win.
    const own = cfg("edesur", 7);
    const adopted = cfg("edesur", 2);
    const merged = mergeConfigSets([own], [adopted]);
    expect(merged).toHaveLength(1);
    expect(merged[0].version).toBe(7);
  });

  it("does not mutate its inputs", () => {
    const own = [cfg("a")];
    const adopted = [cfg("b")];
    mergeConfigSets(own, adopted);
    expect(own).toHaveLength(1);
    expect(adopted).toHaveLength(1);
  });
});

describe("hasSlugCollision", () => {
  it("flags a slug already present in the set", () => {
    expect(hasSlugCollision([cfg("edesur"), cfg("metrogas")], "edesur")).toBe(
      true,
    );
  });

  it("allows a slug not in the set", () => {
    expect(hasSlugCollision([cfg("edesur")], "metrogas")).toBe(false);
  });

  it("is false for an empty set", () => {
    expect(hasSlugCollision([], "anything")).toBe(false);
  });
});

describe("findLikelyPii", () => {
  it("flags a 7+ digit literal nested in a detect signature", () => {
    const body = {
      detect: { allOf: [{ pattern: "Cuenta: 1234567890", flags: "i" }] },
      captures: [],
    };
    expect(findLikelyPii(body)).toEqual(["1234567890"]);
  });

  it("ignores short digit groups, years and regex quantifiers", () => {
    const body = {
      detect: { allOf: [{ pattern: "EDESUR S.A. 2025" }] },
      captures: [{ pattern: "Total\\s+\\$\\s*([\\d.,]+)", outputs: {} }],
      compute: [{ name: "p", template: "{y}-{m}-01" }],
    };
    expect(findLikelyPii(body)).toEqual([]);
  });

  it("dedupes repeated literals and walks arrays + nested objects", () => {
    const body = {
      a: ["8881111222", "8881111222"],
      b: { c: { d: "no digits here" } },
    };
    expect(findLikelyPii(body)).toEqual(["8881111222"]);
  });

  it("is empty for non-object input", () => {
    expect(findLikelyPii(null)).toEqual([]);
    expect(findLikelyPii("12345")).toEqual([]);
  });
});

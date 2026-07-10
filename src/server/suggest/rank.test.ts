import { describe, expect, it } from "vitest";
import { rankSuggestions, type Suggestion } from "./rank";

/** Minimal Suggestion stub — only the fields the sort reads matter. */
function sug(over: Partial<Suggestion> & { slug: string }): Suggestion {
  return {
    configId: over.slug,
    versionId: `${over.slug}-v`,
    displayName: over.displayName ?? over.slug,
    vendorSlug: over.slug,
    verified: false,
    adoptionCount: 0,
    ok: true,
    error: null,
    result: null,
    customDefs: [],
    score: 0,
    ...over,
  };
}

const order = (items: Suggestion[]) =>
  rankSuggestions(items).map((s) => s.slug);

describe("rankSuggestions", () => {
  it("puts verified (official) parsers first", () => {
    const out = order([
      sug({ slug: "community", verified: false, score: 99 }),
      sug({ slug: "official", verified: true, score: 1 }),
    ]);
    expect(out).toEqual(["official", "community"]);
  });

  it("prefers clean extraction over a detected-but-failed parser", () => {
    const out = order([
      sug({ slug: "failed", ok: false, score: 50 }),
      sug({ slug: "clean", ok: true, score: 1 }),
    ]);
    expect(out).toEqual(["clean", "failed"]);
  });

  it("breaks ties by detection specificity then adoption count", () => {
    expect(
      order([
        sug({ slug: "loose", score: 1, adoptionCount: 100 }),
        sug({ slug: "tight", score: 5, adoptionCount: 0 }),
      ]),
    ).toEqual(["tight", "loose"]);

    expect(
      order([
        sug({ slug: "rare", score: 3, adoptionCount: 2 }),
        sug({ slug: "popular", score: 3, adoptionCount: 40 }),
      ]),
    ).toEqual(["popular", "rare"]);
  });

  it("is a stable pure sort (does not mutate input, ties fall back to name)", () => {
    const input = [sug({ slug: "b" }), sug({ slug: "a" })];
    const out = rankSuggestions(input);
    expect(out.map((s) => s.slug)).toEqual(["a", "b"]);
    // input untouched
    expect(input.map((s) => s.slug)).toEqual(["b", "a"]);
  });
});

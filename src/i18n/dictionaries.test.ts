import { describe, expect, it } from "vitest";
import en from "./dictionaries/en.json";
import es from "./dictionaries/es.json";
import { interpolate } from "./config";

// Key parity between the dictionaries is already guaranteed by the compiler:
// `getDictionary` types both loaders as `Promise<Dictionary>`, and Dictionary is
// `typeof es.json`, so a key missing from en.json fails `tsc`.
//
// What the compiler CANNOT see is the inside of the strings. `interpolate`
// substitutes `{token}` at runtime, so an en translation that drops a token its
// es counterpart has still type-checks — and then silently renders "up to
// files" instead of "up to 10 files". These tests cover that gap.

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** Every string in the dictionary, keyed by its dotted path. */
function flatten(value: Json, path = "", out = new Map<string, string>()) {
  if (typeof value === "string") {
    out.set(path, value);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => flatten(v, `${path}[${i}]`, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      flatten(v, path ? `${path}.${k}` : k, out);
    }
  }
  return out;
}

const placeholders = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const esStrings = flatten(es as Json);
const enStrings = flatten(en as Json);

describe("dictionary interpolation placeholders", () => {
  it("uses the same tokens in both languages", () => {
    const mismatches: string[] = [];
    for (const [path, esValue] of esStrings) {
      const enValue = enStrings.get(path);
      if (enValue === undefined) continue; // arrays may differ in length
      const a = placeholders(esValue);
      const b = placeholders(enValue);
      if (a.join(",") !== b.join(",")) {
        mismatches.push(`${path}: es{${a.join(",")}} vs en{${b.join(",")}}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("leaves no unsubstituted token behind for the /probar copy", () => {
    // Every placeholder the page uses must be one the call sites actually pass.
    // A typo'd token ({dias} for {days}) type-checks and renders literally.
    const known = new Set([
      "max",
      "days",
      "count",
      "file",
      "pages",
      "chars",
      "vendor",
      "tier",
      "slug",
    ]);
    const unknown: string[] = [];
    for (const [path, value] of esStrings) {
      if (!path.startsWith("probar.")) continue;
      for (const token of placeholders(value)) {
        if (!known.has(token)) unknown.push(`${path}: {${token}}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it("has no empty strings in the /probar copy", () => {
    const blank = [...esStrings]
      .concat([...enStrings])
      .filter(([path, value]) => path.startsWith("probar.") && !value.trim())
      .map(([path]) => path);
    expect(blank).toEqual([]);
  });
});

describe("interpolate", () => {
  it("substitutes every token it is given", () => {
    expect(interpolate("up to {max} files", { max: 10 })).toBe(
      "up to 10 files",
    );
  });

  it("leaves an unknown token visible rather than blank", () => {
    // Documents current behaviour: a missing var is loud in the UI, which is
    // what makes the placeholder tests above worth having.
    expect(interpolate("hi {name}", {})).toContain("{name}");
  });
});

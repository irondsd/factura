import { describe, expect, it } from "vitest";
import {
  CMS_SEARCHABLE_SECTIONS,
  highlightSegments,
  isSearchableTerm,
  normalizeSearchSections,
  tidyExcerpt,
} from "./search";

const text = (segments: { text: string }[]) =>
  segments.map((segment) => segment.text).join("");

describe("normalizeSearchSections", () => {
  it("keeps the chips that name a section, in registry order", () => {
    // Registry order, not the order they were toggled: the chips and the state
    // they describe should read the same way round.
    expect(normalizeSearchSections(["noticias", "guias"])).toEqual([
      "guias",
      "noticias",
    ]);
  });

  it("drops a section id nothing answers to", () => {
    expect(normalizeSearchSections(["guias", "podcasts"])).toEqual(["guias"]);
  });

  it("does not turn «ninguna» into «todas»", () => {
    // Turning every chip off is a state the overlay lets you reach. It must
    // come back as no sections — searching everything would be the opposite of
    // what was asked for.
    expect(normalizeSearchSections([])).toEqual([]);
  });

  it("offers only sections that have an editor behind them", () => {
    expect(
      CMS_SEARCHABLE_SECTIONS.every((section) => section.status === "live"),
    ).toBe(true);
  });
});

describe("isSearchableTerm", () => {
  it("accepts the two-letter terms that are worth searching for", () => {
    expect(isSearchableTerm("m2")).toBe(true);
  });

  it("refuses one letter, and whitespace padded to look like more", () => {
    expect(isSearchableTerm("a")).toBe(false);
    expect(isSearchableTerm("  a  ")).toBe(false);
    expect(isSearchableTerm("   ")).toBe(false);
  });
});

describe("highlightSegments", () => {
  it("marks every occurrence, whatever its case", () => {
    const segments = highlightSegments("Edesur y edesur otra vez", "EDESUR");
    expect(segments.filter((s) => s.match).map((s) => s.text)).toEqual([
      "Edesur",
      "edesur",
    ]);
  });

  it("keeps the original text intact across the split", () => {
    const original = "Cómo leer la factura de Edesur";
    expect(text(highlightSegments(original, "factura"))).toBe(original);
  });

  it("treats the term as literal, not as a pattern", () => {
    // `.` is a character an editor searches for. As a regular expression it
    // would match every letter in the string.
    const segments = highlightSegments("factura.uno y facturauno", ".");
    expect(segments.filter((s) => s.match).map((s) => s.text)).toEqual(["."]);
  });

  it("marks nothing when the term is absent or empty", () => {
    expect(highlightSegments("Edesur", "aysa")).toEqual([
      { text: "Edesur", match: false },
    ]);
    expect(highlightSegments("Edesur", "  ")).toEqual([
      { text: "Edesur", match: false },
    ]);
  });
});

describe("tidyExcerpt", () => {
  it("collapses the whitespace an MDX body is full of", () => {
    expect(tidyExcerpt("una\n\n##  línea   cortada", false)).toBe(
      "…una ## línea cortada…",
    );
  });

  it("opens without an ellipsis when the cut started at the body", () => {
    expect(tidyExcerpt("El medidor mide", true)).toBe("El medidor mide…");
  });

  it("says nothing rather than «…» when the slice is blank", () => {
    expect(tidyExcerpt("   \n ", false)).toBe("");
  });
});

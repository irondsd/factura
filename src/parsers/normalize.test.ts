import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";

describe("normalize", () => {
  it("collapses runs of whitespace into single spaces", () => {
    expect(normalize("a   b\t\nc")).toBe("a b c");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalize("  hello  ")).toBe("hello");
  });

  it("drops 2D-barcode glyph soup tokens", () => {
    expect(normalize("Total ŸĺŖŖŖĺŸùüŵ 100")).toBe("Total 100");
  });

  it("keeps short tokens even if they contain odd glyphs", () => {
    // Tokens under 3 chars are never treated as glyph soup.
    expect(normalize("N° ab")).toBe("N° ab");
  });

  it("keeps ordinary Spanish text with diacritics intact", () => {
    expect(normalize("Periodo facturación Mayo")).toBe(
      "Periodo facturación Mayo",
    );
  });

  it("rejoins diacritics split apart by the PDF extractor", () => {
    expect(normalize("Liquidaci ó n mensual")).toBe("Liquidación mensual");
  });

  it("tightens a degree/ordinal sign onto the preceding token", () => {
    expect(normalize("N ° 1234")).toBe("N° 1234");
    expect(normalize("1 ° piso")).toBe("1° piso");
  });

  it("normalizes the masculine-ordinal variant too", () => {
    expect(normalize("N º 1234")).toBe("N° 1234");
  });
});

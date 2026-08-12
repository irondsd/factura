import { describe, expect, it } from "vitest";
import { missingKeywordWords } from "./content";

describe("missingKeywordWords", () => {
  it("ignores accents, case and function words", () => {
    expect(
      missingKeywordWords(
        "deuda de patentes caba",
        "Deuda de patentes en CABA",
        "Cómo consultar lo que debes",
      ),
    ).toEqual([]);
  });

  it("matches a keyword's noun against the copy's verb", () => {
    // The warning these pages kept raising: the keyword is "aumento de gas en
    // mendoza" and the description says "cuánto aumentaron … el gas", which is
    // the same word and the same page.
    expect(
      missingKeywordWords(
        "aumento de gas en mendoza",
        "Inflación de vivienda, luz y gas en Cuyo",
        "Cuánto aumentaron la vivienda, el agua, la electricidad y el gas en Cuyo —Mendoza, San Juan y San Luis—.",
      ),
    ).toEqual([]);
  });

  it("still reports a word the copy never says", () => {
    // "bajar" stems to "baj" and would match anything, so it isn't stemmed —
    // a page targeting "cómo bajar las expensas" has to say so.
    expect(
      missingKeywordWords(
        "como bajar las expensas",
        "Cómo mantener las expensas bajo control",
        "Qué revisar cada mes en la liquidación de tu edificio.",
      ),
    ).toEqual(["bajar"]);
  });

  it("does not stem a short word into a prefix of something else", () => {
    expect(missingKeywordWords("agua caliente", "Agua y gas", "Boletas")).toEqual(
      ["caliente"],
    );
  });
});

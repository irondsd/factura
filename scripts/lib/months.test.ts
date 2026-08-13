import { describe, expect, it } from "vitest";
import { fromOrdinal, months, ordinal, titleMonths } from "./months";

describe("month arithmetic", () => {
  it("round-trips a period through its ordinal", () => {
    for (const p of ["2010-03", "2013-07", "2015-12", "2026-07"]) {
      expect(fromOrdinal(ordinal(p))).toBe(p);
    }
  });

  it("steps across a year boundary", () => {
    expect(months("2025-11", "2026-02")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("counts the spans the real files declare", () => {
    // Each of these is a title range IDECBA publishes, with the number of data
    // columns (or data rows, for the two city-level tables) the corresponding
    // sheet actually has. The refresh script asserts the two agree, so getting
    // the arithmetic wrong here would defeat the one check standing between a
    // shifted axis and a committed data file.
    expect(months("2013-07", "2026-07")).toHaveLength(157); // MI_DAS2_AX02
    expect(months("2010-03", "2026-07")).toHaveLength(197); // MI_DAN_AX02
  });

  it("is inclusive of both ends", () => {
    expect(months("2026-07", "2026-07")).toEqual(["2026-07"]);
  });
});

describe("titleMonths", () => {
  const title =
    "Superficie total (metros cuadrados) de departamentos publicados en " +
    "alquiler de 2 ambientes (usados y a estrenar) por barrio. " +
    "Ciudad de Buenos Aires. Julio de 2013/julio de 2026";

  it("reads the range out of a published title", () => {
    expect(titleMonths(title)).toEqual({ start: "2013-07", end: "2026-07" });
  });

  it("does not care that only the opening month is capitalised", () => {
    // How IDECBA actually writes it: the first month opens the sentence, the
    // second does not, and the same table's two ends therefore disagree in case.
    expect(titleMonths("Marzo de 2010/julio de 2026")).toEqual({
      start: "2010-03",
      end: "2026-07",
    });
  });

  it("accepts either spelling of September", () => {
    expect(titleMonths("Setiembre de 2011/septiembre de 2012")).toEqual({
      start: "2011-09",
      end: "2012-09",
    });
  });

  it("throws rather than guess when the title changes shape", () => {
    // A quarterly title, which is the realistic mix-up: the two axes live side
    // by side in one script and the sheets are otherwise identical in shape.
    expect(() =>
      titleMonths(
        "Precio promedio. 1er. trimestre de 2018/2do. trimestre 2026",
      ),
    ).toThrow(/could not read a month range/);
    expect(() => titleMonths("Julio de 2013")).toThrow();
  });

  it("throws when the range runs backwards", () => {
    expect(() => titleMonths("Julio de 2026/marzo de 2010")).toThrow(
      /backwards/,
    );
  });
});

import { describe, expect, it } from "vitest";
import { fromOrdinal, ordinal, quarters, titleRange } from "./quarters";
import { columnIndex } from "./xlsx";

describe("quarter arithmetic", () => {
  it("round-trips a period through its ordinal", () => {
    for (const p of ["2006Q4", "2017Q1", "2020Q3", "2026Q2"]) {
      expect(fromOrdinal(ordinal(p))).toBe(p);
    }
  });

  it("steps across a year boundary", () => {
    expect(quarters("2025Q3", "2026Q2")).toEqual([
      "2025Q3",
      "2025Q4",
      "2026Q1",
      "2026Q2",
    ]);
  });

  it("counts the spans the real files declare", () => {
    // Each of these is a title range IDECBA publishes, with the number of data
    // columns the corresponding sheet actually has. The refresh script asserts
    // the two agree, so getting the arithmetic wrong here would defeat the one
    // check standing between a shifted axis and a committed data file.
    expect(quarters("2017Q1", "2026Q2")).toHaveLength(38); // MI_DVP_AX10
    expect(quarters("2006Q4", "2026Q2")).toHaveLength(79); // MI_DVP_AX03
    expect(quarters("2015Q1", "2026Q2")).toHaveLength(46); // MI_DVP_AX07
    expect(quarters("2018Q1", "2026Q2")).toHaveLength(34); // MI_DAP_AX10
  });

  it("is inclusive of both ends", () => {
    expect(quarters("2026Q2", "2026Q2")).toEqual(["2026Q2"]);
  });
});

describe("titleRange", () => {
  const title =
    "Precio promedio de publicación del metro cuadrado (dólares) de departamentos " +
    "en venta de 2 ambientes usados por barrio. Ciudad de Buenos Aires. " +
    "4to. trimestre de 2006/2do. trimestre de 2026";

  it("reads the range out of a published title", () => {
    expect(titleRange(title)).toEqual({ start: "2006Q4", end: "2026Q2" });
  });

  it("tolerates the missing period after the ordinal", () => {
    expect(titleRange("1er trimestre de 2018/3er trimestre de 2025")).toEqual({
      start: "2018Q1",
      end: "2025Q3",
    });
  });

  it("throws rather than guess when the title changes shape", () => {
    expect(() => titleRange("Precio promedio. Marzo de 2010/junio de 2026")).toThrow(
      /could not read a quarter range/,
    );
    expect(() => titleRange("1er. trimestre de 2018")).toThrow();
  });

  it("throws when the range runs backwards", () => {
    expect(() => titleRange("2do. trimestre de 2026/1er. trimestre de 2017")).toThrow(
      /backwards/,
    );
  });
});

describe("columnIndex", () => {
  it("maps spreadsheet columns to zero-based indices", () => {
    // Bijective base-26: there is no zero digit, so AA is 27 and not 1. The
    // sale tables run past column AM, which is where a naive implementation
    // starts placing values in the wrong quarter.
    expect(columnIndex("A1")).toBe(0);
    expect(columnIndex("Z1")).toBe(25);
    expect(columnIndex("AA1")).toBe(26);
    expect(columnIndex("AM2")).toBe(38);
    expect(columnIndex("BA10")).toBe(52);
    expect(columnIndex("CB100")).toBe(79);
  });
});

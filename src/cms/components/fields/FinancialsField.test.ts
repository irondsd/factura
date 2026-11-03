import { describe, expect, it } from "vitest";
import { parseFinancialValue } from "./FinancialsField";

describe("financial value entry", () => {
  it.each([
    ["", null],
    ["  ", null],
    ["0", 0],
    ["-25,4", -25.4],
    ["1234.56", 1234.56],
  ])("reads %j without treating missing data as zero", (text, expected) => {
    expect(parseFinancialValue(text as string)).toBe(expected);
  });
  it.each(["1.234,56", "1e6", "12 pesos", "-", "1,"])(
    "keeps invalid or unfinished text %s for validation",
    (text) => {
      expect(parseFinancialValue(text)).toBe(text);
    },
  );
});

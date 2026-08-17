import { describe, expect, it } from "vitest";
import { linearFit, median, percentileRanks } from "./statistics";

describe("percentileRanks", () => {
  it("keeps ranks aligned with unsorted input", () => {
    expect(percentileRanks([30, 10, 20])).toEqual([1, 0, 0.5]);
  });

  it("gives ties their shared average position", () => {
    expect(percentileRanks([10, 20, 20, 40])).toEqual([0, 0.5, 0.5, 1]);
  });

  it("handles empty and one-observation samples", () => {
    expect(percentileRanks([])).toEqual([]);
    expect(percentileRanks([7])).toEqual([0.5]);
  });
});

describe("linearFit", () => {
  it("fits a line and reports its correlation", () => {
    expect(linearFit([1, 2, 3, 4], [3, 5, 7, 9])).toEqual({
      slope: 2,
      intercept: 1,
      r: 1,
      r2: 1,
      n: 4,
    });
  });

  it("preserves the sign of a negative relationship", () => {
    const fit = linearFit([1, 2, 3], [6, 4, 2]);
    expect(fit?.slope).toBe(-2);
    expect(fit?.r).toBe(-1);
    expect(fit?.r2).toBe(1);
  });

  it("rejects invalid or constant samples", () => {
    expect(linearFit([1], [2])).toBeNull();
    expect(linearFit([1, 2], [3])).toBeNull();
    expect(linearFit([1, 1], [2, 3])).toBeNull();
    expect(linearFit([1, 2], [3, 3])).toBeNull();
  });
});

describe("median", () => {
  it("handles odd, even and empty samples without mutating input", () => {
    const values = [9, 1, 4, 2];
    expect(median(values)).toBe(3);
    expect(values).toEqual([9, 1, 4, 2]);
    expect(median([9, 1, 4])).toBe(4);
    expect(median([])).toBeNull();
  });
});

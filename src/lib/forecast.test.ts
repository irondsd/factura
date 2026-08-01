import { describe, expect, it } from "vitest";
import { detectCadence, isDue, MAX_CADENCE } from "./forecast";

describe("detectCadence", () => {
  it("reads a clean monthly run as monthly", () => {
    expect(detectCadence(["2026-01", "2026-02", "2026-03", "2026-04"])).toBe(1);
  });

  it("reads a clean bi-monthly run as bi-monthly", () => {
    expect(detectCadence(["2026-01", "2026-03", "2026-05", "2026-07"])).toBe(2);
  });

  it("reads a quarterly run as quarterly", () => {
    expect(detectCadence(["2025-10", "2026-01", "2026-04", "2026-07"])).toBe(3);
  });

  it("does not mistake one missed upload for a longer cadence", () => {
    // Apr never got uploaded; the account is still plainly monthly.
    expect(
      detectCadence(["2026-01", "2026-02", "2026-03", "2026-05", "2026-06"]),
    ).toBe(1);
  });

  it("holds a bi-monthly reading through a missed upload", () => {
    // May is missing from an otherwise Jan/Mar/May/Jul/Sep cycle.
    expect(detectCadence(["2026-01", "2026-03", "2026-07", "2026-09"])).toBe(2);
  });

  it("falls back to monthly below three observed periods", () => {
    expect(detectCadence([])).toBe(1);
    expect(detectCadence(["2026-07"])).toBe(1);
    // Two periods are a single gap — indistinguishable from a missed upload.
    expect(detectCadence(["2026-01", "2026-03"])).toBe(1);
  });

  it("breaks ties toward the shorter cadence", () => {
    // One 1-month gap and one 2-month gap: prefer monthly, which keeps the
    // account visible rather than silently hiding an expected bill.
    expect(detectCadence(["2026-01", "2026-02", "2026-04"])).toBe(1);
  });

  it("ignores gaps longer than a year rather than reading them as a cycle", () => {
    // A dormant account that resumes: the 20-month silence is not the cadence.
    expect(
      detectCadence(["2024-01", "2024-02", "2025-10", "2025-11", "2025-12"]),
    ).toBe(1);
  });

  it("accepts an annual cadence but nothing longer", () => {
    expect(detectCadence(["2024-03", "2025-03", "2026-03"])).toBe(12);
    expect(MAX_CADENCE).toBe(12);
    // Every gap is out of range, so nothing outvotes the monthly default.
    expect(detectCadence(["2010-01", "2014-01", "2018-01"])).toBe(1);
  });

  it("is order- and duplicate-insensitive", () => {
    expect(detectCadence(["2026-05", "2026-01", "2026-03", "2026-03"])).toBe(2);
  });

  it("spans year boundaries", () => {
    expect(detectCadence(["2025-09", "2025-11", "2026-01", "2026-03"])).toBe(2);
  });
});

describe("isDue", () => {
  it("treats every month as due for a monthly account", () => {
    expect(isDue("2026-07", "2026-08", 1)).toBe(true);
    expect(isDue("2026-07", "2026-09", 1)).toBe(true);
  });

  it("skips off-cycle months for a bi-monthly account", () => {
    // Last bill May, billing every 2 months: Jul is due, Aug is not.
    expect(isDue("2026-05", "2026-07", 2)).toBe(true);
    expect(isDue("2026-08", "2026-08", 2)).toBe(true); // the period itself
    expect(isDue("2026-05", "2026-08", 2)).toBe(false);
    expect(isDue("2026-05", "2026-09", 2)).toBe(true);
  });

  it("counts the last observed period itself as on-cycle", () => {
    expect(isDue("2026-08", "2026-08", 3)).toBe(true);
  });

  it("is never due for a month before the last observed period", () => {
    expect(isDue("2026-08", "2026-07", 1)).toBe(false);
    expect(isDue("2026-08", "2026-06", 2)).toBe(false);
  });

  it("treats an account that has never billed as due", () => {
    expect(isDue(null, "2026-08", 1)).toBe(true);
    expect(isDue(null, "2026-08", 2)).toBe(true);
  });

  it("spans year boundaries", () => {
    expect(isDue("2025-11", "2026-01", 2)).toBe(true);
    expect(isDue("2025-11", "2026-02", 2)).toBe(false);
  });

  it("treats a nonsense cadence as monthly rather than dividing by zero", () => {
    expect(isDue("2026-07", "2026-08", 0)).toBe(true);
  });
});

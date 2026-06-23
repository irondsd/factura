import { describe, expect, it } from "vitest";
import {
  currentMonth,
  formatARS,
  formatMoney,
  formatMonth,
  formatMonthShort,
  formatUSD,
  shiftMonth,
} from "./format";

describe("formatARS / formatUSD", () => {
  it("renders an em-dash for null/undefined", () => {
    expect(formatARS(null)).toBe("—");
    expect(formatARS(undefined)).toBe("—");
    expect(formatUSD(null)).toBe("—");
  });

  it("formats ARS with dot thousands and comma decimals", () => {
    expect(formatARS(1646.24)).toMatch(/1\.646,24/);
  });

  it("accepts numeric strings", () => {
    expect(formatARS("1646.24")).toMatch(/1\.646,24/);
  });

  it("keeps two decimals for USD", () => {
    expect(formatUSD(1646.24)).toMatch(/1\.646,24/);
  });
});

describe("formatMoney", () => {
  it("rounds ARS to whole pesos (no decimals)", () => {
    const out = formatMoney(1646.24, "ARS");
    expect(out).toMatch(/1\.646/);
    expect(out).not.toMatch(/,/); // no decimal part
  });

  it("rounds ARS half-up like the underlying Intl formatter", () => {
    expect(formatMoney(1646.6, "ARS")).toMatch(/1\.647/);
  });

  it("keeps two decimals for USD", () => {
    expect(formatMoney(1646.24, "USD")).toMatch(/1\.646,24/);
  });

  it("renders an em-dash for null", () => {
    expect(formatMoney(null, "ARS")).toBe("—");
    expect(formatMoney(undefined, "USD")).toBe("—");
  });
});

describe("formatMonth / formatMonthShort", () => {
  it("formats a YYYY-MM string as a long month + year", () => {
    expect(formatMonth("2026-06")).toBe("June 2026");
  });

  it("accepts a full YYYY-MM-DD string", () => {
    expect(formatMonth("2026-06-15")).toBe("June 2026");
  });

  it("formats a short month name", () => {
    expect(formatMonthShort("2026-06")).toBe("Jun");
    expect(formatMonthShort("2026-01-31")).toBe("Jan");
  });

  it("is stable across the day-rollover edge (UTC, first of month)", () => {
    // A naive local-time Date would slip to the previous month in negative
    // offsets; formatMonth pins to UTC so December stays December.
    expect(formatMonth("2026-12")).toBe("December 2026");
  });
});

describe("shiftMonth", () => {
  it("shifts forward within a year", () => {
    expect(shiftMonth("2026-06", 1)).toBe("2026-07");
  });

  it("shifts back across a year boundary", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("shifts forward across a year boundary", () => {
    expect(shiftMonth("2026-11", 3)).toBe("2027-02");
  });

  it("is a no-op for delta 0", () => {
    expect(shiftMonth("2026-06", 0)).toBe("2026-06");
  });
});

describe("currentMonth", () => {
  it("returns a YYYY-MM string", () => {
    expect(currentMonth()).toMatch(/^\d{4}-\d{2}$/);
  });
});

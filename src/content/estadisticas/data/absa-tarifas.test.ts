import { describe, expect, it } from "vitest";
import {
  changeBetween,
  coefAt,
  COEFFICIENTS,
  COMMERCIAL_SHOCK,
  CUMULATIVE_2026,
  IPC,
  LAST_STEP,
  MONTHS,
  PEAK_REAL,
  REAL_THROUGH,
  STEPS,
  vmAt,
  WORST_LAG,
} from "./absa-tarifas";

// This dataset is typed in by hand from decrees rather than built by a script,
// so the failure mode is not a parser drifting a column — it is a transcription
// slip in a figure nobody recomputes. These tests pin the things a wrong digit
// would break: the ordering the step function depends on, the arithmetic
// identity the commercial figure is built on, and the two readings the prose
// states as findings.

describe("absa-tarifas", () => {
  it("keeps both series in ascending period order", () => {
    for (const series of [STEPS, IPC, COEFFICIENTS]) {
      const periods = series.map((r) => r.period);
      expect([...periods].sort()).toEqual(periods);
      expect(new Set(periods).size).toBe(periods.length);
    }
  });

  it("holds each value flat until the next decree", () => {
    // The property the staircase depends on: a month between two steps bills at
    // the earlier one. February's value ran for four months because no April
    // update happened, which is the case most likely to be "fixed" by mistake.
    expect(vmAt("202601")).toBe(196.76);
    expect(vmAt("202602")).toBe(275.46);
    expect(vmAt("202603")).toBe(275.46);
    expect(vmAt("202605")).toBe(275.46);
    expect(vmAt("202606")).toBe(292.5);
    expect(STEPS.some((s) => s.period === "202604")).toBe(false);
  });

  it("decomposes the commercial rise into tariff and coefficient, exactly", () => {
    // The page's central claim, and the reason the reconstructed February
    // values are trustworthy: two independently reported figures reproducing a
    // coefficient written in a decree.
    expect(COMMERCIAL_SHOCK.commercialBefore).toBeCloseTo(255.79, 2);
    expect(COMMERCIAL_SHOCK.commercialAfter).toBeCloseTo(440.74, 2);

    const compounded =
      (1 + COMMERCIAL_SHOCK.tariffPart / 100) *
        (1 + COMMERCIAL_SHOCK.coefPart / 100) -
      1;
    expect(compounded * 100).toBeCloseTo(COMMERCIAL_SHOCK.total, 6);
    expect(COMMERCIAL_SHOCK.tariffPart).toBeCloseTo(40, 1);
    expect(COMMERCIAL_SHOCK.total).toBeCloseTo(72.3, 1);
  });

  it("reads the coefficient as a step function too", () => {
    expect(coefAt("202601")).toBe(1.3);
    expect(coefAt("202602")).toBe(1.6);
    expect(coefAt("202608")).toBe(1.6);
  });

  it("stops the real-terms series where the IPC stops", () => {
    // The nominal series runs ahead of the deflated one by design — a decree is
    // published before it applies. Every month past the IPC must carry a null
    // rather than an index silently held over from the last published month.
    expect(REAL_THROUGH).toBe(IPC[IPC.length - 1].period);
    expect(MONTHS[MONTHS.length - 1].period).toBe(LAST_STEP.period);
    for (const m of MONTHS) {
      const hasIpc = IPC.some((r) => r.period === m.period);
      expect(m.ipcIndex === null).toBe(!hasIpc);
      expect(m.realGap === null).toBe(!hasIpc);
    }
  });

  it("finds the lag and the overshoot the page describes", () => {
    // The narrative: fourteen months losing ground, then a correction that
    // overshot. If either sign flips, the prose is wrong.
    expect(WORST_LAG.realGap).toBeLessThan(0);
    expect(WORST_LAG.period).toBe("202511");
    expect(PEAK_REAL.realGap).toBeGreaterThan(0);
    expect(PEAK_REAL.period).toBe("202602");
    // The correction lands the month the 40 % takes effect, not before it.
    expect(Number(PEAK_REAL.period)).toBeGreaterThan(Number(WORST_LAG.period));
  });

  it("computes the 2026 cumulative the headline uses", () => {
    expect(CUMULATIVE_2026).toBeCloseTo(59.9, 1);
    expect(changeBetween("202512", "202602")).toBeCloseTo(40, 1);
  });
});

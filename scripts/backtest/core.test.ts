import { describe, expect, it } from "vitest";
import type { FxPoint, Observation } from "../../src/lib/forecast";
import { shiftMonth } from "../../src/lib/format";
import {
  type Account,
  backtest,
  bestRung,
  quantile,
  render,
  RUNGS,
  tierOf,
} from "./core";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function series(
  end: string,
  n: number,
  base: number,
  growth: number,
  seasonal: Record<number, number> = {},
): Observation[] {
  return Array.from({ length: n }, (_, i) => {
    const month = shiftMonth(end, -(n - 1 - i));
    return {
      month,
      amount: base * growth ** i * (seasonal[Number(month.slice(5, 7))] ?? 1),
    };
  });
}

const account = (
  label: string,
  history: Observation[],
  propertyId = "p1",
): Account => ({
  accountId: label,
  propertyId,
  vendorSlug: label,
  label,
  history,
});

const noFx: FxPoint[] = [];

/** Median APE for one rung of a whole report. */
const med = (r: ReturnType<typeof backtest>, key: string) =>
  r.overall.get(key)!.summary().median;

describe("quantile", () => {
  it("interpolates between neighbours", () => {
    expect(quantile([0, 1, 2, 3, 4], 0.5)).toBe(2);
    expect(quantile([0, 10], 0.9)).toBeCloseTo(9, 10);
  });

  it("is NaN for an empty list rather than 0", () => {
    // 0 would read as a perfect score, which is the opposite of "no data".
    expect(quantile([], 0.5)).toBeNaN();
  });
});

describe("tierOf", () => {
  it("classifies by span, not by observation count", () => {
    expect(tierOf(series("2026-07", 2, 100, 1))).toBe("carry");
    expect(tierOf(series("2026-07", 6, 100, 1))).toBe("baseline");
    expect(tierOf(series("2026-07", 12, 100, 1))).toBe("baseline");
    expect(tierOf(series("2026-07", 24, 100, 1))).toBe("yoy");

    // The distinction that matters: a bi-monthly account reaches 'yoy' on half
    // the observations, because what the YoY anchor needs is a year of *span*.
    const biMonthly = series("2026-07", 24, 100, 1).filter(
      (_, i) => i % 2 === 0,
    );
    expect(biMonthly).toHaveLength(12);
    expect(tierOf(biMonthly)).toBe("yoy");
  });
});

describe("backtest", () => {
  it("scores a perfectly predictable account at near zero error", () => {
    const r = backtest(
      [account("flat", series("2026-07", 24, 100_000, 1))],
      noFx,
    );
    expect(r.scored).toBeGreaterThan(15);
    expect(med(r, "full")).toBeLessThan(0.01);
  });

  it("scores every rung on the same predictions", () => {
    const r = backtest(
      [account("a", series("2026-07", 30, 100_000, 1.02))],
      noFx,
    );
    for (const rung of RUNGS) {
      expect(r.overall.get(rung.key)!.n).toBe(r.scored);
    }
  });

  it("de-trending removes the lag a plain median has on a rising series", () => {
    // The failure the real backtest exposed: median-of-3 lands on the middle
    // observation, so on an inflating series it is ~1 month stale. De-trending
    // before taking the median should recover that without losing robustness.
    const r = backtest(
      [account("expensas", series("2026-07", 30, 200_000, 1.05))],
      noFx,
    );
    expect(med(r, "detrended")).toBeLessThan(med(r, "median"));
  });

  it("keeps de-trending robust to a single wild outlier", () => {
    // Robustness is the only reason to use a median at all — if de-trending
    // gave that up it would just be a slower `carry`.
    const clean = series("2026-07", 30, 100_000, 1.02);
    const spiked = clean.map((o, i) =>
      i === clean.length - 2 ? { ...o, amount: o.amount * 40 } : o,
    );
    const r = backtest([account("a", spiked)], noFx);
    expect(med(r, "detrended")).toBeLessThan(med(r, "carry"));
  });

  it("ranks the rungs correctly on a strongly seasonal account", () => {
    const h = series("2026-07", 36, 40_000, 1.02, { 6: 3, 7: 3, 8: 3 });
    const r = backtest([account("gas", h)], noFx);
    expect(med(r, "median+gap")).toBeLessThan(med(r, "median"));
    expect(med(r, "full")).toBeLessThan(med(r, "median+gap"));
  });

  it("shows the exact-anchor variant surviving a missing seasonal month", () => {
    // Gas at a turning point with one upload missing: the ±1 tolerance grabs a
    // neighbouring month from a different season. The exact-anchor rung
    // declines to guess and falls back to the baseline instead.
    const winter: Record<number, number> = { 6: 4, 7: 4, 8: 4, 5: 2, 9: 2 };
    const full = series("2026-08", 36, 12_000, 1.02, winter);
    const gappy = full.filter((o) => !o.month.endsWith("-09"));
    const r = backtest([account("gas", gappy)], noFx);
    expect(med(r, "yoy-exact")).toBeLessThanOrEqual(med(r, "full"));
  });

  it("never lets a prediction see its own month or later", () => {
    // A single enormous final month must not improve the prediction OF that
    // month. If leakage existed, the error on it would collapse.
    const clean = series("2026-07", 24, 100_000, 1);
    const spiked = clean.map((o, i) =>
      i === clean.length - 1 ? { ...o, amount: 10_000_000 } : o,
    );
    const r = backtest([account("leaky", spiked)], noFx);
    expect(Math.max(...r.overall.get("full")!.apes)).toBeGreaterThan(0.9);
  });

  it("keeps household pooling inside a property", () => {
    // A wildly inflating account in ANOTHER property must not drag this one's
    // drift up.
    const mine = series("2026-07", 12, 100_000, 1);
    const other = series("2026-07", 12, 50_000, 1.4);
    const mineIn = (r: ReturnType<typeof backtest>) =>
      r.perAccount.get("mine")!.get("full")!.summary().median;
    expect(
      mineIn(
        backtest(
          [account("mine", mine, "p1"), account("other", other, "p2")],
          noFx,
        ),
      ),
    ).toBeLessThan(
      mineIn(
        backtest(
          [account("mine", mine, "p1"), account("other", other, "p1")],
          noFx,
        ),
      ),
    );
  });

  it("counts an off-cycle month as a cadence miss instead of a huge error", () => {
    const h: Observation[] = [];
    for (let i = 0; i < 12; i++) {
      h.push({ month: shiftMonth("2026-01", -2 * i), amount: 50_000 });
    }
    h.push({ month: "2026-02", amount: 50_000 }); // off-cycle
    const r = backtest([account("gas", h)], noFx);
    expect(r.cadenceMisses).toBeGreaterThan(0);
    expect(med(r, "full")).toBeLessThan(0.1);
  });

  it("honours --from", () => {
    const h = series("2026-07", 24, 100_000, 1);
    const all = backtest([account("a", h)], noFx);
    const recent = backtest([account("a", h)], noFx, { from: "2026-01" });
    expect(recent.scored).toBeLessThan(all.scored);
    expect(recent.earliest >= "2026-01").toBe(true);
  });

  it("scores nothing when there is nothing to score", () => {
    const r = backtest([account("a", [{ month: "2026-07", amount: 1 }])], noFx);
    expect(r.scored).toBe(0);
    expect(r.perAccount.size).toBe(0);
  });
});

describe("bestRung", () => {
  it("picks the lowest median and reports the gain over plain carry", () => {
    const r = backtest(
      [account("gas", series("2026-07", 36, 40_000, 1.02, { 7: 3, 8: 3 }))],
      noFx,
    );
    const best = bestRung(r.overall)!;
    expect(best.median).toBe(
      Math.min(
        ...RUNGS.map((x) => r.overall.get(x.key)!.summary().median).filter(
          (v) => Number.isFinite(v),
        ),
      ),
    );
    expect(best.vsCarry).toBeGreaterThanOrEqual(0);
  });

  it("is null for a slice with no scored predictions", () => {
    expect(bestRung(new Map())).toBeNull();
  });
});

describe("render", () => {
  it("produces a report naming every rung and both matrices", () => {
    const out = render(
      backtest([account("a", series("2026-07", 30, 100_000, 1.02))], noFx),
    );
    for (const rung of RUNGS) expect(out).toContain(rung.label);
    for (const heading of ["BY TIER", "BY VENDOR"]) {
      expect(out).toContain(heading);
    }
  });

  it("marks the winning rung in each matrix row", () => {
    const out = render(
      backtest([account("a", series("2026-07", 30, 100_000, 1.02))], noFx),
    );
    expect(out).toContain("*");
  });

  it("omits the per-account section unless asked", () => {
    const r = backtest([account("a", series("2026-07", 24, 100_000, 1))], noFx);
    expect(render(r)).not.toContain("BY ACCOUNT");
    expect(render(r, { verbose: true })).toContain("BY ACCOUNT");
  });
});

import { describe, expect, it } from "vitest";
import type { FxPoint, Observation } from "../../src/lib/forecast";
import { shiftMonth } from "../../src/lib/format";
import { type Account, backtest, quantile, render, tierOf } from "./core";

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
    expect(r.overall.get("full")!.summary().median).toBeLessThan(0.01);
  });

  it("ranks the rungs correctly on a seasonal account", () => {
    // The whole reason the ladder exists: on a series with both a trend and
    // seasonality, each rung should beat the one above it.
    const h = series("2026-07", 36, 40_000, 1.02, { 6: 3, 7: 3, 8: 3 });
    const r = backtest([account("gas", h)], noFx);
    const median = (k: string) => r.overall.get(k)!.summary().median;

    expect(median("median+gap")).toBeLessThan(median("median"));
    expect(median("full")).toBeLessThan(median("median+gap"));
  });

  it("reports the trend-only rungs as worse than carry is not assumed", () => {
    // On a purely inflating series with no seasonality the YoY blend should not
    // be *worse* than the simpler rungs — a regression here means the blend is
    // actively harmful on the common case.
    const r = backtest(
      [account("expensas", series("2026-07", 36, 200_000, 1.03))],
      noFx,
    );
    const median = (k: string) => r.overall.get(k)!.summary().median;
    expect(median("full")).toBeLessThanOrEqual(median("carry"));
  });

  it("never lets a prediction see its own month or later", () => {
    // A single enormous final month must not improve the prediction OF that
    // month. If leakage existed, the error on it would collapse.
    const clean = series("2026-07", 24, 100_000, 1);
    const spiked = clean.map((o, i) =>
      i === clean.length - 1 ? { ...o, amount: 10_000_000 } : o,
    );
    const r = backtest([account("leaky", spiked)], noFx);
    // The last month is ~100x the level, so its APE must be ~99%.
    expect(Math.max(...r.overall.get("full")!.apes)).toBeGreaterThan(0.9);
  });

  it("keeps household pooling inside a property", () => {
    // A wildly inflating account in ANOTHER property must not drag this one's
    // drift up. Same series, two arrangements, same score.
    const mine = series("2026-07", 12, 100_000, 1);
    const other = series("2026-07", 12, 50_000, 1.4);
    const separate = backtest(
      [account("mine", mine, "p1"), account("other", other, "p2")],
      noFx,
    );
    const together = backtest(
      [account("mine", mine, "p1"), account("other", other, "p1")],
      noFx,
    );
    const mineIn = (r: ReturnType<typeof backtest>) =>
      r.perAccount.get("mine")!.summary().median;
    expect(mineIn(separate)).toBeLessThan(mineIn(together));
  });

  it("counts an off-cycle month as a cadence miss instead of a huge error", () => {
    // Bi-monthly for two years, then a bill lands in an off-cycle month.
    const h: Observation[] = [];
    for (let i = 0; i < 12; i++) {
      h.push({ month: shiftMonth("2026-01", -2 * i), amount: 50_000 });
    }
    h.push({ month: "2026-02", amount: 50_000 }); // off-cycle
    const r = backtest([account("gas", h)], noFx);
    expect(r.cadenceMisses).toBeGreaterThan(0);
    // Excluded, not folded in — a classification error would otherwise show up
    // as a 100% magnitude error and swamp everything.
    expect(r.overall.get("full")!.summary().median).toBeLessThan(0.1);
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

describe("render", () => {
  it("produces a report naming every rung", () => {
    const out = render(
      backtest([account("a", series("2026-07", 24, 100_000, 1.02))], noFx),
    );
    for (const label of [
      "last amount",
      "median of last 3",
      "median × drift^gap",
      "full model",
      "BY TIER",
      "BY VENDOR",
    ]) {
      expect(out).toContain(label);
    }
  });

  it("omits the per-account section unless asked", () => {
    const r = backtest([account("a", series("2026-07", 24, 100_000, 1))], noFx);
    expect(render(r)).not.toContain("BY ACCOUNT");
    expect(render(r, { verbose: true })).toContain("BY ACCOUNT");
  });
});

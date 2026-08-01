import { describe, expect, it } from "vitest";
import { shiftMonth } from "./format";
import {
  anchorLevel,
  band,
  detectCadence,
  detectPairing,
  forecast,
  fxDrift,
  gapFactor,
  householdDrift,
  isDue,
  MAX_CADENCE,
  MAX_DRIFT,
  medianOf,
  MIN_BAND,
  type Observation,
  OUTLIER_RATIO,
  ownDrift,
  pairSeries,
  pointEstimate,
  recentLevel,
  seasonalLevel,
  selfBacktestError,
} from "./forecast";

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** `n` consecutive months ending at `end`, oldest → newest. */
function months(end: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftMonth(end, -(n - 1 - i)));
}

/** A monthly series: `base` compounding at `growth`/month, times a per-calendar-
 * month seasonal factor. The generator the seasonal tests measure against. */
function series(
  end: string,
  n: number,
  base: number,
  growth: number,
  seasonal: Record<number, number> = {},
): Observation[] {
  return months(end, n).map((month, i) => {
    const m = Number(month.slice(5, 7));
    return {
      month,
      amount: base * growth ** i * (seasonal[m] ?? 1),
    };
  });
}

const near = (actual: number | null, expected: number, tol = 0.02) => {
  expect(actual).not.toBeNull();
  expect(Math.abs(actual! - expected) / expected).toBeLessThan(tol);
};

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

describe("medianOf", () => {
  it("is null for an empty list", () => {
    expect(medianOf([])).toBeNull();
  });

  it("takes the middle of an odd list and the mean of the two middles", () => {
    expect(medianOf([3, 1, 2])).toBe(2);
    expect(medianOf([4, 1, 3, 2])).toBe(2.5);
  });

  it("ignores an outlier a mean would follow", () => {
    expect(medianOf([100, 102, 101, 9000])).toBe(101.5);
  });
});

describe("recentLevel", () => {
  it("is the median of the last three observations", () => {
    expect(recentLevel(series("2026-07", 6, 100, 1))).toBe(100);
  });

  it("shrugs off an estimated reading followed by a true-up", () => {
    // The classic gas pattern: a low estimate, then a catch-up bill. Neither
    // should move the level much — this is why every statistic is a median.
    const h: Observation[] = [
      { month: "2026-05", amount: 100_000 },
      { month: "2026-06", amount: 5_000 },
      { month: "2026-07", amount: 195_000 },
    ];
    expect(recentLevel(h)).toBe(100_000);
  });

  it("is null with no history", () => {
    expect(recentLevel([])).toBeNull();
  });
});

describe("ownDrift", () => {
  it("recovers a steady monthly growth", () => {
    near(ownDrift(series("2026-07", 12, 100, 1.05)), 1.05);
  });

  it("normalizes a bi-monthly account's jumps to per-month", () => {
    // Bills every 2 months, each 1.1025x the last => 1.05/month.
    const h: Observation[] = [
      { month: "2026-01", amount: 100 },
      { month: "2026-03", amount: 100 * 1.05 ** 2 },
      { month: "2026-05", amount: 100 * 1.05 ** 4 },
      { month: "2026-07", amount: 100 * 1.05 ** 6 },
    ];
    near(ownDrift(h), 1.05);
  });

  it("clamps an absurd jump", () => {
    const h = [
      { month: "2026-05", amount: 100 },
      { month: "2026-06", amount: 1_000 },
      { month: "2026-07", amount: 10_000 },
    ];
    expect(ownDrift(h)).toBe(MAX_DRIFT);
  });

  it("is null with a single observation", () => {
    expect(ownDrift([{ month: "2026-07", amount: 100 }])).toBeNull();
  });
});

describe("householdDrift", () => {
  it("pools the median drift across accounts", () => {
    const h = [
      series("2026-07", 6, 100, 1.04),
      series("2026-07", 6, 900, 1.06),
      series("2026-07", 6, 50, 1.05),
    ];
    near(householdDrift(h), 1.05);
  });

  it("is not swayed by one account going haywire", () => {
    const h = [
      series("2026-07", 6, 100, 1.05),
      series("2026-07", 6, 900, 1.05),
      series("2026-07", 6, 50, 1.4),
    ];
    near(householdDrift(h), 1.05);
  });

  it("includes non-monthly accounts, which is why it pools per-account", () => {
    // A month-keyed pooling would drop this bi-monthly account entirely.
    const bimonthly: Observation[] = [
      { month: "2026-01", amount: 100 },
      { month: "2026-03", amount: 100 * 1.05 ** 2 },
      { month: "2026-05", amount: 100 * 1.05 ** 4 },
    ];
    near(householdDrift([series("2026-07", 6, 100, 1.05), bimonthly]), 1.05);
  });

  it("is null below two readable accounts", () => {
    expect(householdDrift([])).toBeNull();
    expect(householdDrift([series("2026-07", 6, 100, 1.05)])).toBeNull();
    expect(householdDrift([[{ month: "2026-07", amount: 1 }], []])).toBeNull();
  });
});

describe("fxDrift", () => {
  const fx = (n: number, growthPerDay: number) =>
    Array.from({ length: n }, (_, i) => ({
      date: new Date(Date.UTC(2026, 4, 1 + i)).toISOString().slice(0, 10),
      rate: 1000 * growthPerDay ** i,
    }));

  it("reads a monthly rate from a daily series", () => {
    near(fxDrift(fx(90, 1.002), "2026-07"), 1.002 ** 30, 0.05);
  });

  it("is null on a window too short to read a trend from", () => {
    expect(fxDrift(fx(3, 1.002), "2026-05")).toBeNull();
    expect(fxDrift([], "2026-07")).toBeNull();
  });

  it("never looks past the target month", () => {
    // Everything in the series postdates the target, so there is nothing to read.
    expect(fxDrift(fx(90, 1.002), "2026-01")).toBeNull();
  });
});

describe("gapFactor", () => {
  it("is neutral when the newest bill already covers the target", () => {
    expect(gapFactor(0, 1.4, 1.4)).toBe(1);
    expect(gapFactor(-2, 1.4, 1.4)).toBe(1);
  });

  it("weights household drift over FX", () => {
    expect(gapFactor(1, 1.0, 1.1)).toBeCloseTo(0.6 * 1.0 + 0.4 * 1.1, 10);
  });

  it("falls back to whichever signal exists", () => {
    expect(gapFactor(1, 1.05, null)).toBeCloseTo(1.05, 10);
    expect(gapFactor(1, null, 1.05)).toBeCloseTo(1.05, 10);
    expect(gapFactor(1, null, null)).toBe(1);
  });

  it("compounds over the gap, so influence scales with staleness", () => {
    expect(gapFactor(4, 1.05, 1.05)).toBeCloseTo(1.05 ** 4, 10);
    expect(gapFactor(4, 1.05, 1.05)).toBeGreaterThan(gapFactor(1, 1.05, 1.05));
  });

  it("clamps a runaway drift", () => {
    expect(gapFactor(1, 5, 5)).toBe(MAX_DRIFT);
  });
});

describe("anchorLevel", () => {
  it("is the newest observation, not a median of recent ones", () => {
    // The whole finding: on a trending series the newest bill is the best
    // predictor, and a median of the last three lands about a month stale.
    const h = series("2026-07", 6, 100_000, 1.05);
    expect(anchorLevel(h)).toBe(h.at(-1)!.amount);
    expect(anchorLevel(h)).not.toBe(recentLevel(h));
  });

  it("rejects a newest bill that is wildly out of line", () => {
    const h: Observation[] = [
      { month: "2026-05", amount: 100_000 },
      { month: "2026-06", amount: 102_000 },
      { month: "2026-07", amount: 101_000 },
      { month: "2026-08", amount: 50_000_000 }, // a mis-parse
    ];
    expect(anchorLevel(h)).toBe(101_000);
  });

  it("rejects an implausibly small one too", () => {
    const h: Observation[] = [
      { month: "2026-05", amount: 100_000 },
      { month: "2026-06", amount: 102_000 },
      { month: "2026-07", amount: 101_000 },
      { month: "2026-08", amount: 12 },
    ];
    expect(anchorLevel(h)).toBe(101_000);
  });

  it("accepts a large but believable jump", () => {
    // A real tariff reset, just under the threshold. Trusting it is the point:
    // over-eager guarding would reintroduce the lag carry exists to avoid.
    const h: Observation[] = [
      { month: "2026-05", amount: 100_000 },
      { month: "2026-06", amount: 100_000 },
      { month: "2026-07", amount: 100_000 },
      { month: "2026-08", amount: 100_000 * (OUTLIER_RATIO - 0.5) },
    ];
    expect(anchorLevel(h)).toBe(100_000 * (OUTLIER_RATIO - 0.5));
  });

  it("trusts a lone observation, having nothing to compare it against", () => {
    expect(anchorLevel([{ month: "2026-07", amount: 999 }])).toBe(999);
    expect(anchorLevel([])).toBeNull();
  });
});

describe("pointEstimate", () => {
  it("has nothing to say with no history", () => {
    const r = pointEstimate([], "2026-08", null, null);
    expect(r).toMatchObject({ point: null, basis: "none" });
  });

  it("carries the last amount forward from a single bill", () => {
    const r = pointEstimate(
      [{ month: "2026-07", amount: 100_000 }],
      "2026-08",
      1.05,
      null,
    );
    expect(r.basis).toBe("carry");
    // No drift at a one-month horizon — see the note in pointEstimate.
    near(r.point, 100_000);
  });

  it("does not apply drift over the first month", () => {
    // Measured: at gap 1, drift made the forecast worse (5.7% -> 7.8% median
    // APE). The newest bill already embeds the current level; extrapolating
    // from it adds a biased estimate on top of a good one.
    const h = series("2026-07", 6, 100_000, 1);
    const withDrift = pointEstimate(h, "2026-08", 1.3, 1.3).point!;
    const without = pointEstimate(h, "2026-08", null, null).point!;
    expect(withDrift).toBe(without);
  });

  it("applies drift only to months with no bill at all", () => {
    // Stale history: three unobserved months between the last bill and the
    // target, so drift bridges three, not four.
    const h = series("2026-04", 6, 100_000, 1);
    const r = pointEstimate(h, "2026-08", 1.1, 1.1);
    near(r.point, 100_000 * 1.1 ** 3);
  });

  it("ignores seasonality on a monthly account, which measurement did not support", () => {
    // A planted 3x August on an account that bills every month. The model must
    // NOT reach for it: on real bills a seasonal estimator only paid once the
    // series was collapsed by billing pair, and reading a season off a monthly
    // account was measured worse than carry (6.8% vs 5.7% median APE).
    const h = series("2026-07", 30, 100_000, 1, { 8: 3 });
    const r = pointEstimate(h, "2026-08", null, null);
    expect(r.basis).toBe("baseline");
    near(r.point, 100_000);
  });

  it("is not derailed by an estimated reading and its true-up", () => {
    const clean = series("2026-07", 24, 100_000, 1.02);
    const dirty = clean.map((o) =>
      o.month === "2026-07" ? { ...o, amount: o.amount * 25 } : o,
    );
    const a = pointEstimate(clean, "2026-08", null, null).point!;
    const b = pointEstimate(dirty, "2026-08", null, null).point!;
    expect(Math.abs(b - a) / a).toBeLessThan(0.1);
  });

  it("forecasts from the last real bill when the newest one is zero", () => {
    // A credited or zero-balance month is a real row and a useless level.
    // Carrying it forward would put $0 on the dashboard as the expected bill.
    const h = [
      ...series("2026-06", 6, 100_000, 1),
      { month: "2026-07", amount: 0 },
    ];
    const r = pointEstimate(h, "2026-08", null, null);
    near(r.point, 100_000);
  });

  it("forecasts zero on an off-cycle month for a bi-monthly account", () => {
    const h: Observation[] = [
      { month: "2026-01", amount: 100 },
      { month: "2026-03", amount: 100 },
      { month: "2026-05", amount: 100 },
      { month: "2026-07", amount: 100 },
    ];
    expect(pointEstimate(h, "2026-08", null, null)).toMatchObject({
      point: 0,
      due: false,
      cadence: 2,
    });
    expect(pointEstimate(h, "2026-09", null, null).due).toBe(true);
  });

  it("leans on the gap factor when the history is stale", () => {
    const fresh = pointEstimate(
      series("2026-07", 6, 100_000, 1),
      "2026-08",
      1.1,
      null,
    );
    const stale = pointEstimate(
      series("2026-03", 6, 100_000, 1),
      "2026-07",
      1.1,
      null,
    );
    expect(stale.point!).toBeGreaterThan(fresh.point!);
  });

  it("does not turn an order-of-magnitude mis-parse into the headline figure", () => {
    // The guard sits at 20x because anything tighter was measured rejecting
    // real seasonal steps — a gas account's winter onset is an 18x jump. What
    // it still catches is the parse that read a meter number as a total.
    const h = [
      { month: "2026-05", amount: 100_000 },
      { month: "2026-06", amount: 1_000_000 },
      { month: "2026-07", amount: 50_000_000 },
    ];
    const r = pointEstimate(h, "2026-08", null, MAX_DRIFT);
    expect(r.point!).toBeLessThanOrEqual(1_000_000 * MAX_DRIFT);
  });
});

// ── Bi-monthly billing ───────────────────────────────────────────────────────

/** A bi-monthly meter: each two-month pair takes one value, with the second
 * month a shade off the first. `pairs` are read oldest → newest and the run
 * ends on the second month of the last pair. */
function bimonthly(end: string, pairs: number[], wobble = 1.01): Observation[] {
  const out: Observation[] = [];
  pairs.forEach((amount, i) => {
    const start = shiftMonth(end, -2 * (pairs.length - 1 - i) - 1);
    out.push({ month: start, amount });
    out.push({ month: shiftMonth(start, 1), amount: amount * wobble });
  });
  return out;
}

describe("detectPairing", () => {
  it("finds the pair phase in a bi-monthly series", () => {
    // Pairs start on 2025-01, 2025-03, … — odd calendar months, which are the
    // even absolute month indices, so phase 0.
    const h = bimonthly("2026-06", [10, 90, 20, 80, 30, 70, 40, 60]);
    expect(detectPairing(h)).toMatchObject({ phase: 0 });
  });

  it("finds the other phase when pairs start on even calendar months", () => {
    const h = bimonthly("2026-07", [10, 90, 20, 80, 30, 70, 40, 60]);
    expect(detectPairing(h)).toMatchObject({ phase: 1 });
  });

  it("reads no pairing into a smooth monthly series", () => {
    // The failure that would matter: inventing a sawtooth in an account that
    // does not have one hands the seasonal estimator a series it will misread.
    expect(detectPairing(series("2026-07", 30, 100_000, 1.03))).toBeNull();
  });

  it("reads no pairing into a flat series", () => {
    expect(detectPairing(series("2026-07", 30, 100_000, 1))).toBeNull();
  });

  it("holds off until there are transitions of both parities to compare", () => {
    expect(detectPairing(bimonthly("2026-06", [10, 90]))).toBeNull();
  });
});

describe("pairSeries", () => {
  it("collapses each pair to one point keyed by the pair's first month", () => {
    const h = bimonthly("2026-06", [10, 90, 20, 80], 1);
    expect(pairSeries(h, 0)).toEqual([
      { month: "2025-11", amount: 10 },
      { month: "2026-01", amount: 90 },
      { month: "2026-03", amount: 20 },
      { month: "2026-05", amount: 80 },
    ]);
  });

  it("drops non-positive amounts rather than averaging them in", () => {
    const h: Observation[] = [
      { month: "2026-05", amount: 100 },
      { month: "2026-06", amount: 0 },
    ];
    expect(pairSeries(h, 0)).toEqual([{ month: "2026-05", amount: 100 }]);
  });
});

describe("seasonalLevel", () => {
  // A gas-shaped year on the pair series: a winter peak, a flat trough, and a
  // shoulder either side. `bimonthly` lays pairs down ending on `end`, so with
  // 18 pairs ending 2026-06 the last pair starts 2026-05 and slot k of the
  // year carries shape[(k + 3) % 6].
  const SHAPE = [1, 1, 3, 4, 2, 1.2];
  const seasonal = (n = 18, growth = 1) =>
    pairSeries(
      bimonthly(
        "2026-06",
        Array.from(
          { length: n },
          (_, i) => 10_000 * SHAPE[i % 6] * growth ** i,
        ),
        1,
      ),
      0,
    );

  it("puts each slot of the year where the planted season put it", () => {
    const s = seasonal();
    near(seasonalLevel(s, "2026-11", 6, 2), 30_000, 0.1); // the 3x slot
    near(seasonalLevel(s, "2027-01", 6, 2), 40_000, 0.1); // the peak
    near(seasonalLevel(s, "2027-03", 6, 2), 20_000, 0.1); // the shoulder
    // ...and the trough is below all of them, which is the ordering that
    // decides whether a forecast reads as sensible.
    expect(seasonalLevel(s, "2026-07", 6, 2)!).toBeLessThan(20_000);
  });

  it("overstates the swing on a de-trended series, which is a known trade", () => {
    // The window doubles up the opposite season, so troughs come out lower
    // than they are: 6,000 against a planted 10,000. This is not a bug to fix
    // in isolation — see seasonalFactors, where the same bias is what offsets
    // the compression every median-based level suffers under a trend. Pinned
    // here so that removing it is a deliberate act with a backtest attached.
    const trough = seasonalLevel(seasonal(), "2026-07", 6, 2)!;
    expect(trough).toBeLessThan(10_000);
    expect(trough).toBeGreaterThan(4_000);
  });

  it("separates the season from a trend running through it", () => {
    // The season must not absorb the growth, nor the growth the season.
    const s = seasonal(18, 1.05);
    const peak = seasonalLevel(s, "2027-01", 6, 2)!;
    const trough = seasonalLevel(s, "2026-07", 6, 2)!;
    expect(peak / trough).toBeGreaterThan(2.5);
    // ...and the level must be the one the series has actually reached, not
    // the one it started at 18 pairs ago.
    expect(trough).toBeGreaterThan(10_000);
  });

  it("is null before there is a year of pairs to read a season from", () => {
    expect(seasonalLevel(seasonal(4), "2026-07", 6, 2)).toBeNull();
  });
});

describe("pointEstimate on a bi-monthly account", () => {
  it("carries the pair forward into its second month", () => {
    // The easy half: we already hold the reading this month belongs to.
    const h = bimonthly("2026-06", [10, 90, 20, 80, 30, 70, 40, 60]);
    // Drop the final month so the target IS the second half of the last pair.
    const r = pointEstimate(h.slice(0, -1), "2026-06", null, null);
    near(r.point, 60, 0.05);
  });

  it("reaches for the season on a new pair instead of carrying", () => {
    // The hard half, and the whole point of the pair split: on real bills
    // carrying here scored 29.8% median APE against the seasonal estimator's
    // 4.1%. The account is sitting on a 1.2x shoulder and heading into winter,
    // so carry and season disagree about which way the next bill moves.
    const shape = [1, 1, 3, 4, 2, 1.2];
    const pairs = Array.from({ length: 18 }, (_, i) => 10_000 * shape[i % 6]);
    const h = bimonthly("2026-06", pairs, 1);

    const summer = pointEstimate(h, "2026-07", null, null);
    expect(summer.basis).toBe("yoy");
    // Carry would have said 12,000 for a slot the season puts at 10,000.
    expect(summer.point!).toBeLessThan(12_000);

    // Two pairs on, the same history must forecast the winter peak instead —
    // the direction carry cannot produce at all, since it has one number.
    const winter = pointEstimate(h, "2026-11", null, null);
    near(winter.point, 30_000, 0.1);
  });

  it("falls back to the level when there is no season to read yet", () => {
    const h = bimonthly("2026-06", [10, 90, 20, 80, 30, 70]);
    const r = pointEstimate(h, "2026-07", null, null);
    expect(r.basis).toBe("baseline");
    expect(r.point).not.toBeNull();
  });
});

describe("selfBacktestError", () => {
  it("is near zero on a perfectly predictable series", () => {
    const e = selfBacktestError(series("2026-07", 24, 100_000, 1.02));
    expect(e).not.toBeNull();
    expect(e!).toBeLessThan(0.05);
  });

  it("is wide on a noisy series", () => {
    // Scattered between 0.5x and 2x, deterministically. Deliberately NOT an
    // alternating series: `anchorLevel`'s outlier guard rejects every other
    // observation of a regular flip-flop and lands on the right value each
    // time, which makes a metronome look like a well-behaved account.
    const noisy = months("2026-07", 24).map((month, i) => ({
      month,
      amount: 100_000 * (0.5 + (((i * 62) % 97) / 97) * 1.5),
    }));
    expect(selfBacktestError(noisy)!).toBeGreaterThan(0.3);
  });

  it("is null below four observations", () => {
    expect(selfBacktestError([])).toBeNull();
    expect(selfBacktestError(series("2026-07", 3, 100, 1))).toBeNull();
  });

  it("terminates — the pointEstimate split is what prevents mutual recursion", () => {
    // Reaching the assertion at all is the assertion.
    expect(
      selfBacktestError(series("2026-07", 36, 100_000, 1.03)),
    ).not.toBeNull();
  });
});

describe("band", () => {
  it("widens as the basis weakens when there is nothing measured", () => {
    const carry = band(100, "carry", null);
    const baseline = band(100, "baseline", null);
    expect(baseline.high - baseline.low).toBeLessThan(carry.high - carry.low);
  });

  it("prefers a measured error over the default", () => {
    const b = band(100, "carry", 0.1);
    expect(b.low).toBeCloseTo(90, 10);
    expect(b.high).toBeCloseTo(110, 10);
  });

  it("never claims a band tighter than the floor", () => {
    expect(band(100, "baseline", 0).low).toBe(100 * (1 - MIN_BAND));
  });

  it("reports confidence from the band width", () => {
    expect(band(100, "baseline", 0.12).confidence).toBe("high");
    expect(band(100, "baseline", 0.25).confidence).toBe("medium");
    expect(band(100, "baseline", 0.5).confidence).toBe("low");
  });
});

describe("forecast", () => {
  it("returns a bracketed estimate on healthy history", () => {
    const r = forecast({
      history: series("2026-07", 24, 100_000, 1.02),
      target: "2026-08",
    });
    expect(r.basis).toBe("baseline");
    expect(r.low!).toBeLessThan(r.point!);
    expect(r.high!).toBeGreaterThan(r.point!);
    expect(r.due).toBe(true);
    expect(r.cadence).toBe(1);
  });

  it("degrades to a null point with no history at all", () => {
    expect(forecast({ history: [], target: "2026-08" })).toMatchObject({
      point: null,
      basis: "none",
      due: true,
    });
  });

  it("prefers the household drift over the account's own, once drift applies", () => {
    // Drift only bridges months with no bill, so this needs a stale account to
    // be observable at all. Fresh history is deliberately drift-free.
    const history = series("2026-04", 6, 100_000, 1);
    const household = [
      history,
      series("2026-04", 6, 5_000, 1.2),
      series("2026-04", 6, 900, 1.2),
    ];
    const alone = forecast({ history, target: "2026-08" }).point!;
    const pooled = forecast({ history, household, target: "2026-08" }).point!;
    expect(pooled).toBeGreaterThan(alone);

    const fresh = series("2026-07", 6, 100_000, 1);
    expect(
      forecast({ history: fresh, household, target: "2026-08" }).point,
    ).toBe(forecast({ history: fresh, target: "2026-08" }).point);
  });

  it("reports an off-cycle month as not due, with no band", () => {
    const h: Observation[] = [
      { month: "2026-01", amount: 100 },
      { month: "2026-03", amount: 100 },
      { month: "2026-05", amount: 100 },
    ];
    expect(forecast({ history: h, target: "2026-06" })).toMatchObject({
      point: 0,
      due: false,
      cadence: 2,
    });
  });
});

describe("anchorLevel threshold", () => {
  it("is adjustable, so the harness can score alternative thresholds", () => {
    const h: Observation[] = [
      { month: "2026-05", amount: 100_000 },
      { month: "2026-06", amount: 100_000 },
      { month: "2026-07", amount: 100_000 },
      { month: "2026-08", amount: 600_000 }, // 6x — a big but possible reset
    ];
    expect(anchorLevel(h, 4)).toBe(100_000); // rejected at 4x
    expect(anchorLevel(h, 8)).toBe(600_000); // trusted at 8x
  });
});

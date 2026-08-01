import { describe, expect, it } from "vitest";
import { shiftMonth } from "./format";
import {
  band,
  blendWeight,
  detectCadence,
  forecast,
  fxDrift,
  gapFactor,
  householdDrift,
  isDue,
  levelGrowth,
  MAX_CADENCE,
  MAX_DRIFT,
  medianOf,
  MIN_BAND,
  type Observation,
  ownDrift,
  pointEstimate,
  recentLevel,
  selfBacktestError,
  yoyAnchor,
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

describe("levelGrowth", () => {
  it("recovers a known twelve-month growth", () => {
    // 3%/month compounding => 1.03^12 ≈ 1.4258 over a year.
    near(levelGrowth(series("2026-07", 24, 100, 1.03)), 1.03 ** 12);
  });

  it("is null without a window a year back", () => {
    expect(levelGrowth(series("2026-07", 6, 100, 1.03))).toBeNull();
  });

  it("is anchored to the newest bill, not to today", () => {
    // Same history read at two different times must give the same growth —
    // extrapolating to the target month is gapFactor's job, not this one's.
    const h = series("2026-03", 24, 100, 1.03);
    near(levelGrowth(h), 1.03 ** 12);
  });
});

describe("yoyAnchor", () => {
  const h = series("2026-07", 24, 100, 1);

  it("finds the same month a year earlier", () => {
    expect(yoyAnchor(h, "2026-08")).toBe(
      h.find((o) => o.month === "2025-08")!.amount,
    );
  });

  it("tolerates being a month out when that upload is missing", () => {
    const gappy = h.filter((o) => o.month !== "2025-08");
    expect(yoyAnchor(gappy, "2026-08")).toBe(
      gappy.find((o) => o.month === "2025-07")!.amount,
    );
  });

  it("is null when nothing is near a year back", () => {
    expect(yoyAnchor(series("2026-07", 6, 100, 1), "2026-08")).toBeNull();
  });
});

describe("blendWeight", () => {
  it("is inert at twelve months and full at twenty-four", () => {
    expect(blendWeight(12)).toBe(0);
    expect(blendWeight(24)).toBe(1);
    expect(blendWeight(18)).toBe(0.5);
  });

  it("clamps outside that ramp", () => {
    expect(blendWeight(3)).toBe(0);
    expect(blendWeight(60)).toBe(1);
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
    near(r.point, 105_000);
  });

  it("uses the recent baseline before a year of history exists", () => {
    const r = pointEstimate(
      series("2026-07", 6, 100_000, 1),
      "2026-08",
      null,
      null,
    );
    expect(r.basis).toBe("baseline");
    near(r.point, 100_000);
  });

  it("leaves the seasonal term inert at exactly twelve months", () => {
    // A planted August spike must NOT show up yet — one cycle is fitted noise.
    const h = series("2026-07", 12, 100_000, 1, { 8: 3 });
    const r = pointEstimate(h, "2026-08", null, null);
    expect(r.basis).toBe("baseline");
    near(r.point, 100_000);
  });

  it("recovers a planted seasonal spike once two cycles exist", () => {
    const h = series("2026-07", 24, 100_000, 1, { 8: 3 });
    const r = pointEstimate(h, "2026-08", null, null);
    expect(r.basis).toBe("yoy");
    near(r.point, 300_000);
  });

  it("recovers a seasonal spike riding on top of a trend", () => {
    // 3%/month inflation AND a 3x August. Both must come out.
    const h = series("2026-07", 30, 100_000, 1.03, { 8: 3 });
    const r = pointEstimate(h, "2026-08", null, null);
    const lastJuly = h.find((o) => o.month === "2026-07")!.amount;
    near(r.point, lastJuly * 3, 0.12);
  });

  it("is not derailed by an estimated reading and its true-up", () => {
    const clean = series("2026-07", 24, 100_000, 1.02);
    const dirty = clean.map((o) =>
      o.month === "2026-06"
        ? { ...o, amount: o.amount * 0.05 }
        : o.month === "2026-07"
          ? { ...o, amount: o.amount * 1.95 }
          : o,
    );
    const a = pointEstimate(clean, "2026-08", null, null).point!;
    const b = pointEstimate(dirty, "2026-08", null, null).point!;
    expect(Math.abs(b - a) / a).toBeLessThan(0.1);
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
    // Last bill four months before the target: drift does most of the work.
    const h = series("2026-03", 6, 100_000, 1);
    const fresh = pointEstimate(
      series("2026-07", 6, 100_000, 1),
      "2026-08",
      1.1,
      null,
    );
    const stale = pointEstimate(h, "2026-07", 1.1, null);
    near(fresh.point, 110_000);
    near(stale.point, 100_000 * 1.1 ** 4);
    expect(stale.point!).toBeGreaterThan(fresh.point!);
  });

  it("does not turn a 10x month into a 10x forecast", () => {
    const h = [
      { month: "2026-05", amount: 100_000 },
      { month: "2026-06", amount: 1_000_000 },
      { month: "2026-07", amount: 10_000_000 },
    ];
    const r = pointEstimate(h, "2026-08", null, MAX_DRIFT);
    expect(r.point!).toBeLessThanOrEqual(1_000_000 * MAX_DRIFT);
  });
});

describe("selfBacktestError", () => {
  it("is near zero on a perfectly predictable series", () => {
    const e = selfBacktestError(series("2026-07", 24, 100_000, 1.02));
    expect(e).not.toBeNull();
    expect(e!).toBeLessThan(0.05);
  });

  it("is wide on a noisy series", () => {
    const noisy = months("2026-07", 24).map((month, i) => ({
      month,
      amount: 100_000 * (i % 2 === 0 ? 0.3 : 2.4),
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
    const yoy = band(100, "yoy", null);
    expect(yoy.high - yoy.low).toBeLessThan(carry.high - carry.low);
  });

  it("prefers a measured error over the default", () => {
    const b = band(100, "carry", 0.1);
    expect(b.low).toBeCloseTo(90, 10);
    expect(b.high).toBeCloseTo(110, 10);
  });

  it("never claims a band tighter than the floor", () => {
    expect(band(100, "yoy", 0).low).toBe(100 * (1 - MIN_BAND));
  });

  it("reports confidence from the band width", () => {
    expect(band(100, "yoy", 0.12).confidence).toBe("high");
    expect(band(100, "yoy", 0.25).confidence).toBe("medium");
    expect(band(100, "yoy", 0.5).confidence).toBe("low");
  });
});

describe("forecast", () => {
  it("returns a bracketed estimate on healthy history", () => {
    const r = forecast({
      history: series("2026-07", 24, 100_000, 1.02),
      target: "2026-08",
    });
    expect(r.basis).toBe("yoy");
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

  it("prefers the household drift over the account's own", () => {
    // This account looks flat; its housemates are all climbing 20%/month.
    const history = series("2026-07", 6, 100_000, 1);
    const household = [
      history,
      series("2026-07", 6, 5_000, 1.2),
      series("2026-07", 6, 900, 1.2),
    ];
    const alone = forecast({ history, target: "2026-08" }).point!;
    const pooled = forecast({ history, household, target: "2026-08" }).point!;
    expect(pooled).toBeGreaterThan(alone);
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

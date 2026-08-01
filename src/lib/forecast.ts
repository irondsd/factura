// Per-account bill forecasting. Pure and client-safe (no DB, no tRPC, no
// clock — callers pass the months they care about), so every rule here is
// unit-testable and replayable over historical data.
//
// See docs/superpowers/specs/2026-07-31-bill-forecasting-design.md.

import { shiftMonth } from "@/lib/format";
import { monthsBetween } from "@/lib/insights";

/** One observed bill, reduced to what the model reads: the month it covers and
 * its ARS total. Deliberately not the bill row — nothing here may depend on
 * parser-extracted custom fields, which are optional and vendor-specific. */
export type Observation = { month: string; amount: number };

/** A daily blue-rate point, oldest → newest. */
export type FxPoint = { date: string; rate: number };

/** Which estimator produced a point, weakest → strongest. Also the fallback
 * ladder for the confidence band when there's too little history to measure. */
export type Basis = "none" | "carry" | "baseline" | "yoy";

export type Confidence = "low" | "medium" | "high";

export type Forecast = {
  /** Expected ARS total, or null when there's nothing to forecast from. */
  point: number | null;
  low: number | null;
  high: number | null;
  basis: Basis;
  confidence: Confidence;
  /** Inferred months between bills (1 = monthly). */
  cadence: number;
  /** Whether the target month is on this account's billing cycle at all. */
  due: boolean;
};

// ── Billing cadence ──────────────────────────────────────────────────────────
// Not every account bills monthly: gas is commonly bi-monthly, some fees are
// quarterly or annual. Without this, an account that simply isn't due reads as
// "awaiting" every single month, which both nags about a bill that doesn't
// exist and (once forecasting lands) inflates the expected total.

/** Longest cadence we'll infer. An annual bill is the real ceiling; anything
 * longer is far likelier to be a gap in the data than a real billing cycle. */
export const MAX_CADENCE = 12;

/** How many observed periods it takes before the gaps between them are worth
 * believing. Two periods give a single gap, and a single gap is indistinguishable
 * from one missed upload. */
const MIN_PERIODS_FOR_CADENCE = 3;

/** How many months apart an account's bills arrive, inferred from its own
 * history: the most common gap between consecutive observed periods.
 *
 * Ties break toward the *shorter* cadence, and thin history falls back to 1.
 * Both defaults are deliberately conservative — guessing monthly keeps an
 * account visible as awaiting, which at worst nags. Guessing bi-monthly hides a
 * bill the user genuinely needs to upload, which is the failure that matters.
 *
 * Takes "YYYY-MM" tags in any order; duplicates and unsorted input are fine. */
export function detectCadence(months: string[]): number {
  const distinct = [...new Set(months)].sort();
  if (distinct.length < MIN_PERIODS_FOR_CADENCE) return 1;

  const counts = new Map<number, number>();
  for (let i = 1; i < distinct.length; i++) {
    const gap = monthsBetween(distinct[i - 1], distinct[i]);
    if (gap < 1 || gap > MAX_CADENCE) continue; // a long silence isn't a cycle
    counts.set(gap, (counts.get(gap) ?? 0) + 1);
  }

  let best = 1;
  let bestCount = 0;
  for (const [gap, count] of [...counts].sort((a, b) => a[0] - b[0])) {
    if (count > bestCount) {
      best = gap;
      bestCount = count;
    }
  }
  return best;
}

/** Whether `target` falls on this account's billing cycle — i.e. whether a bill
 * is genuinely expected that month.
 *
 * On-cycle months are `lastObserved + k·cadence` for whole k ≥ 0. A month before
 * the last observed period is never "due": we have no claim to make about a
 * period we already have data for the far side of.
 *
 * `lastObserved` is null for an account that has never billed, which is due by
 * definition — that's the state where prompting for a first upload is the whole
 * point. */
export function isDue(
  lastObserved: string | null,
  target: string,
  cadence: number,
): boolean {
  if (!lastObserved) return true;
  const delta = monthsBetween(lastObserved, target);
  if (delta < 0) return false;
  return delta % Math.max(1, cadence) === 0;
}

// ── Robust statistics ────────────────────────────────────────────────────────
// Medians throughout, never means. With 24–36 observations per account a single
// bad point is 3–4% of the evidence, and bad points are routine: estimated
// meter readings followed by a true-up (a low month, then a catch-up spike),
// re-parses, duplicate uploads.

/** Median, or null for an empty list. */
export function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Clamp a growth *factor* (1.05 = +5%) into the plausible monthly range, so
 * one absurd pair of bills can't produce an absurd projection. */
export const MIN_DRIFT = 0.9;
export const MAX_DRIFT = 1.5;
const clampDrift = (f: number) => Math.min(MAX_DRIFT, Math.max(MIN_DRIFT, f));

/** How many recent observations the baseline and level statistics read. */
const RECENT = 3;

function byMonth(history: Observation[]): Map<string, number> {
  return new Map(history.map((o) => [o.month, o.amount]));
}

/** Observations falling inside an inclusive "YYYY-MM" window. */
function amountsIn(
  index: Map<string, number>,
  lo: string,
  hi: string,
): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m = shiftMonth(m, 1)) {
    const v = index.get(m);
    if (v != null) out.push(v);
  }
  return out;
}

/** History sorted oldest → newest, de-duplicated by month (last wins). */
export function normalizeHistory(history: Observation[]): Observation[] {
  const index = new Map<string, number>();
  for (const o of history) {
    if (Number.isFinite(o.amount)) index.set(o.month, o.amount);
  }
  return [...index]
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));
}

// ── Estimator B: recent baseline ─────────────────────────────────────────────

/** Median of the last few observed amounts. Always available with any history,
 * and the fallback every other estimator degrades into. */
export function recentLevel(history: Observation[]): number | null {
  const sorted = normalizeHistory(history);
  return medianOf(sorted.slice(-RECENT).map((o) => o.amount));
}

// ── Estimator A: year-over-year anchor ───────────────────────────────────────

/** How much this account's level has risen over the last twelve months: two
 * 3-month windows exactly a year apart, both anchored to the newest observation
 * rather than to the target month.
 *
 * Anchoring to history (not the target) keeps this a clean 12-month growth
 * regardless of how stale the data is — extrapolating from the last bill to the
 * target month is `gapFactor`'s job, and doing it in both places would
 * double-count. Null when either window is empty. */
export function levelGrowth(history: Observation[]): number | null {
  const sorted = normalizeHistory(history);
  const anchor = sorted.at(-1)?.month;
  if (!anchor) return null;
  const index = byMonth(sorted);

  const recent = medianOf(amountsIn(index, shiftMonth(anchor, -2), anchor));
  const yearAgo = medianOf(
    amountsIn(index, shiftMonth(anchor, -14), shiftMonth(anchor, -12)),
  );
  if (recent == null || yearAgo == null || yearAgo <= 0) return null;
  return recent / yearAgo;
}

/** The same month one year before the target, which already carries that
 * month's seasonality. Tolerates being one month out so a single missed upload
 * doesn't drop the whole estimator; prefers the exact month. */
export function yoyAnchor(
  history: Observation[],
  target: string,
): number | null {
  const index = byMonth(normalizeHistory(history));
  for (const offset of [-12, -13, -11]) {
    const v = index.get(shiftMonth(target, offset));
    if (v != null) return v;
  }
  return null;
}

/** How much to trust the YoY anchor over the recent baseline: nothing at twelve
 * months of history, fully by twenty-four.
 *
 * This is what lets the seasonal term ship inert on day one — with one cycle of
 * data a month-of-year reading is fitted noise, so it contributes nothing until
 * it has earned the right to. No history-length branch anywhere else. */
export function blendWeight(monthsOfHistory: number): number {
  return Math.min(1, Math.max(0, (monthsOfHistory - 12) / 12));
}

// ── Drift: extrapolating past the newest bill ────────────────────────────────

/** This account's own month-over-month growth factor, normalized per month so a
 * bi-monthly account's 2-month jumps aren't read as monthly ones. Median of the
 * last few consecutive-pair ratios. */
export function ownDrift(history: Observation[]): number | null {
  const sorted = normalizeHistory(history);
  const ratios: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = monthsBetween(sorted[i - 1].month, sorted[i].month);
    const prev = sorted[i - 1].amount;
    if (gap < 1 || prev <= 0) continue;
    ratios.push((sorted[i].amount / prev) ** (1 / gap));
  }
  const recent = medianOf(ratios.slice(-RECENT));
  return recent == null ? null : clampDrift(recent);
}

/** The household's shared inflation signal: the median of every account's own
 * drift. Pooling across the user's accounts beats any single account's noisy
 * series, and — because Argentine tariff resets are step functions that hit
 * everything at once — it registers a step roughly a month before one account
 * alone could.
 *
 * Needs at least two accounts with a readable drift; null otherwise, and the
 * caller falls back to `ownDrift`. */
export function householdDrift(histories: Observation[][]): number | null {
  const drifts = histories.map(ownDrift).filter((d): d is number => d !== null);
  if (drifts.length < 2) return null;
  return clampDrift(medianOf(drifts)!);
}

/** Monthly blue-rate drift from the trailing 90 days. */
export function fxDrift(fx: FxPoint[], asOf: string): number | null {
  const cutoff = `${shiftMonth(asOf, -3)}-01`;
  const window = fx
    .filter((p) => p.date <= `${asOf}-31` && p.date >= cutoff && p.rate > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (window.length < 2) return null;

  const first = window[0];
  const last = window.at(-1)!;
  const days =
    (Date.parse(`${last.date}T00:00:00Z`) -
      Date.parse(`${first.date}T00:00:00Z`)) /
    86_400_000;
  if (days < 14) return null; // too short a window to read a trend from
  return clampDrift((last.rate / first.rate) ** (30 / days));
}

/** How much to grow the estimate over the unobserved months between the newest
 * bill on file and the month being forecast.
 *
 * This is the *only* place FX enters the model. Observed ARS amounts already
 * contain inflation and devaluation — that is what made them rise — so applying
 * an FX term to the span the bills already cover would charge for it twice. FX
 * extrapolates the gap and nothing else, which means its influence scales with
 * how stale the data is and shrinks to almost nothing as bills arrive. */
export function gapFactor(
  gap: number,
  household: number | null,
  fx: number | null,
): number {
  if (gap <= 0) return 1;
  let f: number;
  if (household != null && fx != null) f = 0.6 * household + 0.4 * fx;
  else f = household ?? fx ?? 1;
  return clampDrift(f) ** gap;
}

// ── Point estimate ───────────────────────────────────────────────────────────

/** The forecast without its band. Split out from `forecast` because
 * `selfBacktestError` has to call *this* — going through `forecast` would make
 * the two recurse into each other forever. */
export function pointEstimate(
  history: Observation[],
  target: string,
  household: number | null,
  fx: number | null,
): { point: number | null; basis: Basis; cadence: number; due: boolean } {
  const sorted = normalizeHistory(history);
  const cadence = detectCadence(sorted.map((o) => o.month));
  const lastObserved = sorted.at(-1)?.month ?? null;
  const due = isDue(lastObserved, target, cadence);

  if (sorted.length === 0)
    return { point: null, basis: "none", cadence, due: true };
  if (!due) return { point: 0, basis: "carry", cadence, due: false };

  const baseline = recentLevel(sorted)!;
  const growth = levelGrowth(sorted);
  const anchor = yoyAnchor(sorted, target);

  // The two estimators are anchored to different months, so only one of them
  // takes the gap factor.
  //
  // B is a level as of the newest bill, so it has to be carried forward to the
  // target. A is already *at* the target: `levelGrowth` is a twelve-month rate,
  // so `amount[target−12] × levelGrowth` estimates the level twelve months
  // after target−12 — which is the target. Applying gapFactor to A as well
  // would charge for drift twice, the exact mistake the FX split exists to
  // avoid, and it shows up as a systematic overshoot of one month's inflation.
  const gap = monthsBetween(lastObserved!, target);
  const baselinePoint = baseline * gapFactor(gap, household, fx);
  const yoyPoint = anchor != null && growth != null ? anchor * growth : null;

  const span = monthsBetween(sorted[0].month, lastObserved!) + 1;
  const w = yoyPoint == null ? 0 : blendWeight(span);
  const point =
    yoyPoint == null ? baselinePoint : w * yoyPoint + (1 - w) * baselinePoint;

  const basis: Basis =
    w > 0 ? "yoy" : sorted.length >= RECENT ? "baseline" : "carry";
  return { point, basis, cadence, due };
}

// ── Confidence band ──────────────────────────────────────────────────────────

/** Widest and narrowest band we'll claim, whatever the measurement says. */
export const MIN_BAND = 0.1;
export const MAX_BAND = 0.6;

/** Band width before there's enough history to measure one. */
const DEFAULT_BAND: Record<Basis, number> = {
  none: MAX_BAND,
  carry: 0.35,
  baseline: 0.25,
  yoy: 0.18,
};

/** Fewest scored predictions worth deriving a band from. */
const MIN_BACKTEST_POINTS = 3;

/** How many recent months the self-backtest scores. Bounded so an account with
 * years of history is judged on how the model performs *now*, not on the poor
 * predictions it necessarily made when it had two bills to go on. */
const BACKTEST_WINDOW = 12;

/** This account's own error rate: walk its history forward, forecast each month
 * from only what predates it, and take the median absolute percentage error.
 *
 * Deliberately not read from stored forecasts. `pointEstimate` is pure and takes
 * its target as an argument, so the *current* formula's error is recomputable
 * from bills at any time — it covers history from before this feature existed,
 * always reflects the formula actually running, and works on day one instead of
 * needing a year of accumulated rows.
 *
 * Runs on the account alone (no household or FX input): using today's household
 * drift to score a prediction about last March would be leakage. */
export function selfBacktestError(history: Observation[]): number | null {
  const sorted = normalizeHistory(history);
  const errors: number[] = [];

  for (
    let i = Math.max(2, sorted.length - BACKTEST_WINDOW);
    i < sorted.length;
    i++
  ) {
    const known = sorted.slice(0, i);
    const actual = sorted[i];
    if (actual.amount <= 0) continue;
    const { point } = pointEstimate(known, actual.month, ownDrift(known), null);
    if (point == null || point <= 0) continue;
    errors.push(Math.abs(point - actual.amount) / actual.amount);
  }

  if (errors.length < MIN_BACKTEST_POINTS) return null;
  return medianOf(errors);
}

export function band(
  point: number,
  basis: Basis,
  selfError: number | null,
): { low: number; high: number; confidence: Confidence } {
  const raw = selfError ?? DEFAULT_BAND[basis];
  const e = Math.min(MAX_BAND, Math.max(MIN_BAND, raw));
  return {
    low: point * (1 - e),
    high: point * (1 + e),
    confidence: e <= 0.15 ? "high" : e <= 0.3 ? "medium" : "low",
  };
}

// ── Composition ──────────────────────────────────────────────────────────────

/** Forecast one account's bill for `target` ("YYYY-MM").
 *
 * `household` is every account in the same property (this one included) — it
 * supplies the shared drift signal. `fx` is the trailing blue-rate series. Both
 * are optional; without them the model falls back to the account's own drift. */
export function forecast({
  history,
  target,
  household = [],
  fx = [],
}: {
  history: Observation[];
  target: string;
  household?: Observation[][];
  fx?: FxPoint[];
}): Forecast {
  const drift = householdDrift(household) ?? ownDrift(history);
  const { point, basis, cadence, due } = pointEstimate(
    history,
    target,
    drift,
    fxDrift(fx, target),
  );

  if (point == null || point <= 0) {
    return {
      point,
      low: point,
      high: point,
      basis,
      confidence: "low",
      cadence,
      due,
    };
  }

  const { low, high, confidence } = band(
    point,
    basis,
    selfBacktestError(history),
  );
  return { point, low, high, basis, confidence, cadence, due };
}

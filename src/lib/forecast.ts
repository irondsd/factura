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

// ── The level estimator ──────────────────────────────────────────────────────
// The most recent bill, guarded against a single bad one.
//
// This is deliberately the simplest thing that could work, and it is here
// because measurement put it here. A backtest over real bills (2024-02 →
// 2026-07, 11 accounts, 147 predictions) scored it against every more elaborate
// candidate, and it won in every history tier and in five of seven vendors:
//
//     last amount                       5.7% median APE
//     last amount × drift^(gap-1)       5.7%   <- what ships, plus the guard
//     outlier-guarded last (8x)         5.8%
//     outlier-guarded last (4x)         6.4%
//     last amount × drift^gap           7.8%
//     median of last 3 × drift^gap     13.5%
//     de-trended median × drift^gap    14.9%
//     YoY blend (±1 or exact anchor)   18.0%
//     median of last 3                 19.9%
//
// Two results in there are worth keeping in view, because they are the reason
// this file is short:
//
//  1. Seasonality did not pay. The year-over-year anchor was WORSE than carrying
//     the last amount forward in every slice, most sharply on the gas account it
//     was written for (5.7% vs 22.2%). Tiered tariffs and fixed charges smooth
//     the *amount* far more than the consumption behind it, so month-to-month
//     persistence beats a seasonal shape. The consumption chart is dramatic; the
//     peso series is not.
//
//  2. Drift did not pay either, at a one-month horizon. Argentine monthly
//     inflation fell steeply across the window, and a drift measured from
//     trailing ratios lags a decelerating trend, so it over-predicts. See
//     `gapFactor`'s caller for what survived.
//
// Re-run `npm run forecast:backtest` before adding anything back. The harness
// still carries the discarded candidates so any of this can be re-measured.

/** Median of the last few observed amounts. No longer the production
 * estimator — it lags a trending series by about a month, which measured at
 * 19.9% against carry's 5.7% — but the backtest harness still scores it, so it
 * stays exported. */
export function recentLevel(history: Observation[]): number | null {
  const sorted = normalizeHistory(history);
  return medianOf(sorted.slice(-RECENT).map((o) => o.amount));
}

/** How far the newest bill may diverge from the median of the three before it
 * before we stop believing it.
 *
 * Measured, not chosen. At 4x the guard cost 0.7pp of overall accuracy and
 * 2.3pp on Edesur — it was rejecting real tariff resets, which Argentina serves
 * up as discrete step changes. At 8x it costs 0.1pp overall and nothing at all
 * on Edesur, while still catching the kind of garbage that actually appears in
 * the data (two bills in the backtest set have non-positive totals).
 *
 * The one account it still costs anything is gas, at +0.4pp: a genuine winter
 * peak can be more than 8x the surrounding months, so the guard occasionally
 * rejects a real bill there. Judged worth it — the downside it protects against
 * is a mis-parsed total becoming the headline figure on the dashboard. */
export const OUTLIER_RATIO = 8;

/** The level to forecast from: the newest bill, unless it is wildly out of line
 * with the ones before it, in which case their median.
 *
 * Carrying the last amount forward is what the measurement endorses, but it
 * takes the newest observation entirely on trust — one mis-parsed total would
 * become the headline figure on the dashboard. This keeps carry's accuracy in
 * the normal case and its blast radius small in the abnormal one. */
export function anchorLevel(
  history: Observation[],
  maxRatio = OUTLIER_RATIO,
): number | null {
  const sorted = normalizeHistory(history);
  const last = sorted.at(-1);
  if (!last) return null;

  const prior = medianOf(sorted.slice(-4, -1).map((o) => o.amount));
  if (prior == null || prior <= 0 || last.amount <= 0) return last.amount;

  const ratio = last.amount / prior;
  return ratio > maxRatio || ratio < 1 / maxRatio ? prior : last.amount;
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

  const base = anchorLevel(sorted)!;

  // Drift bridges only the months we have NO bill for — hence `gap - 1`.
  //
  // Measured, at a one-month horizon drift makes the forecast worse: 5.7% →
  // 7.8% median APE. The newest bill already embeds the current price level, so
  // extrapolating from it adds a noisy, biased estimate on top of a good one.
  // The bias has a cause: Argentine monthly inflation fell steeply across the
  // backtest window, and a drift read off trailing ratios lags a decelerating
  // trend, so it over-predicts.
  //
  // Past one month we have no measurement — a walk-forward backtest almost
  // always has gap = 1 — but a four-month-old amount with no adjustment is
  // clearly wrong in an inflationary economy. So drift still applies to the
  // genuinely unobserved months, and this is the one part of the model that is
  // reasoned rather than measured.
  const gap = monthsBetween(lastObserved!, target);
  const point = base * gapFactor(gap - 1, household, fx);

  const basis: Basis = sorted.length >= RECENT ? "baseline" : "carry";
  return { point, basis, cadence, due };
}

// ── Confidence band ──────────────────────────────────────────────────────────

/** Widest and narrowest band we'll claim, whatever the measurement says.
 *
 * The floor came down from 0.10 because the measured errors went below it: the
 * backtest put a mature account's typical miss at 4.5%, and a band that cannot
 * be tighter than ±10% would have been claiming more uncertainty than the model
 * actually has. */
export const MIN_BAND = 0.04;
export const MAX_BAND = 0.6;

/** Band width before there's enough history to measure one, taken from the
 * backtest's per-tier medians for the model that actually ships (13.7% at 1–2
 * bills, 5.5% at 3–12 months, 4.5% past a year). `baseline` covers the last two
 * and takes the more cautious of them.
 *
 * `yoy` is unreachable — the year-over-year estimator lost the bake-off and was
 * removed — but stays in the table because the `forecast_basis` Postgres enum
 * still carries the value, and dropping a value from a live enum is far more
 * trouble than an unused entry here. */
const DEFAULT_BAND: Record<Basis, number> = {
  none: MAX_BAND,
  carry: 0.14,
  baseline: 0.06,
  yoy: 0.06,
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

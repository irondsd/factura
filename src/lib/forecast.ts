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
// Drift did not pay at a one-month horizon. Argentine monthly inflation fell
// steeply across the window, and a drift measured from trailing ratios lags a
// decelerating trend, so it over-predicts. See `gapFactor`'s caller for what
// survived. A damped drift (last × drift^α for α of 0.25 to 0.75) was measured
// too: it moved the median by tenths of a point, and which α won flipped from
// one time slice to the next, which is what noise looks like.
//
// Carrying the last amount forward is still the level this model is built on.
// What has since been layered over it is NOT a better level estimator but a
// correction to a specific, mechanical way it was wrong — see "Bi-monthly
// billing" below. That correction took the same 147 predictions from 5.7%
// median / 69.1% p90 to 4.6% / 54.5%, and it did so by fixing the half of the
// months that carry got badly wrong rather than by nudging the half it already
// got right.
//
// One earlier conclusion has been overturned and is worth flagging, because the
// reasoning that produced it was sound and still misled. Seasonality was
// originally measured as WORSE than carry in every slice (22.2% against 5.7% on
// the gas account it was written for), and read as evidence that tiered tariffs
// smooth the peso series even where consumption swings. That was the wrong
// lesson. The year-over-year estimator was being scored on the raw monthly
// series, which for a bi-monthly account is a sawtooth — so it was fitting the
// billing artefact, not the season. Collapsing each two-month pair to one point
// first and the season is not just readable, it is the single largest win in
// this file. A negative result about an estimator can be a result about the
// series it was handed.
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
 * Measured, not chosen, and loosened twice as the model learned to explain
 * jumps it used to have to suppress. At 4x the guard cost 0.7pp of overall
 * accuracy — it was rejecting real tariff resets, which Argentina serves up as
 * discrete step changes. At 8x and 12x it still fires exactly twice on the
 * backtest set, both times on MetroGAS's genuine winter onset (2.8k → 50k, an
 * 18x step), turning a 0% error into a 95% one and costing 12pp of p90 for a
 * tenth of a point of median.
 *
 * At 20x it stops firing on real data altogether. That is the right place for
 * it, because the garbage it was originally written for is now caught earlier
 * and better: the two non-positive totals in the backtest set are dropped by
 * `pointEstimate` before the level is ever computed. What is left for a ratio
 * test to catch is the order-of-magnitude parse error — a meter reading or an
 * account number scraped in as a total — and those miss by far more than 20x.
 *
 * The guard is defensive, not accuracy machinery. On this data every threshold
 * that changes any prediction makes it worse. */
export const OUTLIER_RATIO = 20;

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

// ── Bi-monthly billing ───────────────────────────────────────────────────────
// Argentine gas and electricity meters are read every second month. The vendor
// still issues a bill every month, so the *record* cadence is monthly — but the
// amounts arrive in near-identical pairs: a reading month, then a second month
// that barely moves off it, then a jump to the next reading.
//
// Measured on real bills, the contrast is not subtle. On the long MetroGAS
// account the median month-over-month move is 1.3% inside a pair and 88% across
// one; on the long Edesur account, 11% against 37%. Carrying the last amount
// forward therefore gets one month in two almost exactly right and the other
// badly wrong — which is precisely the shape of the error this model used to
// have (a 5.7% median sitting under a 69% p90).
//
// Splitting those two months apart is what makes seasonality readable. It is
// also why the year-over-year estimator lost the original bake-off: run on the
// raw monthly series it was fitting a sawtooth, not a season.

const monthIndex = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return y * 12 + (m - 1);
};

/** A detected two-month billing pair. `phase` is the parity of each pair's
 * FIRST month; `within`/`across` are the median |log| moves inside a pair and
 * between pairs, kept for the diagnostics that justify the detection. */
export type Pairing = { phase: number; within: number; across: number };

/** How many consecutive-month transitions of each parity it takes before the
 * contrast between them is worth believing. Three of each needs about seven
 * months of history. */
const MIN_PAIR_TRANSITIONS = 3;

/** How much bigger the across-pair move must be than the within-pair one, and
 * how big it must be in absolute terms. Both guard against reading a pairing
 * into a smooth series, where the two parities differ only by noise.
 *
 * Neither threshold is load-bearing: the detection is unchanged over
 * MIN_PAIR_TRANSITIONS 2–4 and PAIR_CONTRAST 1.8–3.5, because the accounts that
 * pair are separated from the ones that don't by an order of magnitude, not by
 * a hair. */
const PAIR_CONTRAST = 2.5;
const MIN_PAIR_JUMP = 0.1;

/** Whether this account bills in two-month pairs, and on which parity.
 *
 * Read off the account's own series, never the vendor: the same vendor bills
 * some accounts monthly and some bi-monthly, and a vendor allow-list would be
 * wrong for exactly the accounts nobody has looked at yet. */
export function detectPairing(history: Observation[]): Pairing | null {
  const sorted = normalizeHistory(history);
  const jumps: number[][] = [[], []];
  for (let i = 1; i < sorted.length; i++) {
    const [a, b] = [sorted[i - 1], sorted[i]];
    if (monthsBetween(a.month, b.month) !== 1) continue;
    if (a.amount <= 0 || b.amount <= 0) continue;
    jumps[monthIndex(a.month) % 2].push(
      Math.abs(Math.log(b.amount / a.amount)),
    );
  }
  if (jumps.some((j) => j.length < MIN_PAIR_TRANSITIONS)) return null;

  const [m0, m1] = [medianOf(jumps[0])!, medianOf(jumps[1])!];
  const within = Math.min(m0, m1);
  const across = Math.max(m0, m1);
  if (across < within * PAIR_CONTRAST || across < MIN_PAIR_JUMP) return null;
  return { phase: m0 < m1 ? 0 : 1, within, across };
}

/** The month a given month's billing pair starts in. */
const pairStart = (month: string, phase: number) =>
  monthIndex(month) % 2 === phase ? month : shiftMonth(month, -1);

/** One value per billing pair, keyed by the pair's first month. Collapsing the
 * sawtooth is what leaves a series with a season in it. */
export function pairSeries(
  history: Observation[],
  phase: number,
): Observation[] {
  const groups = new Map<string, number[]>();
  for (const o of normalizeHistory(history)) {
    if (o.amount <= 0) continue;
    const start = pairStart(o.month, phase);
    groups.set(start, [...(groups.get(start) ?? []), o.amount]);
  }
  return [...groups]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([month, amounts]) => ({ month, amount: medianOf(amounts)! }));
}

/** Slots per year of the pair series, and months per slot. */
const PAIR_PERIOD = 6;
const PAIR_STEP = 2;

/** Which slot-of-the-year a month falls in. `monthIndex % 12` is just the
 * zero-based calendar month, so this is stable across years. */
const slotOf = (month: string, step: number) =>
  Math.floor((monthIndex(month) % 12) / step);

/** Widest seasonal swing we'll believe, either way. */
const MAX_SEASONAL_FACTOR = 5;

// ── Seasonality ──────────────────────────────────────────────────────────────

/** Multiplicative seasonal factors, one per slot of the year.
 *
 * Each observation is divided by a local level — the median of the year of
 * observations centred on it — and each slot's factor is the median of its own
 * ratios across years. Dividing by a *local* level is what keeps inflation out
 * of the seasonal estimate: the window is symmetric in time, so a trend across
 * it largely cancels, while a season does not.
 *
 * The window spans `period + 1` slots, one MORE than a full cycle, and the slot
 * it doubles up on is the one half a year away. That is a deliberate choice
 * over three alternatives, and the reasoning is worth keeping because the
 * textbook answer measured worse:
 *
 *   symmetric, period+1 slots   4.6%  <- ships
 *   folded ends, period slots   5.1%
 *   one cycle, period slots     5.1%
 *   2xm centred moving average  5.4%  (and p90 62.6% against 54.5%)
 *
 * On a *de-trended* synthetic the symmetric window is plainly the worst of the
 * four: doubling the opposite season pulls every level away from the middle and
 * the recovered factors come out amplified (0.44 where the truth is 0.57). The
 * other three recover the planted season exactly.
 *
 * Add a trend and that reverses. A median is not a centred filter — it returns
 * the middle *value*, and once a season shuffles the ordering, the slot it
 * lands on is no longer the middle in *time*. So every median-based level lags
 * a rising series, which compresses the factors. Under 10%-per-pair growth the
 * one-cycle window recovers 1.89 against a truth of 2.29; the symmetric window,
 * amplifying, lands on 2.44. Two biases pointing opposite ways, and on
 * Argentine bills they very nearly cancel.
 *
 * The honest summary: this is not the unbiased estimator, it is the one whose
 * bias offsets the one we cannot remove without giving up the median. It won on
 * real data in every time slice tried (2024-01, 2025-01, 2025-07, 2026-01), by
 * the widest margin on the most recent. If the series ever stops trending —
 * Argentine inflation is not a law of nature — re-measure, because the ranking
 * above is a fact about trending data, not about filters.
 *
 * Null when there isn't enough history to separate season from trend, which is
 * the honest answer for most of an account's first year. */
export function seasonalFactors(
  series: Observation[],
  period: number,
  step: number,
): Map<number, number> | null {
  if (series.length < period + 2) return null;
  const index = new Map(series.map((o) => [o.month, o.amount]));
  const half = Math.floor(period / 2);
  const ratios = new Map<number, number[]>();

  for (const o of series) {
    const window: number[] = [];
    for (let k = -half; k <= half; k++) {
      const v = index.get(shiftMonth(o.month, k * step));
      if (v != null && v > 0) window.push(Math.log(v));
    }
    // Geometric, not arithmetic: these are ratios, and one winter peak would
    // drag an arithmetic mean level up and flatten the factor it belongs to.
    if (window.length < period - 2) continue;
    const level = Math.exp(medianOf(window)!);
    if (level <= 0) continue;
    const slot = slotOf(o.month, step);
    ratios.set(slot, [...(ratios.get(slot) ?? []), o.amount / level]);
  }
  if (ratios.size < period - 1) return null;

  const raw = new Map([...ratios].map(([slot, vs]) => [slot, medianOf(vs)!]));
  // Renormalise to geometric mean 1, or the factors smuggle a level shift into
  // every prediction on top of the season they're supposed to carry.
  const gm = Math.exp(
    [...raw.values()].reduce((t, v) => t + Math.log(v), 0) / raw.size,
  );
  return new Map(
    [...raw].map(([slot, v]) => [
      slot,
      Math.min(MAX_SEASONAL_FACTOR, Math.max(1 / MAX_SEASONAL_FACTOR, v / gm)),
    ]),
  );
}

/** How many recent observations the deseasonalised level reads. Two is jumpier
 * and four lags; three measured best, and the difference between them is small
 * enough that this is a shrug, not a finding. */
const SEASONAL_LEVEL_POINTS = 3;

/** Level × season: deseasonalise the newest observations, take their median as
 * the current level, then re-apply the target slot's factor.
 *
 * Deliberately no trend term. Lifting the level to the target at the series'
 * own growth rate was measured and was worse — it adds variance to an estimate
 * that is already only one slot ahead. */
export function seasonalLevel(
  series: Observation[],
  target: string,
  period: number,
  step: number,
): number | null {
  const factors = seasonalFactors(series, period, step);
  if (!factors) return null;
  const targetFactor = factors.get(slotOf(target, step));
  if (targetFactor == null) return null;

  const deseasonalized: number[] = [];
  for (const o of series.slice(-SEASONAL_LEVEL_POINTS)) {
    const f = factors.get(slotOf(o.month, step));
    if (f != null && f > 0) deseasonalized.push(o.amount / f);
  }
  const level = medianOf(deseasonalized);
  return level == null ? null : level * targetFactor;
}

/** How far the second month of a pair typically sits from the first. Usually
 * within a couple of percent of 1, but consistently so, and clamped hard —
 * the point is to shave a known bias, not to extrapolate. */
const MIN_REPEAT_RATIO = 0.85;
const MAX_REPEAT_RATIO = 1.2;

export function withinPairRatio(history: Observation[], phase: number): number {
  const sorted = normalizeHistory(history).filter((o) => o.amount > 0);
  const ratios: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const [a, b] = [sorted[i - 1], sorted[i]];
    if (monthsBetween(a.month, b.month) !== 1) continue;
    if (monthIndex(a.month) % 2 !== phase) continue;
    ratios.push(b.amount / a.amount);
  }
  const r = medianOf(ratios.slice(-6));
  return r == null
    ? 1
    : Math.min(MAX_REPEAT_RATIO, Math.max(MIN_REPEAT_RATIO, r));
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

  // A non-positive total is a real row — a credit, or a zero-balance month —
  // but a useless level. Carrying one forward forecasts $0, which is both
  // wrong and the single most alarming thing the dashboard could say.
  const positives = sorted.filter((o) => o.amount > 0);
  const last = positives.at(-1);
  if (!last) return { point: null, basis: "none", cadence, due };

  const { base, basis } = level(positives, target);

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
  const gap = monthsBetween(last.month, target);
  const point = base * gapFactor(gap - 1, household, fx);

  return { point, basis, cadence, due };
}

/** The level to forecast from, and which estimator produced it.
 *
 * Three cases, in order of how much structure the account has shown:
 *
 *  - A bi-monthly account whose target month is the *second* of a pair we
 *    already hold the first of. The two barely differ, so the newest bill is
 *    almost the answer; `withinPairRatio` shaves the small standing bias.
 *  - A bi-monthly account facing a *new* pair. This is the hard half, and the
 *    one carry-forward gets badly wrong (29.8% median APE against 4.1% here).
 *    Seasonality on the pair series is what fixes it.
 *  - Everything else: the newest bill, outlier-guarded. Nothing beat it, and
 *    the whole first half of this file is about why.
 *
 * `positives` must be non-empty and already stripped of non-positive totals. */
function level(
  positives: Observation[],
  target: string,
): { base: number; basis: Basis } {
  const last = positives.at(-1)!;
  const pairing = detectPairing(positives);

  if (!pairing) {
    return {
      base: anchorLevel(positives)!,
      basis: positives.length >= RECENT ? "baseline" : "carry",
    };
  }

  const targetPair = pairStart(target, pairing.phase);
  if (targetPair === pairStart(last.month, pairing.phase)) {
    return {
      base: last.amount * withinPairRatio(positives, pairing.phase),
      basis: "baseline",
    };
  }

  const seasonal = seasonalLevel(
    pairSeries(positives, pairing.phase),
    targetPair,
    PAIR_PERIOD,
    PAIR_STEP,
  );
  // Under a year of pairs there is no season to read yet, and the newest bill
  // is the wrong pair — but it is still the only level we have.
  return seasonal == null
    ? { base: anchorLevel(positives)!, basis: "baseline" }
    : { base: seasonal, basis: "yoy" };
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
 * backtest's median APE grouped by the basis that produced it: 13.7% over 20
 * `carry` predictions, 3.9% over 112 `baseline`, 4.2% over 15 `yoy`.
 *
 * `yoy` now means something — it is the seasonal estimator on the pair series —
 * having been dead weight kept only for the `forecast_basis` Postgres enum. Its
 * default is close to unreachable in practice: reaching it takes eight billing
 * pairs, by which point `selfBacktestError` has long since had enough points to
 * measure a band directly and this table is not consulted. */
const DEFAULT_BAND: Record<Basis, number> = {
  none: MAX_BAND,
  carry: 0.14,
  baseline: 0.05,
  yoy: 0.05,
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

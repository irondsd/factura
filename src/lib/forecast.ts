// Per-account bill forecasting. Pure and client-safe (no DB, no tRPC, no
// clock — callers pass the months they care about), so every rule here is
// unit-testable and replayable over historical data.
//
// See docs/superpowers/specs/2026-07-31-bill-forecasting-design.md.

import { monthsBetween } from "@/lib/insights";

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

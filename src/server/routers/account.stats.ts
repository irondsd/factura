/**
 * Pure aggregation for the profile page's stat cards. Kept free of DB/tRPC for
 * the same reason as insights.aggregate: the money math is the part worth
 * testing, and it doesn't need a database to be wrong.
 *
 * Two conventions run through everything here:
 *
 *  - **USD is the ranking unit.** Summing or comparing pesos across years is
 *    arithmetic on a moving unit — a 2023 peso and a 2026 peso are not the same
 *    quantity — so "biggest bill" and "priciest month" rank on the USD value
 *    each bill was converted to at its own due date. ARS is still reported, as
 *    the sum of what was actually billed, but it never decides an ordering.
 *  - **ARS ranking is the fallback, not a mix.** When not a single bill in the
 *    ledger has an FX rate (no rates loaded yet), ranking falls back to ARS
 *    wholesale. What it never does is compare a USD figure against a peso one.
 */
import type { bills } from "@/db/schema";

/** The bill columns these aggregates read, plus its converted USD amount. */
export type StatBill = Pick<
  typeof bills.$inferSelect,
  "createdBy" | "storageKey" | "totalAmount" | "period" | "dueDate" | "vendorId"
> & { usdAmount: number | null };

export type LedgerStats = {
  bills: { total: number; files: number; mine: number };
  /** `counted` is how many bills carried an amount at all — a bill still in
   * review has none, so the totals below are over a subset of `bills.total`. */
  money: { ars: number; usd: number; counted: number };
  history: {
    /** "YYYY-MM" of the oldest bill, by period (else due date). */
    firstMonth: string | null;
    /** Distinct months that hold at least one bill. */
    monthsCovered: number;
    /** Months from `firstMonth` to now, inclusive — the window `monthsCovered`
     * is a subset of. */
    monthsSpan: number;
  };
  biggest: {
    ars: number;
    usd: number | null;
    month: string | null;
    vendor: string | null;
  } | null;
  topMonth: { month: string; ars: number; usd: number; bills: number } | null;
};

/** A bill's month: the period it covers, falling back to when it fell due. */
const monthOf = (b: StatBill): string | null =>
  (b.period ?? b.dueDate)?.slice(0, 7) ?? null;

/** Whole months between two "YYYY-MM" markers. */
function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export function summarizeLedger(
  rows: StatBill[],
  opts: {
    userId: string;
    /** Current month, "YYYY-MM" — passed in so the span is testable. */
    now: string;
    vendorName: (id: string | null) => string | null;
  },
): LedgerStats {
  const { userId, now, vendorName } = opts;

  let files = 0;
  let mine = 0;
  let firstMonth: string | null = null;
  const months = new Set<string>();

  for (const b of rows) {
    if (b.storageKey) files++;
    if (b.createdBy === userId) mine++;
    const m = monthOf(b);
    if (m) {
      months.add(m);
      if (!firstMonth || m < firstMonth) firstMonth = m;
    }
  }

  const priced = rows.filter((b) => b.totalAmount !== null);
  // One decision for the whole ledger, so a bill with a rate is never ranked
  // against one without: USD when any bill has been converted, else pesos.
  const byUsd = priced.some((b) => b.usdAmount !== null);
  const rank = (b: StatBill) =>
    byUsd ? (b.usdAmount ?? -Infinity) : Number(b.totalAmount);

  let ars = 0;
  let usd = 0;
  let biggest: StatBill | null = null;
  const perMonth = new Map<
    string,
    { month: string; ars: number; usd: number; bills: number }
  >();

  for (const b of priced) {
    const amount = Number(b.totalAmount);
    ars += amount;
    if (b.usdAmount !== null) usd += b.usdAmount;
    if (!biggest || rank(b) > rank(biggest)) biggest = b;

    const m = monthOf(b);
    if (!m) continue;
    const entry = perMonth.get(m) ?? { month: m, ars: 0, usd: 0, bills: 0 };
    entry.ars += amount;
    entry.usd += b.usdAmount ?? 0;
    entry.bills++;
    perMonth.set(m, entry);
  }

  let topMonth: LedgerStats["topMonth"] = null;
  for (const entry of perMonth.values()) {
    const score = (e: typeof entry) => (byUsd ? e.usd : e.ars);
    if (!topMonth || score(entry) > score(topMonth)) topMonth = entry;
  }

  return {
    bills: { total: rows.length, files, mine },
    money: { ars, usd, counted: priced.length },
    history: {
      firstMonth,
      monthsCovered: months.size,
      monthsSpan: firstMonth ? monthsBetween(firstMonth, now) + 1 : 0,
    },
    biggest: biggest
      ? {
          ars: Number(biggest.totalAmount),
          usd: biggest.usdAmount,
          month: monthOf(biggest),
          vendor: vendorName(biggest.vendorId),
        }
      : null,
    topMonth,
  };
}

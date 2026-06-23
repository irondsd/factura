/**
 * Pure aggregation helpers for the insights router. Kept free of DB/tRPC so the
 * financial math (monthly series, completeness, share, inflation rebasing,
 * per-vendor trend) can be unit-tested in isolation. The router supplies the
 * already-loaded rows; everything here is a deterministic transform.
 */
import { bills, vendors } from "@/db/schema";
import { vendorColorVar } from "@/lib/vendorColors";

export type Currency = "ARS" | "USD";

export type EnrichedBill = typeof bills.$inferSelect & {
  usdAmount: number | null;
};

type VendorRow = typeof vendors.$inferSelect;

/** "YYYY-MM" list ending at `end`, length `n` (oldest → newest). */
export function monthList(end: string, n: number): string[] {
  const [ey, em] = end.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ey, em - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export function nowMonth(): string {
  return new Date().toISOString().slice(0, 10).slice(0, 7);
}

export const amountIn = (b: EnrichedBill, currency: Currency) =>
  currency === "USD"
    ? b.usdAmount
    : b.totalAmount !== null
      ? Number(b.totalAmount)
      : null;

type CustomVal = number | string | { value: number; unit?: string };

/** Read a parser-extracted custom field off a bill as a number, or null when
 * absent / non-numeric (e.g. a string field). Quantities are stored as
 * `{ value, unit }`, money/number as a bare number — see resultToExtra. */
export function readCustom(b: EnrichedBill, name: string): number | null {
  const fields = (b.extra as { fields?: Record<string, CustomVal> } | null)
    ?.fields;
  const v = fields?.[name];
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && "value" in v) return Number(v.value);
  return null;
}

export function vendorMeta(v: VendorRow) {
  return {
    id: v.id,
    displayName: v.displayName,
    color: vendorColorVar(v.color),
  };
}

/** Monthly totals split by vendor, in the selected currency. */
export function monthlySeries(
  months: string[],
  parsed: EnrichedBill[],
  currency: Currency,
) {
  return months.map((m) => {
    const period = `${m}-01`;
    const byVendor: Record<string, number> = {};
    let total = 0;
    for (const b of parsed) {
      if (b.period !== period || !b.vendorId) continue;
      const v = amountIn(b, currency);
      if (v == null) continue;
      byVendor[b.vendorId] = (byVendor[b.vendorId] ?? 0) + v;
      total += v;
    }
    return { month: m, byVendor, total };
  });
}

/** A month is "complete" when every vendor that has started billing has a
 * parsed bill that period. Keyed on vendor (not account) so an administrator
 * handover — two successive accounts merged under one vendor — reads as one
 * continuous stream. A vendor isn't "expected" before its first-ever bill, so
 * adding a new vendor mid-range doesn't retroactively mark older months
 * incomplete. */
export function completeFlagsFor(months: string[], parsed: EnrichedBill[]) {
  const firstMonthByVendor = new Map<string, string>();
  for (const b of parsed) {
    if (!b.vendorId || !b.period) continue;
    const m = b.period.slice(0, 7);
    const prev = firstMonthByVendor.get(b.vendorId);
    if (!prev || m < prev) firstMonthByVendor.set(b.vendorId, m);
  }
  const vendorIds = [...firstMonthByVendor.keys()];
  return months.map((m) => {
    if (vendorIds.length === 0) return false;
    return vendorIds.every((vid) => {
      if (m < firstMonthByVendor.get(vid)!) return true; // not yet expected
      return parsed.some((b) => b.vendorId === vid && b.period === `${m}-01`);
    });
  });
}

/** Rebase a series to 100 at its first non-null value (the inflation lens). */
export function rebase(vals: (number | null)[]): (number | null)[] {
  const first = vals.find((v) => v != null);
  return vals.map((v) => (v == null || !first ? null : (v / first) * 100));
}

export type MonthSeries = ReturnType<typeof monthlySeries>;
export type VendorHere = ReturnType<typeof vendorMeta>;

/** Vendor share over complete months, sorted high → low. */
export function shareList(
  series: MonthSeries,
  completeFlags: boolean[],
  vendors: VendorHere[],
) {
  const share: Record<string, number> = {};
  series.forEach((s, i) => {
    if (!completeFlags[i]) return;
    for (const [vid, amt] of Object.entries(s.byVendor))
      share[vid] = (share[vid] ?? 0) + amt;
  });
  return vendors
    .filter((v) => share[v.id])
    .map((v) => ({ vendorId: v.id, value: share[v.id] }))
    .sort((a, b) => b.value - a.value);
}

/** Per-vendor 12-month line + % delta from first to last known value. */
export function perVendorTrend(series: MonthSeries, vendors: VendorHere[]) {
  return vendors.map((v) => {
    const values = series.map((s) => s.byVendor[v.id] ?? null);
    const known = values.filter((x): x is number => x != null);
    const first = known[0];
    const lastV = known[known.length - 1];
    const pct = first ? ((lastV - first) / first) * 100 : null;
    return { vendor: v, values, last: lastV ?? null, pct };
  });
}

/** Both-currency view of a month range: stacked series, share, per-vendor trend.
 * Returned for both ARS and USD so each chart can toggle currency client-side
 * without a refetch. */
export function currencyViews(
  months: string[],
  parsed: EnrichedBill[],
  completeFlags: boolean[],
  vendors: VendorHere[],
) {
  const build = (currency: Currency) => {
    const series = monthlySeries(months, parsed, currency);
    return {
      series,
      share: shareList(series, completeFlags, vendors),
      perVendor: perVendorTrend(series, vendors),
    };
  };
  return { ARS: build("ARS"), USD: build("USD") };
}

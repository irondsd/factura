import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { db as Db } from "@/db";
import { bills, properties, vendorAccounts, vendors } from "@/db/schema";
import { FALLBACK_COLOR, vendorColorMap } from "@/lib/vendorColors";
import type { FieldType } from "@/parsers/engine/types";
import { billRateDate, usdRateLookup } from "../fx";
import { accessibleProperties } from "../ownership";
import { loadUserConfigs } from "../registry";
import { protectedProcedure, router } from "../trpc";

/** Resolve the property ids an insights query should cover: a single requested
 * apartment (when the caller is a member) or all the caller's apartments. */
async function resolveScope(
  db: typeof Db,
  userId: string,
  propertyId?: string,
): Promise<string[]> {
  const accessible = await accessibleProperties(db, userId);
  if (propertyId) return accessible.includes(propertyId) ? [propertyId] : [];
  return accessible;
}

type Currency = "ARS" | "USD";

/** "YYYY-MM" list ending at `end`, length `n` (oldest → newest). */
function monthList(end: string, n: number): string[] {
  const [ey, em] = end.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ey, em - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

function nowMonth(): string {
  return new Date().toISOString().slice(0, 10).slice(0, 7);
}

type EnrichedBill = typeof bills.$inferSelect & { usdAmount: number | null };

/** All parsed bills across the given apartments, USD-enriched. */
async function loadParsed(
  db: typeof Db,
  scopeIds: string[],
): Promise<EnrichedBill[]> {
  if (scopeIds.length === 0) return [];
  const rows = await db.query.bills.findMany({
    where: and(
      inArray(bills.propertyId, scopeIds),
      eq(bills.status, "parsed"),
    ),
    columns: { rawText: false },
  });
  const rateFor = await usdRateLookup(db, rows.map(billRateDate));
  return rows.map((b) => {
    const rate = rateFor(billRateDate(b));
    return {
      ...b,
      usdAmount:
        rate && b.totalAmount !== null ? Number(b.totalAmount) / rate : null,
    } as EnrichedBill;
  });
}

const amountIn = (b: EnrichedBill, currency: Currency) =>
  currency === "USD" ? b.usdAmount : b.totalAmount !== null ? Number(b.totalAmount) : null;

type CustomVal = number | string | { value: number; unit?: string };

/** Read a parser-extracted custom field off a bill as a number, or null when
 * absent / non-numeric (e.g. a string field). Quantities are stored as
 * `{ value, unit }`, money/number as a bare number — see resultToExtra. */
function readCustom(b: EnrichedBill, name: string): number | null {
  const fields = (b.extra as { fields?: Record<string, CustomVal> } | null)
    ?.fields;
  const v = fields?.[name];
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && "value" in v) return Number(v.value);
  return null;
}

/** Active accounts for the scope (drives expected/awaiting + completeness). */
async function loadActiveAccounts(db: typeof Db, scopeIds: string[]) {
  if (scopeIds.length === 0) return [];
  return db.query.vendorAccounts.findMany({
    where: and(
      inArray(vendorAccounts.propertyId, scopeIds),
      eq(vendorAccounts.active, true),
    ),
  });
}

/** Vendors across the given apartments. */
async function loadVendors(db: typeof Db, scopeIds: string[]) {
  if (scopeIds.length === 0) return [];
  return db.query.vendors.findMany({
    where: inArray(vendors.propertyId, scopeIds),
  });
}

type VendorRow = typeof vendors.$inferSelect;

function vendorMeta(v: VendorRow, colors: Map<string, string>) {
  return {
    id: v.id,
    displayName: v.displayName,
    category: v.category,
    color: colors.get(v.id) ?? FALLBACK_COLOR,
  };
}

/** Monthly totals split by vendor, in the selected currency. */
function monthlySeries(
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
function completeFlagsFor(months: string[], parsed: EnrichedBill[]) {
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
function rebase(vals: (number | null)[]): (number | null)[] {
  const first = vals.find((v) => v != null);
  return vals.map((v) => (v == null || !first ? null : (v / first) * 100));
}

type MonthSeries = ReturnType<typeof monthlySeries>;
type VendorHere = ReturnType<typeof vendorMeta>;

/** Vendor share over complete months, sorted high → low. */
function shareList(series: MonthSeries, completeFlags: boolean[], vendors: VendorHere[]) {
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
function perVendorTrend(series: MonthSeries, vendors: VendorHere[]) {
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
function currencyViews(
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

export const insightsRouter = router({
  /** Overview screen: this-month snapshot + last-12 trend + vendor share. */
  overview: protectedProcedure
    .input(
      z.object({
        propertyId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { propertyId } = input;
      const now = nowMonth();
      const scopeIds = await resolveScope(ctx.db, ctx.userId, propertyId);
      const parsed = await loadParsed(ctx.db, scopeIds);
      const accounts = await loadActiveAccounts(ctx.db, scopeIds);
      const allVendors = await loadVendors(ctx.db, scopeIds);
      const vendorColors = vendorColorMap(allVendors);
      const vendorById = new Map(allVendors.map((v) => [v.id, v]));
      const property =
        propertyId && scopeIds.length
          ? await ctx.db.query.properties.findFirst({
              where: eq(properties.id, propertyId),
            })
          : null;

      // Awaiting model: each active account either has a bill this month, or
      // we show its last received bill (calm, not "missing").
      const awaiting = accounts.map((a) => {
        const v = vendorById.get(a.vendorId)!;
        const thisMonth = parsed.find(
          (b) => b.accountId === a.id && b.period === `${now}-01`,
        );
        const past = parsed
          .filter((b) => b.accountId === a.id && b.period)
          .sort((x, y) => (x.period! < y.period! ? 1 : -1));
        const last = past[0];
        return {
          accountId: a.id,
          vendor: vendorMeta(v, vendorColors),
          received: Boolean(thisMonth),
          amount: thisMonth?.totalAmount != null ? Number(thisMonth.totalAmount) : null,
          usd: thisMonth?.usdAmount ?? null,
          lastPeriod: last?.period ? last.period.slice(0, 7) : null,
          lastAmount: last?.totalAmount != null ? Number(last.totalAmount) : null,
        };
      });
      const received = awaiting.filter((a) => a.received);
      const thisMonthTotal = received.reduce((s, a) => s + (a.amount ?? 0), 0);
      const thisMonthUsd = received.reduce((s, a) => s + (a.usd ?? 0), 0);

      const months = monthList(now, 12);
      const completeFlags = completeFlagsFor(months, parsed);

      const presentVendorIds = new Set(
        parsed.map((b) => b.vendorId).filter((x): x is string => Boolean(x)),
      );
      const vendorsHere = allVendors
        .filter((v) => presentVendorIds.has(v.id))
        .map((v) => vendorMeta(v, vendorColors));

      // Stacked series, vendor share and per-vendor trend in both currencies so
      // each chart can switch ARS/USD client-side without a refetch.
      const byCurrency = currencyViews(months, parsed, completeFlags, vendorsHere);

      return {
        property: property ? { id: property.id, nickname: property.nickname } : null,
        month: now,
        thisMonthTotal,
        thisMonthUsd,
        billsIn: received.length,
        billsExpected: awaiting.length,
        awaiting,
        months,
        completeFlags,
        vendors: vendorsHere,
        byCurrency,
      };
    }),

  /** Insights "all vendors": total spend, share, inflation lens. */
  series: protectedProcedure
    .input(
      z.object({
        propertyId: z.string().uuid().optional(),
        range: z.union([z.literal(12), z.literal(24)]).default(12),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { propertyId, range } = input;
      const months = monthList(nowMonth(), range);
      const scopeIds = await resolveScope(ctx.db, ctx.userId, propertyId);
      const parsed = await loadParsed(ctx.db, scopeIds);
      const allVendors = await loadVendors(ctx.db, scopeIds);
      const vendorColors = vendorColorMap(allVendors);
      const completeFlags = completeFlagsFor(months, parsed);

      const arsIdx = rebase(
        monthlySeries(months, parsed, "ARS").map((s, i) =>
          completeFlags[i] ? s.total : null,
        ),
      );
      const usdIdx = rebase(
        monthlySeries(months, parsed, "USD").map((s, i) =>
          completeFlags[i] ? s.total : null,
        ),
      );

      const presentVendorIds = new Set(
        parsed.map((b) => b.vendorId).filter((x): x is string => Boolean(x)),
      );
      const vendorsHere = allVendors
        .filter((v) => presentVendorIds.has(v.id))
        .map((v) => vendorMeta(v, vendorColors));

      const byCurrency = currencyViews(months, parsed, completeFlags, vendorsHere);

      return {
        months,
        completeFlags,
        vendors: vendorsHere,
        byCurrency,
        inflation: { arsIdx, usdIdx },
      };
    }),

  /** Insights single vendor: spend plus one series per parser-extracted custom
   * field (consumption, surcharge, extraordinaria, data usage, …). Vendor-
   * agnostic: the fields and their units come entirely from the parser config,
   * not from any hardcoded category knowledge. Quantity fields also get an
   * effective unit-price lens (amount ÷ quantity), rebased ARS vs USD. */
  vendorDetail: protectedProcedure
    .input(
      z.object({
        propertyId: z.string().uuid().optional(),
        vendorId: z.string().uuid(),
        range: z.union([z.literal(12), z.literal(24)]).default(12),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { propertyId, vendorId, range } = input;
      const months = monthList(nowMonth(), range);
      const scopeIds = await resolveScope(ctx.db, ctx.userId, propertyId);
      const vendor = await ctx.db.query.vendors.findFirst({
        where: eq(vendors.id, vendorId),
      });
      // Vendor must live in one of the apartments in scope.
      if (!vendor || !scopeIds.includes(vendor.propertyId)) return null;
      // Color is assigned per-apartment, so build the map from this vendor's
      // apartment to match what the other charts show.
      const vendorColors = vendorColorMap(
        await loadVendors(ctx.db, [vendor.propertyId]),
      );
      const parsed = (await loadParsed(ctx.db, scopeIds)).filter(
        (b) => b.vendorId === vendorId,
      );
      const byMonth = (m: string) => parsed.find((b) => b.period === `${m}-01`);

      const spendIn = (currency: Currency) =>
        months.map((m) => {
          const b = byMonth(m);
          return b ? amountIn(b, currency) : null;
        });
      const spend = { ARS: spendIn("ARS"), USD: spendIn("USD") };

      // Field metadata (type + unit) comes from the parser config(s) these bills
      // were produced by — a vendor may merge several parsers, so union them in
      // first-seen order.
      const configs = await loadUserConfigs(ctx.db, ctx.userId);
      const slugs = new Set(
        parsed.map((b) => b.parserKey).filter((s): s is string => Boolean(s)),
      );
      const fieldMeta = new Map<string, { type: FieldType; unit: string | null }>();
      for (const c of configs) {
        if (!slugs.has(c.slug)) continue;
        for (const cf of c.custom ?? []) {
          if (!fieldMeta.has(cf.name))
            fieldMeta.set(cf.name, { type: cf.type, unit: cf.unit ?? null });
        }
      }

      const fields = [...fieldMeta.entries()]
        .filter(
          ([name, m]) =>
            m.type !== "string" &&
            m.type !== "date" &&
            parsed.some((b) => readCustom(b, name) !== null),
        )
        .map(([name, m]) => {
          const isMoney = m.type === "money";
          // Native values: ARS pesos for money, raw unit for quantities/numbers.
          const values = months.map((mm) => {
            const b = byMonth(mm);
            return b ? readCustom(b, name) : null;
          });
          // Money fields also get a USD-converted copy so the chart can toggle;
          // quantity/number fields are currency-independent.
          const valuesUsd = isMoney
            ? months.map((mm, i) => {
                const b = byMonth(mm);
                const raw = values[i];
                if (raw == null || !b) return null;
                return b.totalAmount != null && b.usdAmount != null
                  ? raw * (b.usdAmount / Number(b.totalAmount))
                  : null;
              })
            : undefined;

          let unitPrice:
            | { arsIdx: (number | null)[]; usdIdx: (number | null)[] }
            | undefined;
          if (m.type === "quantity") {
            const ars = months.map((mm) => {
              const b = byMonth(mm);
              const q = b ? readCustom(b, name) : null;
              return b && b.totalAmount != null && q
                ? Number(b.totalAmount) / q
                : null;
            });
            const usd = months.map((mm) => {
              const b = byMonth(mm);
              const q = b ? readCustom(b, name) : null;
              return b && b.usdAmount != null && q ? b.usdAmount / q : null;
            });
            unitPrice = { arsIdx: rebase(ars), usdIdx: rebase(usd) };
          }

          return { name, type: m.type, unit: m.unit, isMoney, values, valuesUsd, unitPrice };
        });

      return { vendor: vendorMeta(vendor, vendorColors), months, spend, fields };
    }),
});

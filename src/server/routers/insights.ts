import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { db as Db } from "@/db";
import { bills, properties, vendorAccounts, vendors } from "@/db/schema";
import type { FieldType } from "@/parsers/engine/types";
import { billRateDate, usdRateLookup } from "../fx";
import { accessibleProperties } from "../ownership";
import { loadUserConfigs } from "../registry";
import { protectedProcedure, router } from "../trpc";
import {
  amountIn,
  completeFlagsFor,
  currencyViews,
  type Currency,
  type EnrichedBill,
  monthList,
  monthlySeries,
  nowMonth,
  readCustom,
  rebase,
  vendorMeta,
} from "./insights.aggregate";

/** Resolve the property ids an insights query should cover: a single requested
 * property (when the caller is a member) or all the caller's properties. */
async function resolveScope(
  db: typeof Db,
  userId: string,
  propertyId?: string,
): Promise<string[]> {
  const accessible = await accessibleProperties(db, userId);
  if (propertyId) return accessible.includes(propertyId) ? [propertyId] : [];
  return accessible;
}

/** All parsed bills across the given properties, USD-enriched. */
async function loadParsed(
  db: typeof Db,
  scopeIds: string[],
): Promise<EnrichedBill[]> {
  if (scopeIds.length === 0) return [];
  const rows = await db.query.bills.findMany({
    where: and(inArray(bills.propertyId, scopeIds), eq(bills.status, "parsed")),
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

/** Vendors across the given properties. */
async function loadVendors(db: typeof Db, scopeIds: string[]) {
  if (scopeIds.length === 0) return [];
  return db.query.vendors.findMany({
    where: inArray(vendors.propertyId, scopeIds),
  });
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
          vendor: vendorMeta(v),
          received: Boolean(thisMonth),
          amount:
            thisMonth?.totalAmount != null
              ? Number(thisMonth.totalAmount)
              : null,
          usd: thisMonth?.usdAmount ?? null,
          lastPeriod: last?.period ? last.period.slice(0, 7) : null,
          lastAmount:
            last?.totalAmount != null ? Number(last.totalAmount) : null,
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
        .map((v) => vendorMeta(v));

      // Stacked series, vendor share and per-vendor trend in both currencies so
      // each chart can switch ARS/USD client-side without a refetch.
      const byCurrency = currencyViews(
        months,
        parsed,
        completeFlags,
        vendorsHere,
      );

      return {
        property: property
          ? { id: property.id, nickname: property.nickname }
          : null,
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
        .map((v) => vendorMeta(v));

      const byCurrency = currencyViews(
        months,
        parsed,
        completeFlags,
        vendorsHere,
      );

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
      // Vendor must live in one of the properties in scope.
      if (!vendor || !scopeIds.includes(vendor.propertyId)) return null;
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
      const fieldMeta = new Map<
        string,
        { type: FieldType; unit: string | null }
      >();
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

          return {
            name,
            type: m.type,
            unit: m.unit,
            isMoney,
            values,
            valuesUsd,
            unitPrice,
          };
        });

      return { vendor: vendorMeta(vendor), months, spend, fields };
    }),
});

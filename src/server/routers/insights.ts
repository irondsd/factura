import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { db as Db } from "@/db";
import {
  bills,
  forecasts,
  properties,
  vendorAccounts,
  vendors,
} from "@/db/schema";
import {
  detectCadence,
  forecast,
  isDue,
  type Observation,
} from "@/lib/forecast";
import { monthRange, resolveWindowMonths } from "@/lib/insights";
import type { FieldType } from "@/parsers/engine/types";
import { billRateDate, recentFxSeries, usdRateLookup } from "../fx";
import { accessibleProperties, scopeIds } from "../ownership";
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
  return scopeIds(accessible, propertyId);
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

/** A "YYYY-MM" month tag (01–12), the shape both window endpoints take. */
const monthTag = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "expected a YYYY-MM month");

/** Explicit range window shared by `series` and `vendorDetail`. Both endpoints
 * are optional; omitted, they default to the last 12 months ending this month. */
const windowInput = { from: monthTag.optional(), to: monthTag.optional() };

/** Resolve an optional `{ from, to }` window into a concrete month list, anchored
 * to the real current month. Thin wrapper over the pure, unit-tested helper. */
const windowMonths = (from?: string, to?: string) =>
  resolveWindowMonths(from, to, nowMonth());

/** Whether `account` was expected to bill in `month`, judged only on what the
 * ledger knew going into it — the same cadence test the forecaster applies,
 * without the estimate. `billed` is every month the account has a bill for.
 *
 * Two silences are not a missing bill: a month before the account's first bill
 * (it didn't exist yet), and an off-cycle month for anything that doesn't bill
 * monthly. An account with no bills at all is only ever expected *now* — that's
 * the prompt-for-a-first-upload case, and it says nothing about last March. */
function expectedIn(
  billed: string[],
  month: string,
  isCurrentMonth: boolean,
): boolean {
  if (billed.length === 0) return isCurrentMonth;
  if (month < billed[0]) return false;
  const before = billed.filter((m) => m < month);
  return isDue(before[before.length - 1] ?? null, month, detectCadence(before));
}

/** The selectable span for the range control: earliest parsed bill → this month.
 * Drives the custom-range dropdowns and drag bar; `earliest` is null with no data. */
function boundsOf(parsed: EnrichedBill[]): {
  earliest: string | null;
  latest: string;
} {
  let earliest: string | null = null;
  for (const b of parsed) {
    if (!b.period) continue;
    const m = b.period.slice(0, 7);
    if (!earliest || m < earliest) earliest = m;
  }
  return { earliest, latest: nowMonth() };
}

export const insightsRouter = router({
  /** Overview screen: a month snapshot + last-12 trend + vendor share.
   *
   * `month` picks which snapshot the hero and the vendor cards describe. It
   * defaults to (and can never exceed) the current month. A past month gets the
   * same treatment as this one — including estimates for bills that never
   * arrived — with the model's view of history cut off at that month so the
   * estimate isn't made with the answer in hand. `closed` says whether every
   * bill due that month is in; `monthOptions` says the same for every month the
   * switcher can reach. The trend and share below stay anchored to today
   * whatever is selected, because "last 12 complete months" is a property of
   * the ledger, not of the pick. */
  overview: protectedProcedure
    .input(
      z.object({
        propertyId: z.string().uuid().optional(),
        month: monthTag.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { propertyId } = input;
      const now = nowMonth();
      // A future month has no ledger and no forecast to show, so the pick is
      // clamped rather than trusted.
      const target = input.month && input.month < now ? input.month : now;
      const isCurrentMonth = target === now;
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

      // What the forecaster reads: (month, ARS total) per account. Every other
      // column — and every parser-extracted custom field — is deliberately out
      // of reach, so the model can't come to depend on data that only some
      // vendors' parsers produce.
      const histories = new Map<string, Observation[]>();
      for (const b of parsed) {
        if (!b.accountId || !b.period || b.totalAmount == null) continue;
        const list = histories.get(b.accountId) ?? [];
        list.push({
          month: b.period.slice(0, 7),
          amount: Number(b.totalAmount),
        });
        histories.set(b.accountId, list);
      }
      // What the model is allowed to know. Estimating a past month from a
      // history that already contains it — or the months after it — is
      // hindsight wearing a prediction's clothes, so for anything but the
      // current month the record is cut off at the month being read.
      const knowable = (obs: Observation[]) =>
        isCurrentMonth ? obs : obs.filter((o) => o.month < target);
      // Every account in scope, this one included — that's the shared drift
      // signal, and an account's own history belongs in the pool.
      const household = [...histories.values()]
        .map(knowable)
        .filter((h) => h.length > 0);
      const period = `${target}-01`;
      const fx = await recentFxSeries(ctx.db, period);

      // Which months are fully accounted for. A month is closed when every
      // account that was due to bill in it actually did — the same question the
      // charts' completeness flags ask, but per account and cadence-aware, so a
      // bi-monthly vendor's off month doesn't read as a hole. Both the header
      // and the month switcher's markers come from this one function, so they
      // can't disagree about which months still need a bill.
      const billedBy = new Map(
        accounts.map((a) => [
          a.id,
          (histories.get(a.id) ?? []).map((o) => o.month).sort(),
        ]),
      );
      const closedIn = (m: string) => {
        const due = accounts.filter((a) =>
          expectedIn(billedBy.get(a.id)!, m, m === now),
        );
        return (
          due.length > 0 && due.every((a) => billedBy.get(a.id)!.includes(m))
        );
      };

      // What we already told the user to expect in this month. Once a period has
      // a stored row it IS the forecast for that period — hero, cards and the
      // over/under all read the same figure, and it stops drifting day to day
      // as the blue rate moves. Recomputation only happens where no row exists.
      const savedRows = accounts.length
        ? await ctx.db.query.forecasts.findMany({
            where: and(
              inArray(
                forecasts.accountId,
                accounts.map((a) => a.id),
              ),
              eq(forecasts.period, period),
            ),
          })
        : [];
      const savedBy = new Map(savedRows.map((r) => [r.accountId, r]));
      const fresh: (typeof forecasts.$inferInsert)[] = [];

      // Awaiting model: each active account either has a bill that month, or we
      // show its last received bill (calm, not "missing") alongside what we
      // expect it to come in at. Accounts that aren't on-cycle drop out.
      //
      // A past month runs the same model, not a narrower one. A bill that never
      // arrived is still missing in September just as it was in June, and the
      // estimate beside it is what says how big the hole is — dropping the card
      // would quietly restate an incomplete month as a smaller complete one.
      const awaiting = accounts.flatMap((a) => {
        const v = vendorById.get(a.vendorId)!;
        const past = parsed
          .filter((b) => b.accountId === a.id && b.period)
          .sort((x, y) => (x.period! < y.period! ? 1 : -1));
        const thisMonth = past.find((b) => b.period === period);
        // The most recent bill at or before the month on screen — "last May ·
        // $32.000" has to mean last relative to the month being read.
        const last = past.find((b) => b.period! <= period);

        // A bi-monthly (or quarterly, or annual) account is not "awaiting"
        // anything in the months it simply doesn't bill. Without this it nags
        // every month and inflates both the expected count and the total. A
        // bill that actually arrived always counts, whatever cadence says.
        if (
          !thisMonth &&
          !expectedIn(billedBy.get(a.id)!, target, isCurrentMonth)
        )
          return [];

        const f = forecast({
          history: knowable(histories.get(a.id) ?? []),
          household,
          fx,
          target,
        });

        // A stored row wins over anything recomputed now — that is the freeze.
        const saved = savedBy.get(a.id);
        const expected = saved ? Number(saved.pointArs) : f.point;
        const amount =
          thisMonth?.totalAmount != null ? Number(thisMonth.totalAmount) : null;

        // Only record a prediction for an account that hasn't billed yet, and
        // only for the month we're actually living in. "Predicting" a bill
        // already sitting in the history isn't a prediction, and backdating one
        // into a month that has come and gone is not a forecast we ever made.
        if (
          isCurrentMonth &&
          !saved &&
          !thisMonth &&
          f.point != null &&
          f.point > 0
        ) {
          fresh.push({
            accountId: a.id,
            period,
            pointArs: String(f.point),
            lowArs: String(f.low ?? f.point),
            highArs: String(f.high ?? f.point),
            basis: f.basis as "carry" | "baseline" | "yoy",
            confidence: f.confidence,
          });
        }

        return [
          {
            accountId: a.id,
            vendor: vendorMeta(v),
            received: Boolean(thisMonth),
            amount,
            usd: thisMonth?.usdAmount ?? null,
            lastPeriod: last?.period ? last.period.slice(0, 7) : null,
            lastAmount:
              last?.totalAmount != null ? Number(last.totalAmount) : null,
            expected,
            expectedLow: saved ? Number(saved.lowArs) : f.low,
            expectedHigh: saved ? Number(saved.highArs) : f.high,
            basis: saved ? saved.basis : f.basis,
            confidence: saved ? saved.confidence : f.confidence,
            // How the real bill landed against what we said it would be. Only
            // ever present when a stored row exists, which by the rule above
            // means we committed to the number before the bill arrived.
            vsExpected:
              saved && amount != null && Number(saved.pointArs) > 0
                ? amount / Number(saved.pointArs) - 1
                : null,
          },
        ];
      });

      // Write-on-read, like `ensureFxRates` above it: the forecast has to be
      // frozen the first time anyone looks at the month, and that first look is
      // this query. `onConflictDoNothing` against the unique index means two
      // concurrent readers can't both write — the loser keeps its own figure for
      // this one response and picks up the stored one on the next load.
      if (fresh.length > 0) {
        await ctx.db.insert(forecasts).values(fresh).onConflictDoNothing();
      }
      const received = awaiting.filter((a) => a.received);
      const thisMonthTotal = received.reduce((s, a) => s + (a.amount ?? 0), 0);
      const thisMonthUsd = received.reduce((s, a) => s + (a.usd ?? 0), 0);

      // The hero number: what's confirmed, plus what we expect from everything
      // still awaiting. An account with no history contributes nothing rather
      // than a guess, so this reads low rather than inventing a figure.
      const expectedTotal = awaiting.reduce(
        (s, a) => s + (a.received ? (a.amount ?? 0) : (a.expected ?? 0)),
        0,
      );

      const months = monthList(now, 12);
      const completeFlags = completeFlagsFor(months, parsed);

      // What the month switcher can reach, and which of those months still owe
      // a bill. The span runs unbroken from the earliest bill to today rather
      // than skipping to the months that have one: a month with nothing in it
      // at all is the biggest hole there is, and leaving it unreachable would
      // hide it. `closed` is what the switcher marks — the whole point being
      // that an incomplete month is visible before you go looking for it.
      const earliest = boundsOf(parsed).earliest;
      const monthOptions = monthRange(earliest ?? now, now).map((m) => ({
        month: m,
        closed: closedIn(m),
      }));

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
        month: target,
        isCurrentMonth,
        closed: closedIn(target),
        monthOptions,
        thisMonthTotal,
        thisMonthUsd,
        expectedTotal,
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
        ...windowInput,
      }),
    )
    .query(async ({ ctx, input }) => {
      const { propertyId, from, to } = input;
      const months = windowMonths(from, to);
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
        bounds: boundsOf(parsed),
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
        ...windowInput,
      }),
    )
    .query(async ({ ctx, input }) => {
      const { propertyId, vendorId, from, to } = input;
      const months = windowMonths(from, to);
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
          // For money fields, a bill that exists but omits this field means the
          // vendor didn't charge it that month (e.g. an extraordinaria only
          // levied some months) → an honest 0, not a gap. No bill at all stays
          // null so we never invent data for a month we have nothing for.
          const values = months.map((mm) => {
            const b = byMonth(mm);
            if (!b) return null;
            const v = readCustom(b, name);
            return v ?? (isMoney ? 0 : null);
          });
          // Money fields also get a USD-converted copy so the chart can toggle;
          // quantity/number fields are currency-independent.
          const valuesUsd = isMoney
            ? months.map((mm, i) => {
                const b = byMonth(mm);
                const raw = values[i];
                if (raw == null || !b) return null;
                if (raw === 0) return 0; // 0 pesos is 0 dollars, no rate needed
                return b.totalAmount != null && b.usdAmount != null
                  ? raw * (b.usdAmount / Number(b.totalAmount))
                  : null;
              })
            : undefined;

          let unitPrice:
            | { arsIdx: (number | null)[]; usdIdx: (number | null)[] }
            | undefined;
          if (m.type === "quantity") {
            // Effective unit price = amount ÷ quantity. A zero-quantity month
            // (0 m³ consumed) has no per-unit price mathematically, but it means
            // nothing was bought → plot 0 rather than a gap. Only null (no bill,
            // or no reading) stays a gap.
            const ars = months.map((mm) => {
              const b = byMonth(mm);
              if (!b || b.totalAmount == null) return null;
              const q = readCustom(b, name);
              if (q == null) return null;
              return q === 0 ? 0 : Number(b.totalAmount) / q;
            });
            const usd = months.map((mm) => {
              const b = byMonth(mm);
              if (!b || b.usdAmount == null) return null;
              const q = readCustom(b, name);
              if (q == null) return null;
              return q === 0 ? 0 : b.usdAmount / q;
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

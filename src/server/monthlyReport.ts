/**
 * Monthly closing report — the "last expected bill of the month just landed"
 * flow. When a bill files into a property, we check whether that bill's month is
 * now *complete* (every vendor that has started billing the property has a
 * parsed bill for the period, per the canonical `completeFlagsFor`). If so, we
 * claim the (property, month) in `monthly_reports` — the unique insert is the
 * idempotency + concurrency guard — and, only if the claim is ours, gather the
 * per-vendor breakdown and email every member of the property.
 *
 * Best-effort by design (mirrors src/server/email.ts): this runs in the ingest
 * route's `after()`, so it never blocks or fails an upload, and any error is
 * logged rather than thrown.
 */

import { and, eq } from "drizzle-orm";
import type { db as Db } from "@/db";
import {
  bills,
  monthlyReports,
  properties,
  propertyMembers,
  users,
  vendors,
} from "@/db/schema";
import { billRateDate, usdRateLookup } from "./fx";
import { completeFlagsFor } from "./routers/insights.aggregate";
import { sendMonthlyReportEmail } from "./email";
import type { ReportVendor } from "../../emails/monthly-report";

/** "YYYY-MM-01" shifted by whole months (handles year wrap). */
function shiftPeriod(period: string, deltaMonths: number): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + deltaMonths, 1))
    .toISOString()
    .slice(0, 10);
}

type BillLite = {
  vendorId: string | null;
  period: string | null;
  totalAmount: string | null;
  dueDate: string | null;
};

/** Per-vendor ARS + USD totals for one period. USD sums only the bills that had
 * a rate (matching the app's `monthlySeries`), and is null when none did. */
function totalsForPeriod(
  rows: BillLite[],
  period: string,
  rateFor: (date: string | null) => number | null,
): Map<string, { ars: number; usd: number | null }> {
  const out = new Map<string, { ars: number; usd: number | null }>();
  for (const b of rows) {
    if (b.period !== period || !b.vendorId || b.totalAmount === null) continue;
    const ars = Number(b.totalAmount);
    const rate = rateFor(billRateDate(b));
    const cur = out.get(b.vendorId) ?? { ars: 0, usd: null };
    cur.ars += ars;
    if (rate) cur.usd = (cur.usd ?? 0) + ars / rate;
    out.set(b.vendorId, cur);
  }
  return out;
}

const pctChange = (cur: number, prev: number | undefined): number | null =>
  prev ? ((cur - prev) / prev) * 100 : null;

/**
 * Check completeness for `property`'s `period` month and, if newly complete,
 * send the monthly report to every member. `period` is the uploaded bill's
 * period ("YYYY-MM-01") — a back-dated bill can complete a past month.
 */
export async function maybeSendMonthlyReport(
  db: typeof Db,
  propertyId: string,
  period: string,
): Promise<void> {
  const month = period.slice(0, 7);

  // All parsed bills for the property — small per property; drives both the
  // completeness check and the current/prev-month/prev-year breakdown.
  const rows = await db.query.bills.findMany({
    where: and(eq(bills.propertyId, propertyId), eq(bills.status, "parsed")),
    columns: { vendorId: true, period: true, totalAmount: true, dueDate: true },
  });

  const [complete] = completeFlagsFor([month], rows);
  if (!complete) return;

  // Claim the (property, month). If the row already exists the report went out
  // already (or is going out concurrently) — bail without sending again.
  const claimed = await db
    .insert(monthlyReports)
    .values({ propertyId, period })
    .onConflictDoNothing()
    .returning({ id: monthlyReports.id });
  if (claimed.length === 0) return;

  const prevMonth = shiftPeriod(period, -1);
  const prevYear = shiftPeriod(period, -12);

  const relevant = rows.filter(
    (b) =>
      b.period === period || b.period === prevMonth || b.period === prevYear,
  );
  const rateFor = await usdRateLookup(db, relevant.map(billRateDate));

  const cur = totalsForPeriod(rows, period, rateFor);
  const mom = totalsForPeriod(rows, prevMonth, rateFor);
  const yoy = totalsForPeriod(rows, prevYear, rateFor);

  const vendorRows = await db.query.vendors.findMany({
    where: eq(vendors.propertyId, propertyId),
    columns: { id: true, displayName: true, color: true },
  });
  const vendorById = new Map(vendorRows.map((v) => [v.id, v]));

  const reportVendors: ReportVendor[] = [...cur.entries()]
    .map(([vendorId, t]) => {
      const v = vendorById.get(vendorId);
      return {
        name: v?.displayName ?? "—",
        color: v?.color,
        ars: t.ars,
        usd: t.usd,
        momPct: pctChange(t.ars, mom.get(vendorId)?.ars),
        yoyPct: pctChange(t.ars, yoy.get(vendorId)?.ars),
      };
    })
    .sort((a, b) => b.ars - a.ars);

  if (reportVendors.length === 0) return;

  const totalArs = reportVendors.reduce((s, v) => s + v.ars, 0);
  const usdKnown = reportVendors.filter((v) => v.usd != null);
  const totalUsd =
    usdKnown.length > 0
      ? usdKnown.reduce((s, v) => s + (v.usd as number), 0)
      : null;

  const property = await db.query.properties.findFirst({
    where: eq(properties.id, propertyId),
    columns: { nickname: true, address: true },
  });
  // Prefer the address (nickname is a short tab label like "Home").
  const propertyLabel = property?.address || property?.nickname || "—";

  // Every member of the property — owner and invited members alike.
  const members = await db
    .select({ email: users.email, locale: users.locale })
    .from(propertyMembers)
    .innerJoin(users, eq(propertyMembers.userId, users.id))
    .where(eq(propertyMembers.propertyId, propertyId));

  await Promise.all(
    members.map((m) =>
      sendMonthlyReportEmail({
        to: m.email,
        locale: m.locale,
        property: propertyLabel,
        month: period,
        totalArs,
        totalUsd,
        vendors: reportVendors,
      }),
    ),
  );
}

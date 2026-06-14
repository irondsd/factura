import { and, desc, gte, lte } from "drizzle-orm";
import type { db as Db } from "@/db";
import { fxRates } from "@/db/schema";

const API_URL = "https://api.argentinadatos.com/v1/cotizaciones/dolares/blue";

// Throttle refresh attempts so a failing API never hammers on every query.
let lastAttempt = 0;

type ApiRow = { casa: string; compra: number; venta: number; fecha: string };

/** Fetch the full blue-rate history once; afterwards only append new days. */
export async function ensureFxRates(db: typeof Db): Promise<void> {
  const latest = await db.query.fxRates.findFirst({
    orderBy: [desc(fxRates.date)],
  });
  const today = new Date().toISOString().slice(0, 10);
  if (latest && latest.date >= today) return;

  const throttleMs = latest ? 60 * 60 * 1000 : 5 * 60 * 1000;
  if (Date.now() - lastAttempt < throttleMs) return;
  lastAttempt = Date.now();

  try {
    const res = await fetch(API_URL);
    if (!res.ok) return;
    const data = (await res.json()) as ApiRow[];
    const rows = data
      .filter((d) => d.fecha && d.venta > 0)
      .map((d) => ({
        date: d.fecha,
        compra: d.compra > 0 ? String(d.compra) : null,
        venta: String(d.venta),
      }));
    const fresh = latest ? rows.filter((r) => r.date > latest.date) : rows;
    for (let i = 0; i < fresh.length; i += 1000) {
      await db
        .insert(fxRates)
        .values(fresh.slice(i, i + 1000))
        .onConflictDoNothing();
    }
  } catch {
    // USD stays unavailable until the next attempt; ARS data is unaffected.
  }
}

/** Most recent rate on or before the given date (markets skip some days). */
export function pickRate(
  sortedAsc: { date: string; venta: string }[],
  date: string,
): number | null {
  let result: number | null = null;
  for (const r of sortedAsc) {
    if (r.date > date) break;
    result = Number(r.venta);
  }
  return result;
}

/** Build a date -> USD-rate lookup covering [min(dates) - 14d, max(dates)]. */
export async function usdRateLookup(
  db: typeof Db,
  dates: (string | null)[],
): Promise<(date: string | null) => number | null> {
  const valid = dates.filter((d): d is string => Boolean(d)).sort();
  if (valid.length === 0) return () => null;

  await ensureFxRates(db);

  const from = new Date(`${valid[0]}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 14);
  const rows = await db.query.fxRates.findMany({
    where: and(
      gte(fxRates.date, from.toISOString().slice(0, 10)),
      lte(fxRates.date, valid[valid.length - 1]),
    ),
    orderBy: [fxRates.date],
  });

  return (date) => (date ? pickRate(rows, date) : null);
}

/** Rate date for a bill: due date if known, else its period month. */
export function billRateDate(bill: {
  dueDate: string | null;
  period: string | null;
}): string | null {
  return bill.dueDate ?? bill.period;
}

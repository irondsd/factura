const ars = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

export function formatARS(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return ars.format(Number(value));
}

const usd = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

export function formatUSD(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return usd.format(Number(value));
}

// Big ledger totals use whole pesos (the design's fmtMoney); decimals are kept
// for USD and for the raw-text breakdown.
const arsWhole = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Money in the active currency: whole pesos for ARS, 2-decimal USD. */
export function formatMoney(
  value: number | string | null | undefined,
  currency: "ARS" | "USD",
): string {
  if (value === null || value === undefined) return "—";
  return currency === "USD" ? formatUSD(value) : arsWhole.format(Number(value));
}

const monthFmt = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const monthShortFmt = new Intl.DateTimeFormat("en", {
  month: "short",
  timeZone: "UTC",
});

/** "2026-06" or "2026-06-01" -> "June 2026" */
export function formatMonth(month: string): string {
  return monthFmt.format(new Date(`${month.slice(0, 7)}-01T00:00:00Z`));
}

/** "2026-06" or "2026-06-01" -> "Jun" */
export function formatMonthShort(month: string): string {
  return monthShortFmt.format(new Date(`${month.slice(0, 7)}-01T00:00:00Z`));
}

/** "2026-06" +/- n months */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

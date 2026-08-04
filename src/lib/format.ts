import type { Locale } from "@/i18n/config";

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

/** Round to `digits` significant figures.
 *
 * For forecasts, which are estimates: rendering one to the peso ("≈ $613.112")
 * claims a precision the model does not have, and invites the reader to treat
 * it as a bill. "≈ $613.000" says the same thing honestly. */
export function roundSignificant(value: number, digits = 3): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  const scale = 10 ** (digits - 1 - Math.floor(Math.log10(Math.abs(value))));
  return Math.round(value * scale) / scale;
}

// Month names follow the UI language. Currency above stays es-AR (the product
// is ARS-based), but "June 2026" vs "junio de 2026" tracks the active locale.
const INTL_TAG: Record<Locale, string> = { es: "es-AR", en: "en" };

const monthFmt: Record<Locale, Intl.DateTimeFormat> = {
  es: new Intl.DateTimeFormat(INTL_TAG.es, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }),
  en: new Intl.DateTimeFormat(INTL_TAG.en, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }),
};

const monthShortFmt: Record<Locale, Intl.DateTimeFormat> = {
  es: new Intl.DateTimeFormat(INTL_TAG.es, { month: "short", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat(INTL_TAG.en, { month: "short", timeZone: "UTC" }),
};

/** "2026-06" -> "June 2026" (en) / "junio de 2026" (es) */
export function formatMonth(month: string, locale: Locale = "es"): string {
  return monthFmt[locale].format(new Date(`${month.slice(0, 7)}-01T00:00:00Z`));
}

const dayFmt: Record<Locale, Intl.DateTimeFormat> = {
  es: new Intl.DateTimeFormat(INTL_TAG.es, {
    dateStyle: "long",
    timeZone: "UTC",
  }),
  en: new Intl.DateTimeFormat(INTL_TAG.en, {
    dateStyle: "long",
    timeZone: "UTC",
  }),
};

/** "2026-06-01" -> "1 de junio de 2026" (es) / "June 1, 2026" (en). For dates a
 * reader is meant to act on, like a due date. UTC so a stored date never shifts
 * a day for a reader west of Greenwich. */
export function formatDate(iso: string, locale: Locale = "es"): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : dayFmt[locale].format(d);
}

const relativeFmt: Record<Locale, Intl.RelativeTimeFormat> = {
  es: new Intl.RelativeTimeFormat(INTL_TAG.es, { numeric: "auto" }),
  en: new Intl.RelativeTimeFormat(INTL_TAG.en, { numeric: "auto" }),
};

// Largest unit first: the first one the elapsed time clears is the one used, so
// 90 minutes reads "1 hour ago" rather than "90 minutes ago".
const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

/** A past timestamp as "hace 5 minutos" / "5 minutes ago". Anything under a
 * minute is "ahora" / "now" — for a last-active reading, second-level precision
 * is noise. Coarse by design: the units above are nominal lengths, so this is
 * for prose, never for arithmetic. */
export function formatRelativeTime(
  iso: string,
  locale: Locale = "es",
  now: number = Date.now(),
): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const elapsed = Math.max(0, Math.round((now - then) / 1000));
  const [unit, size] = RELATIVE_UNITS.find(([, s]) => elapsed >= s) ?? [
    "second" as const,
    1,
  ];
  const value = unit === "second" ? 0 : Math.floor(elapsed / size);
  return relativeFmt[locale].format(-value, unit);
}

/** "2026-06" -> "Jun" (en) / "jun." (es) */
export function formatMonthShort(month: string, locale: Locale = "es"): string {
  return monthShortFmt[locale].format(
    new Date(`${month.slice(0, 7)}-01T00:00:00Z`),
  );
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

/** Up-to-two-letter initials from a name or email, e.g. "Ada Lovelace" -> "AL",
 * "ada@example.com" -> "AE". Used for avatar circles. */
export function initials(name: string): string {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

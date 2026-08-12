import raw from "./dolar.json";

// Quarterly ARS/USD averages, the bridge between the two IDECBA series.
//
// `venta-caba.ts` is in dollars per m² and `alquiler-caba.ts` is in pesos a
// month. Neither page needs this module; the rentability page divides one by
// the other and cannot do it without a rate.
//
// ── Which rate, and why it is a decision rather than a lookup ──────────────
// `RATE` below is the blue, and the page says so wherever it prints a figure.
// The reasoning, in the order it matters:
//
//   • CABA apartments are bought and sold in physical dollars. The price IDECBA
//     publishes is a dollar price because that is the currency of the market,
//     not because someone converted a peso price at some official rate. So the
//     rate that belongs in the denominator is the one a person actually pays to
//     get those dollars.
//   • Between the 2019 cepo and its lifting in April 2025 the official rate ran
//     as low as half the blue. Converting a peso rent at the official rate in
//     2022Q3 doubles it, and doubles the yield with it — 6,05 % against 2,99 %.
//     The official series is kept precisely so the page can show that, and it
//     is never what the page's own figures divide by.
//   • The MEP agrees with the blue to a few tenths of a point across the whole
//     series. That agreement is what makes the choice defensible: two rates
//     reached by completely different routes give the same answer, and the
//     third is the one distorted by an exchange control that no longer exists.
//
// ── What the choice cannot affect ──────────────────────────────────────────
// The rate is a *common divisor within a quarter*. Every barrio in a given
// quarter is divided by the same number, so the ranking of barrios by yield is
// identical under all three rates — arithmetically, not approximately. The
// choice moves the level of the series and nothing about its cross-section, and
// the page leans on that: the map is robust to the argument, the time series is
// the part that has to defend itself.
//
// ── Refreshing ─────────────────────────────────────────────────────────────
// Don't hand-edit dolar.json. Run
//
//   bun run data:dolar
//
// and commit the diff. It only adds a quarter once that quarter has closed, so
// running it mid-quarter is a no-op rather than a partial average. Refresh it
// in the same pass as `bun run data:caba`, since the rentability page joins all
// three files on the same period axis.

export type RateId = (typeof raw.rates)[number]["id"];

const DATA = raw as unknown as {
  periods: string[];
  days: Record<RateId, number[]>;
  series: Record<RateId, (number | null)[]>;
  rates: { id: RateId; label: string; note: string }[];
};

/** Every quarter in the file, oldest first, as `YYYYQn`. */
export const PERIODS: readonly string[] = DATA.periods;

/** The three rates, in the order the page presents them. */
export const RATES = DATA.rates;

/** The rate every published figure on the rentability page is computed with.
 * Changing this constant changes the page's numbers — see the header first. */
export const RATE: RateId = "blue";

export const SOURCE = raw.source;
export const SOURCE_URL = raw.sourceUrl;

const ordinal = (period: string): number =>
  Number(period.slice(0, 4)) * 4 + Number(period.slice(5)) - 1;

/** Fails the build on a gap, a repeat, an out-of-order quarter, a short series
 * or a non-positive rate. The same guard the IDECBA modules put on their axes,
 * and one extra: this series ends up in a denominator, so a zero or a negative
 * here would not throw downstream — it would silently produce an infinite or a
 * negative yield and render it as a number. */
function assertShape(): void {
  for (let i = 1; i < PERIODS.length; i++) {
    if (ordinal(PERIODS[i]) !== ordinal(PERIODS[i - 1]) + 1) {
      throw new Error(
        `dolar.json: expected consecutive quarters, got ${PERIODS[i - 1]} → ${PERIODS[i]}`,
      );
    }
  }
  for (const { id } of RATES) {
    const series = DATA.series[id];
    if (series?.length !== PERIODS.length) {
      throw new Error(
        `dolar.json: rate "${id}" has ${series?.length} values, expected ${PERIODS.length}`,
      );
    }
    for (let i = 0; i < series.length; i++) {
      const v = series[i];
      if (v !== null && !(v > 0)) {
        throw new Error(
          `dolar.json: rate "${id}" is ${v} in ${PERIODS[i]} — a rate has to be positive or null`,
        );
      }
    }
  }
  if (DATA.series[RATE].some((v) => v === null)) {
    throw new Error(
      `dolar.json: the rate the page divides by ("${RATE}") has gaps, which would silently drop quarters from every series derived from it`,
    );
  }
}
assertShape();

const AT = new Map(PERIODS.map((p, i) => [p, i]));

/** The average rate in a quarter, or `null` where this rate has none. Callers
 * pass a period from *another* dataset, so an unknown quarter is a legitimate
 * miss (the IDECBA series start and end elsewhere) rather than a bug. */
export function rate(period: string, which: RateId = RATE): number | null {
  const at = AT.get(period);
  return at === undefined ? null : DATA.series[which][at];
}

/** How many daily quotes are behind a quarter's average — quoted in the
 * methodology so the average isn't taken on faith. */
export function quotes(period: string, which: RateId = RATE): number {
  const at = AT.get(period);
  return at === undefined ? 0 : DATA.days[which][at];
}

/** The gap between the informal and the official rate, as a fraction: 0.86
 * means the blue was 86 % above the official. `null` before the MEP starts or
 * outside the file. This is the number that explains why the choice of rate
 * mattered enormously in 2022 and does not matter at all today. */
export function brecha(period: string): number | null {
  const blue = rate(period, "blue");
  const oficial = rate(period, "oficial");
  return blue === null || oficial === null ? null : blue / oficial - 1;
}

const NUMBER = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** Pesos per dollar, whole. The cents of a quarterly average are noise. */
export const formatRate = (value: number): string =>
  `$ ${NUMBER.format(Math.round(value))}`;

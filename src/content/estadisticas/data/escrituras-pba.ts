import raw from "./escrituras-pba.json";
import { rate as dolarRate, RATE as DOLAR_RATE } from "./dolar";

// Every deed signed over a property in the Provincia de Buenos Aires, month by
// month since January 2005, as counted by the Colegio de Escribanos de la
// Provincia — the body that registers them.
//
// It backs /estadisticas/escrituras-provincia-buenos-aires and it is the
// longest clean monthly series in this directory: 258 consecutive months, no
// gap and no repeat, verified on every refresh by the script that builds it.
//
// ── Why this dataset is different from the rest of the folder ─────────────
// Everything else here prices *offers*: what a seller asks, read off a portal
// or a relevamiento. This counts *transactions* — acts that happened, at the
// price actually paid, in front of a notary. Nothing here is a sample and
// nothing here is an estimate.
//
// Which also fixes what it can and cannot answer:
//
//   • It has no surface. There is no m² anywhere in the source, so it can never
//     say what a metre costs — that is
//     /estadisticas/precio-m2-provincia-buenos-aires.
//   • It has no geography. The table is province-wide totals only: no partido,
//     no delegación, despite the Colegio having eighteen of them.
//   • Its money column is in **pesos corrientes** across twenty-one years of
//     Argentine inflation, which makes it unreadable uncorrected. The counts
//     need no deflation, and that is why the page leads with them and treats
//     the amount as a secondary cut, converted to dollars from 2017 — where
//     `dolar.json` starts.
//
// ── The two traps this module exists to close ────────────────────────────
//
// **Seasonality.** December is the peak of every single year and January the
// trough of every single year, by a factor of about four. A month-on-month
// reading of this series reports Christmas as a boom and New Year as a crash,
// every year, forever. So the comparisons offered here are year-on-year
// (`yoy`) or twelve-month rolling (`rolling12`), and `seasonality()` exists to
// show the reader why.
//
// **April 2020.** One deed. Not a parse error and not a rounding artefact: the
// province was under a strict lockdown and the escribanías were shut, so one
// act was signed in the whole province and 407 the month after. It is the
// minimum of the series by three orders of magnitude, and any ratio with that
// month in the denominator is meaningless — `hipotecaShare("2020-04")` would
// be 300 %, from three mortgages over one sale. `MIN_ACTS_FOR_RATIO` is what
// keeps that number off the page.
//
// ── Refreshing ────────────────────────────────────────────────────────────
//   bun run data:escrituras
// Monthly, about two weeks after a month closes. Deeds are counted by fecha de
// escritura, so the newest two months keep moving as late filings land;
// `PROVISIONAL` is the set the page marks as such.

const DATA = raw as unknown as {
  source: string;
  sourceUrl: string;
  pdfUrl: string;
  sourceNote: string;
  generatedBy: string;
  fetchedAt: string;
  pdfDate: string | null;
  lastPeriod: string;
  provisional: string[];
  flagged: { period: string; note: string }[];
  fideicomisoUntil: string;
  periods: string[];
  compraventaActos: number[];
  compraventaMonto: number[];
  hipotecaActos: number[];
  hipotecaMonto: number[];
  fideicomisoActos: (number | null)[];
};

export const SOURCE = DATA.source;
export const SOURCE_URL = DATA.sourceUrl;
export const PDF_URL = DATA.pdfUrl;
export const SOURCE_NOTE = DATA.sourceNote;

/** Every month in the file, oldest first, as `YYYY-MM`. */
export const PERIODS: readonly string[] = DATA.periods;

export const LAST_PERIOD = PERIODS[PERIODS.length - 1];
export const FIRST_PERIOD = PERIODS[0];

/** Months still being revised as late filings land. */
export const PROVISIONAL: ReadonlySet<string> = new Set(DATA.provisional);

/** Months the source itself flags, with its own reason. Exactly one so far:
 * December 2007, a strike at the Registro de la Propiedad, which is why that
 * month reads 5.180 against roughly 12.000 either side. It is real data and it
 * is not comparable — no "worst month" claim may quote it unannotated. */
export const FLAGGED: ReadonlyMap<string, string> = new Map(
  DATA.flagged.map((f) => [f.period, f.note]),
);

/** Below this many deeds in a month, a ratio built on that month is noise
 * rather than a figure. It exists for April 2020 and its 1 deed; nothing else
 * in twenty-one years comes near it. */
export const MIN_ACTS_FOR_RATIO = 500;

const ordinal = (period: string): number =>
  Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7)) - 1;

/**
 * Fails the build on a gap, a repeat, an out-of-order month, or a series that
 * doesn't span the axis.
 *
 * The same guard the other modules carry, and it earns its keep here more than
 * anywhere: every reader below treats an index as a date. `rolling12` sums the
 * twelve slots before a position and `yoy` reaches back exactly twelve, so a
 * single missing month would not throw downstream — it would quietly compare
 * March against February and render the answer as a year-on-year change.
 */
function assertShape(): void {
  if (PERIODS.length < 24) {
    throw new Error(
      `escrituras-pba.json: ${PERIODS.length} months is too short a series to roll or compare`,
    );
  }
  for (let i = 1; i < PERIODS.length; i++) {
    if (ordinal(PERIODS[i]) !== ordinal(PERIODS[i - 1]) + 1) {
      throw new Error(
        `escrituras-pba.json: expected consecutive months, got ${PERIODS[i - 1]} → ${PERIODS[i]}`,
      );
    }
  }
  for (const [name, series] of [
    ["compraventaActos", DATA.compraventaActos],
    ["compraventaMonto", DATA.compraventaMonto],
    ["hipotecaActos", DATA.hipotecaActos],
    ["hipotecaMonto", DATA.hipotecaMonto],
  ] as const) {
    if (series.length !== PERIODS.length) {
      throw new Error(
        `escrituras-pba.json: "${name}" has ${series.length} values, expected ${PERIODS.length}`,
      );
    }
    if (series.some((v) => typeof v !== "number" || v < 0)) {
      throw new Error(`escrituras-pba.json: "${name}" has a missing or negative value`);
    }
  }
}
assertShape();

const AT = new Map(PERIODS.map((p, i) => [p, i]));

const indexOf = (period: string): number => {
  const at = AT.get(period);
  if (at === undefined) {
    throw new Error(`escrituras-pba: ${period} is not in the series`);
  }
  return at;
};

// ── The series ────────────────────────────────────────────────────────────

/** Compraventas signed in a month. Defaults to the latest. */
export const compraventas = (period: string = LAST_PERIOD): number =>
  DATA.compraventaActos[indexOf(period)];

/** Hipotecas signed in a month — the two pre-2012 amount brackets summed. */
export const hipotecas = (period: string = LAST_PERIOD): number =>
  DATA.hipotecaActos[indexOf(period)];

/** The declared value of the month's compraventas, in pesos corrientes. */
export const monto = (period: string = LAST_PERIOD): number =>
  DATA.compraventaMonto[indexOf(period)];

/** The average declared value of one deed, in pesos of that month. Arithmetic
 * fine, economically an average over everything from a Tigre house to a rural
 * plot — never present it as "what a property costs". */
export const promedioArs = (period: string = LAST_PERIOD): number =>
  monto(period) / compraventas(period);

/** "2026-06" → "2026Q2". */
const quarterOf = (period: string): string =>
  `${period.slice(0, 4)}Q${Math.floor((Number(period.slice(5, 7)) - 1) / 3) + 1}`;

/**
 * The same average, in dollars — `null` before the FX series starts in 2017.
 *
 * Converted at the quarterly average of the rate `dolar.ts` designates, which
 * is the blue: property in Argentina changes hands in physical dollars, and the
 * official rate ran at half the blue through the years of the cepo. A quarterly
 * divisor against a monthly series is a coarser conversion than it looks, and
 * the figure that prints this says so.
 */
export function promedioUsd(period: string = LAST_PERIOD): number | null {
  const fx = dolarRate(quarterOf(period));
  return fx === null ? null : promedioArs(period) / fx;
}

/** The FX rate id every dollar figure here is divided by, for the fine print. */
export const USD_RATE = DOLAR_RATE;

/** The first month that can be expressed in dollars at all. */
export const USD_FROM =
  PERIODS.find((p) => dolarRate(quarterOf(p)) !== null) ?? null;

// ── Reading the series without being fooled by December ───────────────────

/**
 * The twelve months ending at `period`, summed — the series with its
 * seasonality divided out. This is the honest headline number: it moves when
 * the market moves and it does not move because it is December.
 *
 * `null` for the first eleven months, which have no twelve behind them.
 */
export function rolling12(
  period: string = LAST_PERIOD,
  which: "compraventas" | "hipotecas" = "compraventas",
): number | null {
  const at = indexOf(period);
  if (at < 11) return null;
  const series =
    which === "compraventas" ? DATA.compraventaActos : DATA.hipotecaActos;
  let sum = 0;
  for (let i = at - 11; i <= at; i++) sum += series[i];
  return sum;
}

/** A month against the same month a year earlier, as a fraction. `null` for
 * the first twelve months. */
export function yoy(
  period: string = LAST_PERIOD,
  which: "compraventas" | "hipotecas" = "compraventas",
): number | null {
  const at = indexOf(period);
  if (at < 12) return null;
  const series =
    which === "compraventas" ? DATA.compraventaActos : DATA.hipotecaActos;
  const before = series[at - 12];
  if (before === 0) return null;
  return series[at] / before - 1;
}

/**
 * The share of the month's compraventas that came with a mortgage, as a
 * fraction. `null` on a month too small to divide by — see
 * `MIN_ACTS_FOR_RATIO`.
 *
 * A hipoteca is a separate act from the compraventa it funds, so this is a
 * ratio of two counts and not a subset: it can in principle exceed 1, and in
 * April 2020 it does, on three mortgages over one sale. Read as a proxy for
 * how much of the market is running on credit, which is what it is good for.
 */
export function hipotecaShare(period: string = LAST_PERIOD): number | null {
  const cv = compraventas(period);
  return cv < MIN_ACTS_FOR_RATIO ? null : hipotecas(period) / cv;
}

/** The same ratio on twelve-month sums, which is how it should be read: it
 * survives April 2020, and credit does not have a season. */
export function hipotecaShare12(period: string = LAST_PERIOD): number | null {
  const cv = rolling12(period, "compraventas");
  const hp = rolling12(period, "hipotecas");
  return cv === null || hp === null || cv === 0 ? null : hp / cv;
}

// ── Years ─────────────────────────────────────────────────────────────────

export type Year = {
  year: number;
  compraventas: number;
  hipotecas: number;
  monto: number;
  /** Fraction of deeds with a mortgage. */
  share: number;
  /** False for the year in progress — every chart has to be able to leave it
   * out of a "highest year ever" claim. */
  complete: boolean;
  months: number;
};

const YEAR_ROWS: Year[] = (() => {
  const byYear = new Map<number, number[]>();
  PERIODS.forEach((p, i) => {
    const y = Number(p.slice(0, 4));
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(i);
  });
  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, idx]) => {
      const cv = idx.reduce((s, i) => s + DATA.compraventaActos[i], 0);
      const hp = idx.reduce((s, i) => s + DATA.hipotecaActos[i], 0);
      return {
        year,
        compraventas: cv,
        hipotecas: hp,
        monto: idx.reduce((s, i) => s + DATA.compraventaMonto[i], 0),
        share: cv === 0 ? 0 : hp / cv,
        complete: idx.length === 12,
        months: idx.length,
      };
    });
})();

export const YEARS: readonly Year[] = YEAR_ROWS;

/** Complete calendar years only — the set anything comparative may rank. */
export const FULL_YEARS: readonly Year[] = YEAR_ROWS.filter((y) => y.complete);

export const year = (which: number): Year | undefined =>
  YEAR_ROWS.find((y) => y.year === which);

/** The last complete calendar year. */
export const LAST_FULL_YEAR = FULL_YEARS[FULL_YEARS.length - 1];

/** The best and worst complete years on deed count. */
export const YEAR_EXTREMES = {
  high: FULL_YEARS.reduce((a, y) => (y.compraventas > a.compraventas ? y : a)),
  low: FULL_YEARS.reduce((a, y) => (y.compraventas < a.compraventas ? y : a)),
};

// ── The seasonal shape ────────────────────────────────────────────────────

/** How many complete years the seasonal profile averages over. Ten is enough
 * to be a shape rather than a year, and recent enough that it describes the
 * market as it is now. 2020 is left out of it by `seasonality()`. */
export const SEASON_YEARS = 10;

export type SeasonRow = {
  month: number;
  label: string;
  /** Average share of the year's deeds that fell in this month, as a fraction
   * of 1. A year with no season would put 1/12 — 8,33 % — in every slot. */
  share: number;
};

/**
 * The average calendar shape of a year, over the last `SEASON_YEARS` complete
 * ones, with 2020 excluded.
 *
 * 2020 is not a seasonal year in any sense — the province signed one deed in
 * April and 12.560 in December — so leaving it in would not make the profile
 * more robust, it would put a lockdown in the middle of a chart about
 * Christmas.
 */
export function seasonality(): SeasonRow[] {
  const usable = FULL_YEARS.filter((y) => y.year !== 2020).slice(-SEASON_YEARS);
  return Array.from({ length: 12 }, (_, m) => {
    const shares = usable.map((y) => {
      const at = indexOf(`${y.year}-${String(m + 1).padStart(2, "0")}`);
      return DATA.compraventaActos[at] / y.compraventas;
    });
    return {
      month: m + 1,
      label: MONTH_NAMES[m],
      share: shares.reduce((s, v) => s + v, 0) / shares.length,
    };
  });
}

/** The years the seasonal profile is averaged over, for the figure's note. */
export function seasonalitySpan(): { from: number; to: number; n: number } {
  const usable = FULL_YEARS.filter((y) => y.year !== 2020).slice(-SEASON_YEARS);
  return {
    from: usable[0].year,
    to: usable[usable.length - 1].year,
    n: usable.length,
  };
}

// ── Extremes, for the stat lines ──────────────────────────────────────────

export type Point = { period: string; value: number };

/** The high, the low and the last of a monthly series. `flagged` months are
 * excluded from the low: December 2007 is a strike, not a market. */
export function extremes(
  which: "compraventas" | "hipotecas" | "rolling12",
): { high: Point; low: Point; last: Point } {
  const points: Point[] = PERIODS.map((period) => ({
    period,
    value:
      which === "rolling12"
        ? (rolling12(period) ?? NaN)
        : which === "hipotecas"
          ? hipotecas(period)
          : compraventas(period),
  })).filter((p) => Number.isFinite(p.value) && !FLAGGED.has(p.period));
  return {
    high: points.reduce((a, p) => (p.value > a.value ? p : a)),
    low: points.reduce((a, p) => (p.value < a.value ? p : a)),
    last: points[points.length - 1],
  };
}

// ── Labels and formatting ─────────────────────────────────────────────────

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** "2026-06" → "junio de 2026". */
export const periodLabel = (period: string): string =>
  `${MONTH_NAMES[Number(period.slice(5, 7)) - 1]} de ${period.slice(0, 4)}`;

/** "2026-06" → "junio", for an axis that already carries the year. */
export const monthLabel = (period: string): string =>
  MONTH_NAMES[Number(period.slice(5, 7)) - 1];

export const LAST_UPDATED = periodLabel(LAST_PERIOD);
export const SPAN = `${FIRST_PERIOD.slice(0, 4)}–${LAST_PERIOD.slice(0, 4)}`;

const NUMBER = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const ONE_DP = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export const formatCount = (value: number): string =>
  NUMBER.format(Math.round(value));

export const formatUsd = (value: number): string =>
  `US$ ${NUMBER.format(Math.round(value))}`;

/** Pesos, abbreviated past a million: a monthly total runs to thirteen digits
 * and nobody reads those. */
export function formatArs(value: number): string {
  if (Math.abs(value) >= 1_000_000_000_000) {
    return `$ ${ONE_DP.format(value / 1_000_000_000_000)} billones`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `$ ${NUMBER.format(Math.round(value / 1_000_000))} millones`;
  }
  return `$ ${NUMBER.format(Math.round(value))}`;
}

/**
 * "una sola escritura" / "407 escrituras".
 *
 * Exists for one month in twenty-one years. April 2020 has a count of 1, and
 * every sentence on the page that names it would otherwise read "se firmó 1
 * escritura" — grammatical, and unmistakably a number that a template dropped
 * in. Wording it here keeps the figure derived from the data rather than typed
 * into the prose, which is the rule the rest of this module follows.
 */
export const escriturasPhrase = (value: number): string =>
  value === 1 ? "una sola escritura" : `${formatCount(value)} escrituras`;

/** A signed change, for a year-on-year. Takes a fraction. */
export const formatPct = (fraction: number): string =>
  `${fraction > 0 ? "+" : ""}${ONE_DP.format(fraction * 100)} %`;

/** An unsigned share. Takes a fraction. */
export const formatShare = (fraction: number): string =>
  `${ONE_DP.format(fraction * 100)} %`;

import type { VendorColorName } from "@/lib/vendorColors";
import raw from "./ipc-vivienda.json";

// INDEC's IPC for division 04 — "Vivienda, agua, electricidad, gas y otros
// combustibles" — as monthly percentage change, for the six statistical regions
// and the national total. This is the dataset behind /estadisticas/inflacion.
//
// Editorial/reference data, like `content/guias/data/inflacion.ts`: it never
// touches a user's bills, and it's baked into the static build alongside the
// prose that explains it. The difference between the two modules is the shape —
// the guides carry a rebased *index* for GBA only, because their charts compare
// services against each other; this one carries the *variation* INDEC publishes,
// for every region, because these pages compare regions against each other.
//
// ── Refreshing ─────────────────────────────────────────────────────────────
// INDEC publishes the IPC around the 13th of the following month, at
// https://www.indec.gob.ar/ (Índice de precios al consumidor → "Cuadros y
// gráficos", cuadro of variación mensual por región y división). To extend the
// series, append one object to `points` in `ipc-vivienda.json`:
//
//   { "period": "202607", "nacional": 0.0, "gba": 0.0, … }
//
// Periods are `YYYYMM`, values are percentages with one decimal, all seven
// regions required. Months must be consecutive — `assertConsecutive` below
// fails the build if a period is skipped, duplicated or out of order, which is
// the mistake this format invites.
//
// Nothing else needs editing: every figure on the page (the last month, the
// interannual rates, the chart footnotes) is derived from this array.

export type RegionId = (typeof REGIONS)[number]["id"];

type Region = {
  /** Stable id — the JSON key, and the `region` prop a chart takes. */
  id: string;
  /** Short label, as it appears in a chart's title. */
  label: string;
  /** The region named inside a sentence, with its article: "en {inTitle}".
   * Spanish needs this per-region ("en Argentina" but "en la Patagonia"), and a
   * title built by concatenation is the one place a missing article shows. */
  inTitle: string;
  /** Which districts INDEC puts in the region — the methodology table. */
  covers: string;
  /** Line colour in the cross-region chart, as a name from the site's vendor
   * palette (`lib/vendorColors.ts`). Six lines is more than that warm palette
   * separates comfortably, so these are picked for maximum distance from each
   * other — and the chart backs them with a legend you can click to isolate a
   * region, which is what makes the figure readable without relying on colour
   * alone. */
  color: VendorColorName;
};

/** The seven series in the dataset: the national total first, then INDEC's six
 * regions in the order the institute lists them. */
export const REGIONS = [
  {
    id: "nacional",
    label: "Argentina",
    inTitle: "Argentina",
    covers:
      "Todo el país. Es el promedio ponderado de las seis regiones, con la ponderación de cada una en el gasto de los hogares.",
    color: "rust",
  },
  {
    id: "gba",
    label: "GBA",
    inTitle: "GBA",
    covers:
      "Ciudad Autónoma de Buenos Aires y los 24 partidos del Gran Buenos Aires.",
    color: "burnt-orange",
  },
  {
    id: "pampeana",
    label: "Pampeana",
    inTitle: "la región Pampeana",
    covers:
      "Resto de la provincia de Buenos Aires, Córdoba, Entre Ríos, La Pampa y Santa Fe.",
    color: "slate-teal",
  },
  {
    id: "noreste",
    label: "Noreste",
    inTitle: "el Noreste argentino",
    covers: "Corrientes, Chaco, Formosa y Misiones.",
    color: "amber",
  },
  {
    id: "noroeste",
    label: "Noroeste",
    inTitle: "el Noroeste argentino",
    covers:
      "Catamarca, Jujuy, La Rioja, Salta, Santiago del Estero y Tucumán.",
    color: "olive",
  },
  {
    id: "cuyo",
    label: "Cuyo",
    inTitle: "Cuyo",
    covers: "Mendoza, San Juan y San Luis.",
    color: "clay",
  },
  {
    id: "patagonia",
    label: "Patagonia",
    inTitle: "la Patagonia",
    covers: "Chubut, Neuquén, Río Negro, Santa Cruz y Tierra del Fuego.",
    color: "dark-earth",
  },
] as const satisfies readonly Region[];

export const REGION_IDS: readonly RegionId[] = REGIONS.map((r) => r.id);

export function isRegionId(value: string): value is RegionId {
  return (REGION_IDS as readonly string[]).includes(value);
}

export function getRegion(id: RegionId): (typeof REGIONS)[number] {
  // `id` is already narrowed to an existing region, so this can't miss.
  return REGIONS.find((r) => r.id === id) as (typeof REGIONS)[number];
}

type Point = { period: string } & Record<RegionId, number>;

const POINTS = raw.points as Point[];

/** Every period in the dataset, oldest first, as `YYYYMM`. */
export const PERIODS: readonly string[] = POINTS.map((p) => p.period);

/** Months since year 0 — the only thing period arithmetic needs. */
const ordinal = (period: string): number =>
  Number(period.slice(0, 4)) * 12 + Number(period.slice(4, 6)) - 1;

/** Fails the build on a gap, a repeat or an out-of-order month. Everything
 * downstream reads position `i - 12` as "the same month a year earlier", which
 * silently becomes a lie the moment one month is missing — and a lie that looks
 * like data rather than like a bug. Cheap to check once at import. */
function assertConsecutive(): void {
  for (let i = 1; i < PERIODS.length; i++) {
    if (ordinal(PERIODS[i]) !== ordinal(PERIODS[i - 1]) + 1) {
      throw new Error(
        `ipc-vivienda.json: expected consecutive months, got ${PERIODS[i - 1]} → ${PERIODS[i]}`,
      );
    }
  }
}
assertConsecutive();

/** Last month with published data. */
export const LAST_PERIOD = PERIODS[PERIODS.length - 1];

export const SOURCE = raw.source;
export const SOURCE_URL = raw.sourceUrl;

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

/** "202606" → "junio de 2026". */
export function periodLabel(period: string): string {
  return `${MONTH_NAMES[Number(period.slice(4, 6)) - 1]} de ${period.slice(0, 4)}`;
}

/** "202606" → "jun 26", for axis ticks. */
export function periodTick(period: string): string {
  return `${MONTH_NAMES[Number(period.slice(4, 6)) - 1].slice(0, 3)} ${period.slice(2, 4)}`;
}

/** The last month present in every series, spelled out — chart footnotes. */
export const LAST_UPDATED = periodLabel(LAST_PERIOD);

/** The span the dataset covers, as the ISO 8601 interval schema.org's
 * `temporalCoverage` wants: "2020-01/2026-06". Derived rather than written into
 * the page's meta block, so the markup can't claim a coverage the data doesn't
 * have after a refresh. */
export const TEMPORAL_COVERAGE = `${PERIODS[0].slice(0, 4)}-${PERIODS[0].slice(4, 6)}/${LAST_PERIOD.slice(0, 4)}-${LAST_PERIOD.slice(4, 6)}`;

/** Monthly variation, in percent, oldest first. INDEC's own numbers, untouched
 * (this is what the source publishes; everything else here is derived). */
export function monthly(region: RegionId): number[] {
  return POINTS.map((p) => p[region]);
}

/** Every calendar year with at least one published month, oldest first — the
 * options in a monthly chart's year picker. */
export const YEARS: readonly number[] = [
  ...new Set(PERIODS.map((p) => Number(p.slice(0, 4)))),
];

/** The most recent year with data. Where a monthly chart opens: the reader who
 * arrives from a search for "cuánto aumentó el gas" wants this year, not 2020. */
export const LAST_YEAR = YEARS[YEARS.length - 1];

/** Short month names, for chart axes and tooltips. */
const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));

/** One region's monthly variation across a single calendar year. The current
 * year comes back short — a chart with three published months should draw three
 * bars, not nine empty slots pretending the data exists. */
export function monthlyYear(
  region: RegionId,
  year: number,
): { period: string; label: string; value: number }[] {
  return POINTS.filter((p) => p.period.startsWith(String(year))).map((p) => ({
    period: p.period,
    label: MONTH_SHORT[Number(p.period.slice(4, 6)) - 1],
    value: p[region],
  }));
}

/** The range every region's monthly variation spans in `year`.
 *
 * Per year, but across all seven regions — which is the axis the monthly charts
 * share. The reasoning is in the chart component: within a year the useful
 * comparison is region against region, and that only works if they're all drawn
 * on one scale. Zero is always inside the range, since it's the line the columns
 * hang from. */
export function monthlyRange(year: number): { min: number; max: number } {
  const values = REGION_IDS.flatMap((r) =>
    monthlyYear(r, year).map((p) => p.value),
  );
  return { min: Math.min(0, ...values), max: Math.max(0, ...values) };
}

/** The price level implied by the monthly variations, with the first month of
 * the series = 100. Not published as such — it's the running product of the
 * variations, and it exists so the interannual rate below can be a division
 * instead of a twelve-term compounding written out at every call site. */
function level(region: RegionId): number[] {
  const out = [100];
  for (const v of monthly(region).slice(1)) {
    out.push(out[out.length - 1] * (1 + v / 100));
  }
  return out;
}

/** Interannual variation: each month against the same month a year earlier, in
 * percent. The first twelve months of the dataset have no year-earlier month to
 * compare against, so the series starts a year in — hence the periods come back
 * with the values rather than being assumed to be `PERIODS`.
 *
 * Compounded from the published monthly figures, which are rounded to one
 * decimal, so these can sit a few tenths off the interannual rate INDEC prints
 * for the same month. The shape of the curve is unaffected; the methodology
 * section on the page says so. */
export function interanual(region: RegionId): {
  periods: string[];
  values: number[];
} {
  const idx = level(region);
  const periods: string[] = [];
  const values: number[] = [];
  for (let i = 12; i < idx.length; i++) {
    periods.push(PERIODS[i]);
    values.push((idx[i] / idx[i - 12] - 1) * 100);
  }
  return { periods, values };
}

/** INDEC's six statistical regions, without the national total.
 *
 * The comparison chart draws these and not `nacional`, on purpose: the national
 * figure is the weighted average *of* these six, so plotting it alongside them
 * adds a seventh line that is by construction somewhere in the middle of the
 * other six. It says nothing a reader can act on and costs the one thing a
 * six-line chart cannot spare, which is room to tell the lines apart. */
export const COMPARABLE_REGIONS = REGIONS.filter((r) => r.id !== "nacional");

/** How many times the price level multiplied across the whole dataset — the
 * "×40,6" a reader can hold in their head, and the only cross-region comparison
 * that covers the full span from the first month.
 *
 * It exists because the accumulated index can't be *drawn* over this span: six
 * years of Argentine inflation take the level from 100 to about 5.000, so on a
 * linear axis the first four years lie flat along the bottom and the regions are
 * indistinguishable exactly where a reader would look to tell them apart. One
 * number per region, ranked, answers the same question and can be read at a
 * glance. */
export function multiple(region: RegionId): number {
  const idx = level(region);
  return idx[idx.length - 1] / idx[0];
}

/** The first month of the dataset, spelled out — what `multiple` is measured
 * from, and so what the ranking has to say it is measured from. */
export const FIRST_UPDATED = periodLabel(PERIODS[0]);

/** Both published measures for one region, keyed by period: the monthly
 * variation INDEC prints, and the interannual rate derived from it.
 *
 * Keyed rather than positional because the two series don't line up — the
 * interannual one starts a year into the dataset — and the charts need to put
 * them side by side for whichever month the reader is pointing at. A period
 * missing from `interanual` is one with no year-earlier month to compare
 * against, not a gap in the data. */
export function byPeriod(region: RegionId): {
  mensual: Map<string, number>;
  interanual: Map<string, number>;
} {
  const values = monthly(region);
  const ia = interanual(region);
  return {
    mensual: new Map(PERIODS.map((p, i) => [p, values[i]])),
    interanual: new Map(ia.periods.map((p, i) => [p, ia.values[i]])),
  };
}

/** Interannual rate for the most recent month — the figure the prose quotes. */
export function lastInteranual(region: RegionId): number {
  const { values } = interanual(region);
  return values[values.length - 1];
}

/** Monthly variation for the most recent month. */
export function lastMonthly(region: RegionId): number {
  const values = monthly(region);
  return values[values.length - 1];
}

/** A percentage the way Argentina writes it: comma decimal, explicit sign for
 * negatives only, one decimal place. */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals).replace(".", ",")} %`;
}

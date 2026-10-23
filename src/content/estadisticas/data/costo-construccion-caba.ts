import raw from "./costo-construccion-caba.json";
import { PERIODS as FX_PERIODS, rate, RATE } from "./dolar";
import {
  BARRIOS,
  COMUNA_IDS,
  comunaCovers,
  comunaLabel,
  type ZonaId,
  ZONAS,
  barriosOfZona,
  zonaCovers,
} from "@/content/shared/caba";
import ventaRaw from "./venta-caba.json";

// IDECBA's cost of building one square metre in CABA, monthly since 2015, plus
// the index it moves with. This is the dataset behind
// /estadisticas/precio-m2-construccion-caba.
//
// ── What this number is, and why the page keeps saying so ─────────────────
// It is the **direct** cost of construction: materials, labour and general
// expenses. IDECBA's methodology explicitly excludes land, rights and permits,
// VAT, financing and the builder's utility. It is not a full project budget;
// figures here should not be described as one.
//
// All four published models are *multivivienda* — apartment buildings. There is
// no single-family model in this table, so nothing here answers "what does it
// cost to build a house"; the refresh script fails the build if IDECBA ever adds
// one, rather than letting the page quietly start covering something it doesn't
// describe.
//
// ── Refreshing ─────────────────────────────────────────────────────────────
// Don't hand-edit costo-construccion-caba.json. Run
//
//   bun run data:construccion
//
// and commit the diff. IDECBA publishes about six weeks after a month closes.
// The build-vs-buy map also joins `venta-caba.json` and `dolar.json`, so refresh
// this in the same pass as `bun run data:caba` and `bun run data:dolar` — the
// map can only reach as far as the *earliest*-ending of the three.

const DATA = raw as unknown as {
  periods: string[];
  provisional: string[];
  iccBase: string;
  source: string;
  sourceUrl: string;
  sourceNote: string;
  costo: Record<string, number[]>;
  icc: Record<string, number[]>;
};

/** Every month in the dataset, oldest first, as `YYYY-MM`. */
export const PERIODS: readonly string[] = DATA.periods;

export const SOURCE = DATA.source;
export const SOURCE_URL = DATA.sourceUrl;
export const SOURCE_NOTE = DATA.sourceNote;
export const ICC_BASE = DATA.iccBase;

const ordinal = (period: string): number =>
  Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7)) - 1;

/** The four models IDECBA prices, and the city figure that summarises them.
 *
 * Labels are ours; the descriptions are compressed from the source's own
 * footnote (kept verbatim in the JSON as `modelsNote`). `total` first because it
 * is the answer to the question the page is named after; the other values show
 * the costs of the four distinct model programs.
 */
export const MODELS = [
  {
    id: "total",
    label: "Total Ciudad",
    short: "Total",
    description:
      "El costo por metro cuadrado que IDECBA publica para el total de la Ciudad.",
  },
  {
    id: "tipo1",
    label: "Tipo I · multivivienda sencilla",
    short: "Tipo I",
    description:
      "Subsuelo, planta baja con estacionamiento descubierto, trece pisos y azotea. Un ascensor.",
  },
  {
    id: "tipo2",
    label: "Tipo II · multivivienda sencilla con local",
    short: "Tipo II",
    description:
      "Subsuelo, planta baja con estacionamiento descubierto y local comercial, doce pisos y azotea. Un ascensor.",
  },
  {
    id: "tipo3",
    label: "Tipo III · multivivienda confortable",
    short: "Tipo III",
    description:
      "Planta baja con estacionamiento descubierto, nueve pisos, azotea y salón de usos múltiples. Un ascensor.",
  },
  {
    id: "tipo4",
    label: "Tipo IV · multivivienda suntuosa",
    short: "Tipo IV",
    description:
      "Dos subsuelos con estacionamiento cubierto, planta baja con salón de usos múltiples y gimnasio, doce pisos y azotea. Dos ascensores.",
  },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

/** The model the page opens on. The city total: it is what "el metro cuadrado
 * de construcción" means to someone who hasn't yet been told there are four. */
export const DEFAULT_MODEL: ModelId = "total";

/** The three chapters the index splits into, in the order the figure draws them.
 * `nivel` is the whole index and the other three are what it is made of. */
export const CHAPTERS = [
  { id: "nivel", label: "Nivel general" },
  { id: "materiales", label: "Materiales" },
  { id: "manoObra", label: "Mano de obra" },
  { id: "gastosGenerales", label: "Gastos generales" },
] as const;

export type ChapterId = (typeof CHAPTERS)[number]["id"];

/** Fails the build on a gap, a repeat or an out-of-order month, and on a series
 * that doesn't span the axis — the same guard the other data modules carry, for
 * the same reason: every reader here treats position as time, so one missing
 * month turns "a year earlier" into a lie shaped like data. */
function assertShape(): void {
  for (let i = 1; i < PERIODS.length; i++) {
    if (ordinal(PERIODS[i]) !== ordinal(PERIODS[i - 1]) + 1) {
      throw new Error(
        `costo-construccion-caba.json: expected consecutive months, got ${PERIODS[i - 1]} → ${PERIODS[i]}`,
      );
    }
  }
  const expect = (
    where: string,
    ids: readonly string[],
    got: Record<string, number[]>,
  ) => {
    for (const id of ids) {
      if (got[id]?.length !== PERIODS.length) {
        throw new Error(
          `costo-construccion-caba.json: ${where} "${id}" has ${got[id]?.length} values, expected ${PERIODS.length}`,
        );
      }
    }
  };
  expect(
    "model",
    MODELS.map((m) => m.id),
    DATA.costo,
  );
  expect(
    "chapter",
    CHAPTERS.map((c) => c.id),
    DATA.icc,
  );
}
assertShape();

/** The most recent month with data. */
export const LAST_PERIOD = PERIODS[PERIODS.length - 1];

/**
 * Whether the newest figure still carries IDECBA's provisional asterisk.
 *
 * Only the newest, deliberately. Some older rows still carry asterisks from
 * their publication history, and the most recent workbook can mark more than
 * one month provisional. The page surfaces the marker only on its newest month.
 */
export const IS_PROVISIONAL = new Set(DATA.provisional).has(LAST_PERIOD);

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

export const LAST_UPDATED = periodLabel(LAST_PERIOD);

/** The span the dataset covers, as the ISO 8601 interval schema.org's
 * `temporalCoverage` wants — derived, so the structured data can't claim a
 * coverage the file no longer has. `YYYY-MM` already is that format. */
export const TEMPORAL_COVERAGE = `${PERIODS[0]}/${LAST_PERIOD}`;

const at = (period: string): number => {
  const i = PERIODS.indexOf(period);
  if (i < 0) throw new Error(`costo-construccion-caba: no month ${period}`);
  return i;
};

/** Pesos per square metre for one model in one month. */
export const costo = (model: ModelId, period = LAST_PERIOD): number =>
  DATA.costo[model][at(period)];

/** One index chapter in one month. */
export const icc = (chapter: ChapterId, period = LAST_PERIOD): number =>
  DATA.icc[chapter][at(period)];

/** The month twelve before `period`, or `null` where the series doesn't reach
 * back that far. */
const yearBefore = (period: string): string | null => {
  const i = at(period) - 12;
  return i < 0 ? null : PERIODS[i];
};

/** Year-on-year change, in per cent, or `null` in the first twelve months. */
export function yoy(model: ModelId, period = LAST_PERIOD): number | null {
  const before = yearBefore(period);
  if (!before) return null;
  return (costo(model, period) / costo(model, before) - 1) * 100;
}

/** Year-on-year change of one index chapter. The figure that answers "materials
 * or labour?", which the levels alone don't: the three chapters sit at different
 * points of the same base, so only their *rates* are comparable. */
export function iccYoy(
  chapter: ChapterId,
  period = LAST_PERIOD,
): number | null {
  const before = yearBefore(period);
  if (!before) return null;
  return (icc(chapter, period) / icc(chapter, before) - 1) * 100;
}

/** Every month of one model, for a chart. */
export const series = (model: ModelId): { period: string; value: number }[] =>
  PERIODS.map((period, i) => ({ period, value: DATA.costo[model][i] }));

/**
 * One chapter as a percentage of the general index. Because the component and
 * general series share a base, 100 means equal accumulated change since base;
 * above or below 100 means the chapter's accumulated change was larger/smaller.
 */
export const chapterRelative = (
  chapter: ChapterId,
  period = LAST_PERIOD,
): number => (icc(chapter, period) / icc("nivel", period)) * 100;

/** Every month of the three sub-chapters, relative to the index. `nivel` is not
 * among them: divided by itself it is the flat 100 the chart already draws as a
 * reference line. */
export const capitulosSeries = (): {
  period: string;
  materiales: number;
  manoObra: number;
  gastosGenerales: number;
}[] =>
  PERIODS.map((period) => ({
    period,
    materiales: chapterRelative("materiales", period),
    manoObra: chapterRelative("manoObra", period),
    gastosGenerales: chapterRelative("gastosGenerales", period),
  }));

// ── The same metre, in dollars ─────────────────────────────────────────────
//
// The page shows both the published peso figures and a dollar conversion. The
// conversion is a second currency view, not a real-cost measure: no price index
// is applied, and the exchange-rate series is quarterly.
//
// `dolar.json` is quarterly (see the note there for why a quarterly average is
// the right divisor for a quarterly average price). The cost series is monthly,
// so a month is converted at its own quarter's average rate. That is a coarser
// conversion than the monthly figure deserves and it is the honest one
// available: a finer rate would imply a precision the sale-price series this is
// compared against does not have.

/** `2026-09` → `2026Q3`. */
export const quarterOf = (period: string): string =>
  `${period.slice(0, 4)}Q${Math.ceil(Number(period.slice(5, 7)) / 3)}`;

// The rate this module divides by is `dolar.ts`'s own default, the blue — the
// reasoning is set out at length there, and the short of it is that CABA
// property is priced and paid in physical dollars, so the rate that belongs in
// the denominator is the one someone actually pays to get them. Imported rather
// than restated so the two pages can never quietly diverge on it.

/** Pesos per square metre, in dollars — `null` for months whose quarter is not
 * covered by the FX series. */
export function costoUsd(model: ModelId, period = LAST_PERIOD): number | null {
  const q = quarterOf(period);
  if (!FX_PERIODS.includes(q)) return null;
  const fx = rate(q, RATE);
  return fx === null ? null : costo(model, period) / fx;
}

/** Every month of one model in dollars, for the chart. `null`s are kept in place
 * rather than dropped so the axis stays a time axis. */
export const seriesUsd = (
  model: ModelId,
): { period: string; value: number | null }[] =>
  PERIODS.map((period) => ({ period, value: costoUsd(model, period) }));

/** The months of the dollar series that have a figure, for computing extremes
 * without repeating the null check. */
const usdPoints = (model: ModelId): { period: string; value: number }[] =>
  seriesUsd(model).filter(
    (p): p is { period: string; value: number } => p.value !== null,
  );

/** The lowest and highest values in the dollar-converted series, and the latest.
 * The low is a historical point; the high changes as newer observations arrive. */
export function usdExtremes(model: ModelId = DEFAULT_MODEL): {
  low: { period: string; value: number };
  high: { period: string; value: number };
  last: { period: string; value: number };
} | null {
  const points = usdPoints(model);
  if (points.length === 0) return null;
  return {
    low: points.reduce((a, b) => (b.value < a.value ? b : a)),
    high: points.reduce((a, b) => (b.value > a.value ? b : a)),
    last: points[points.length - 1],
  };
}

// ── Building against buying ────────────────────────────────────────────────
//
// The one cut of this dataset that is per-barrio, and it is a *derived* one: the
// cost of construction is a single figure for the whole city, so nothing here
// varies by barrio on its own. What varies is the sale price it is set against.
//
// For each barrio: the direct modeled cost as a percentage of its asking price
// per square metre. The numerator is held citywide; the denominator varies by
// barrio. This ratio between two different reference prices is not a cost
// allocation or an estimate of land value, fees, taxes, margin or profit.
//
// ── The caveat this join carries, and where it is stated ───────────────────
// Since this ratio is a fixed citywide cost divided by each barrio's asking
// price, its ordering is inverse to the price map on /estadisticas/precio-m2-caba:
// as asking price rises, cost is a smaller percentage of that price. This does
// not make used-apartment and new-building-model prices directly comparable.

const VENTA = ventaRaw as unknown as {
  periods: string[];
  ciudad: Record<string, (number | null)[]>;
  barrios: Record<string, Record<string, (number | null)[]>>;
  comunas: Record<string, Record<string, (number | null)[]>>;
};

/** The unit sizes the sale series publishes, mirrored from `venta-caba.ts` —
 * imported by id rather than re-exported so this module stays readable on its
 * own about which of them it can actually join. */
export const SIZES = [
  { id: "amb1", label: "1 ambiente", short: "1 amb." },
  { id: "amb2", label: "2 ambientes", short: "2 amb." },
  { id: "amb3", label: "3 ambientes", short: "3 amb." },
] as const;

export type SizeId = (typeof SIZES)[number]["id"];
export type Geo = "barrios" | "comunas";

/** 2 ambientes, for the same reason the price page opens there: the most
 * advertised segment, so the most barrios have a figure and each figure rests on
 * the most listings. */
export const DEFAULT_SIZE: SizeId = "amb2";

/**
 * The most recent quarter all three inputs cover.
 *
 * The three series are refreshed on different cadences — this one monthly,
 * the sale prices quarterly about two months late, the FX series once a quarter
 * has closed — so the join can only reach as far as the earliest of the three
 * ends. Computed rather than assumed: a refresh that moves one and not the
 * others should narrow the map, not silently pair a 2026Q2 price with a 2026Q1
 * cost.
 */
export const JOIN_PERIOD: string | null = (() => {
  const mine = new Set(PERIODS.map(quarterOf));
  const shared = VENTA.periods.filter(
    (q) => mine.has(q) && FX_PERIODS.includes(q) && rate(q, RATE) !== null,
  );
  return shared.length ? shared[shared.length - 1] : null;
})();

/** "2026Q2" → "2.º trimestre de 2026". */
export const quarterLabel = (q: string): string =>
  `${q.slice(5)}.º trimestre de ${q.slice(0, 4)}`;

/** The cost of building a square metre in one quarter, in dollars: the quarter's
 * months averaged, then converted at the quarter's average rate.
 *
 * Averaged in pesos first and converted once, rather than converted monthly and
 * averaged — the two differ, and this order is the one that matches what the
 * sale series it is compared against is: a quarterly average, in dollars. */
export function quarterCostUsd(
  q: string,
  model: ModelId = DEFAULT_MODEL,
): number | null {
  const inQuarter = PERIODS.filter((p) => quarterOf(p) === q);
  if (inQuarter.length === 0) return null;
  const fx = FX_PERIODS.includes(q) ? rate(q, RATE) : null;
  if (fx === null) return null;
  const mean =
    inQuarter.reduce((sum, p) => sum + costo(model, p), 0) / inQuarter.length;
  return mean / fx;
}

/** One region of the cost-to-offer-price comparison map. */
export type ShareRow = {
  id: string;
  label: string;
  /** Secondary line — the comuna a barrio sits in, or the barrios a comuna
   * groups. What lets a reader find themselves on the map. */
  meta: string;
  /** Modeled direct cost divided by the asking price, as a percentage. `null`
   * where IDECBA did not publish a barrio figure. */
  value: number | null;
  /** The barrio's asking price per m², in dollars — the figure the share is a
   * share *of*, so a reader can check the arithmetic. */
  venta: number | null;
  /** Asking price minus modeled cost, per m². A comparison difference only; it
   * does not identify a cost component or profit. */
  difference: number | null;
};

/** Every region of the map, in registry order, for one size and one quarter. */
export function shareRows(
  geo: Geo,
  size: SizeId,
  q: string | null = JOIN_PERIOD,
  model: ModelId = DEFAULT_MODEL,
): ShareRow[] {
  const cost = q === null ? null : quarterCostUsd(q, model);
  const i = q === null ? -1 : VENTA.periods.indexOf(q);

  const build = (
    id: string,
    label: string,
    meta: string,
    venta: number | null,
  ): ShareRow => {
    if (cost === null || venta === null || venta <= 0) {
      return { id, label, meta, value: null, venta, difference: null };
    }
    return {
      id,
      label,
      meta,
      value: (cost / venta) * 100,
      venta,
      difference: venta - cost,
    };
  };

  if (geo === "barrios") {
    return BARRIOS.map((b) =>
      build(
        b.id,
        b.label,
        comunaLabel(b.comuna),
        i < 0 ? null : VENTA.barrios[b.id][size][i],
      ),
    );
  }
  return COMUNA_IDS.map((c) =>
    build(
      String(c),
      comunaLabel(c),
      comunaCovers(c),
      i < 0 ? null : VENTA.comunas[String(c)][size][i],
    ),
  );
}

/** The citywide ratio using IDECBA's own city sale-price total, not a mean of
 * the barrios (it weights by how many units were advertised). */
export function ciudadShare(
  size: SizeId,
  q: string | null = JOIN_PERIOD,
  model: ModelId = DEFAULT_MODEL,
): { share: number; venta: number; cost: number; difference: number } | null {
  if (q === null) return null;
  const cost = quarterCostUsd(q, model);
  const i = VENTA.periods.indexOf(q);
  const venta = i < 0 ? null : VENTA.ciudad[size][i];
  if (cost === null || venta === null || venta <= 0) return null;
  return {
    share: (cost / venta) * 100,
    venta,
    cost,
    difference: venta - cost,
  };
}

/** How many regions of a map can be shaded, and which can't. The map's honesty
 * line, quoted in the note under the figure. */
export function shareCoverage(
  geo: Geo,
  size: SizeId,
  q: string | null = JOIN_PERIOD,
): { withData: number; total: number; missing: string[] } {
  const all = shareRows(geo, size, q);
  const missing = all.filter((r) => r.value === null);
  return {
    withData: all.length - missing.length,
    total: all.length,
    missing: missing.map((r) => r.label),
  };
}

/** Regions with a figure, highest ratio first — for a fixed cost, that means
 * lower asking prices relative to the citywide model cost.
 * `null`s are dropped rather than sorted to an end: "not published" has no rank. */
export const rankedShare = (
  geo: Geo,
  size: SizeId,
  q: string | null = JOIN_PERIOD,
): (ShareRow & { value: number })[] =>
  shareRows(geo, size, q)
    .filter((r): r is ShareRow & { value: number } => r.value !== null)
    .sort((a, b) => b.value - a.value);

/** The four zones, summarised by the median barrio of each — the same grouping
 * and the same statistic the sale-price page uses, so the two are readable
 * against one another. */
export type ZonaShareRow = {
  id: ZonaId;
  label: string;
  comunas: string;
  withData: number;
  total: number;
  median: number | null;
  medianDifference: number | null;
};

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function zonasShare(
  size: SizeId,
  q: string | null = JOIN_PERIOD,
): ZonaShareRow[] {
  const all = shareRows("barrios", size, q);
  return ZONAS.map((z) => {
    const ids = new Set(barriosOfZona(z.id).map((b) => b.id));
    const mine = all.filter((r) => ids.has(r.id));
    const withValue = mine.filter(
      (r): r is ShareRow & { value: number; difference: number } =>
        r.value !== null && r.difference !== null,
    );
    return {
      id: z.id,
      label: z.label,
      comunas: zonaCovers(z.id),
      withData: withValue.length,
      total: mine.length,
      median: median(withValue.map((r) => r.value)),
      medianDifference: median(withValue.map((r) => r.difference)),
    };
  }).sort((a, b) => (b.median ?? 0) - (a.median ?? 0));
}

// ── The colour scale ───────────────────────────────────────────────────────

/** Upper bounds of the six shading classes, in per cent of the asking price.
 *
 * Round tens rather than quantiles, and use one scale for all six views so the
 * displayed ratios remain comparable across unit sizes and geographies. The
 * scale is a display choice; it does not describe a budget or allocate any
 * component of a property's asking price. */
export const BREAKS = [25, 35, 45, 55, 65] as const;

// ── Formatting ─────────────────────────────────────────────────────────────

const NUMBER = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const ONE_DP = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Pesos per m². Whole pesos: the source's centavos on a seven-figure number are
 * an artefact of averaging. */
export const formatArs = (value: number): string =>
  `$ ${NUMBER.format(Math.round(value))}`;

export const formatUsd = (value: number): string =>
  `US$ ${NUMBER.format(Math.round(value))}`;

/** A signed percentage, for a year-on-year change. */
export const formatPct = (value: number): string =>
  `${value > 0 ? "+" : ""}${ONE_DP.format(value)} %`;

/** An unsigned percentage, for a share. */
export const formatShare = (value: number): string =>
  `${NUMBER.format(Math.round(value))} %`;

export const NO_DATA = "Sin dato";

export const displayShare = (value: number | null): string | null =>
  value === null ? null : formatShare(value);

/** The legend, lowest class first. */
export const LEGEND: { label: string }[] = [
  { label: `menos de ${BREAKS[0]} %` },
  ...BREAKS.slice(1).map((b, i) => ({ label: `${BREAKS[i]} – ${b} %` })),
  { label: `${BREAKS[BREAKS.length - 1]} % o más` },
];

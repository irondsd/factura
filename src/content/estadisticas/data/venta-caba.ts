import {
  BARRIOS,
  COMUNA_IDS,
  comunaCovers,
  comunaLabel,
} from "./caba";
import raw from "./venta-caba.json";

// IDECBA's asking price per square metre for used apartments in CABA, in US
// dollars, quarterly, by barrio and by comuna. This is the dataset behind
// /estadisticas/precio-m2-caba.
//
// Editorial/reference data like `ipc-vivienda.ts`: it never touches a user's
// bills and it is baked into the static build beside the prose that explains
// it. Two things differ from that module, both because of the shape of this
// source rather than taste:
//
//   • the series are stored *series-major* (one array per barrio per size)
//     rather than one object per period. There are 189 series here against
//     seven there, and period-major rows would be 189 keys wide;
//   • a value can be `null`. IDECBA withholds a figure where too few units were
//     advertised to publish an average, which happens for the smallest barrios
//     in every quarter. `null` means "not published", never "zero" — and a
//     *missing* barrio key means the refresh dropped one, which is a bug. The
//     assertions below tell those two apart.
//
// ── Refreshing ─────────────────────────────────────────────────────────────
// Don't hand-edit venta-caba.json. Run
//
//   bun run data:caba
//
// which re-reads IDECBA's six spreadsheets, and commit the diff. The script
// prints how much of the map each size can colour, which is the thing worth
// reading before committing. IDECBA publishes about two months after a quarter
// closes. Everything on the page — the latest quarter, the rankings, the
// coverage notes, the temporal coverage in the page's structured data — is
// derived from the JSON, so nothing else needs editing.

export type SizeId = (typeof SIZES)[number]["id"];
export type Geo = "barrios" | "comunas";

/** The three unit sizes IDECBA publishes a barrio-level price for. How much of
 * the map each one can actually colour differs a lot and moves every refresh,
 * so it is never written down here — `coverage()` computes it from the data. */
export const SIZES = [
  {
    id: "amb1",
    label: "1 ambiente",
    /** Used in a sentence: "los departamentos de {inTitle}". */
    inTitle: "un ambiente",
    short: "1 amb.",
  },
  {
    id: "amb2",
    label: "2 ambientes",
    inTitle: "dos ambientes",
    short: "2 amb.",
  },
  {
    id: "amb3",
    label: "3 ambientes",
    inTitle: "tres ambientes",
    short: "3 amb.",
  },
] as const;

export const SIZE_IDS: readonly SizeId[] = SIZES.map((s) => s.id);

/** The size the page opens on. Not the smallest: 2 ambientes is the most
 * advertised segment, so it is the one with both a price for most barrios and
 * the least sampling noise behind each price. */
export const DEFAULT_SIZE: SizeId = "amb2";

type Series = Record<SizeId, (number | null)[]>;

const DATA = raw as unknown as {
  periods: string[];
  provisional: string[];
  ciudad: Series;
  barrios: Record<string, Series>;
  comunas: Record<string, Series>;
};

/** Every quarter in the dataset, oldest first, as `YYYYQn`. */
export const PERIODS: readonly string[] = DATA.periods;

/** Quarters IDECBA flags as provisional — the most recent ones, which it
 * revises when the next release lands. */
export const PROVISIONAL: ReadonlySet<string> = new Set(DATA.provisional);

const ordinal = (period: string): number =>
  Number(period.slice(0, 4)) * 4 + Number(period.slice(5)) - 1;

/** Fails the build on a gap, a repeat or an out-of-order quarter — the same
 * guard `ipc-vivienda.ts` puts on its months, and for the same reason: every
 * reader of these arrays treats position as time, and one missing quarter turns
 * "a year earlier" into a lie shaped like data. */
function assertShape(): void {
  for (let i = 1; i < PERIODS.length; i++) {
    if (ordinal(PERIODS[i]) !== ordinal(PERIODS[i - 1]) + 1) {
      throw new Error(
        `venta-caba.json: expected consecutive quarters, got ${PERIODS[i - 1]} → ${PERIODS[i]}`,
      );
    }
  }
  const expect = (
    where: string,
    keys: readonly string[],
    got: Record<string, Series>,
  ): void => {
    for (const key of keys) {
      const series = got[key];
      if (!series) {
        throw new Error(`venta-caba.json: no ${where} "${key}"`);
      }
      for (const size of SIZE_IDS) {
        if (series[size]?.length !== PERIODS.length) {
          throw new Error(
            `venta-caba.json: ${where} "${key}" ${size} has ${series[size]?.length} values, expected ${PERIODS.length}`,
          );
        }
      }
    }
  };
  expect(
    "barrio",
    BARRIOS.map((b) => b.id),
    DATA.barrios,
  );
  expect("comuna", COMUNA_IDS.map(String), DATA.comunas);
}
assertShape();

/** The most recent quarter with data. */
export const LAST_PERIOD = PERIODS[PERIODS.length - 1];

export const SOURCE = raw.source;
export const SOURCE_URL = raw.sourceUrl;

/** "2026Q2" → "2.º trimestre de 2026". */
export const periodLabel = (period: string): string =>
  `${period.slice(5)}.º trimestre de ${period.slice(0, 4)}`;

export const LAST_UPDATED = periodLabel(LAST_PERIOD);

/** The span the dataset covers, as the ISO 8601 interval schema.org's
 * `temporalCoverage` wants — derived, so the page's structured data can't claim
 * a coverage the file no longer has. A quarter is written as its first month. */
const isoQuarter = (period: string): string =>
  `${period.slice(0, 4)}-${String((Number(period.slice(5)) - 1) * 3 + 1).padStart(2, "0")}`;

export const TEMPORAL_COVERAGE = `${isoQuarter(PERIODS[0])}/${isoQuarter(LAST_PERIOD)}`;

/** One region of one map: what the choropleth colours and the table lists. */
export type Row = {
  id: string;
  label: string;
  /** Secondary line — the comuna a barrio sits in, or the barrios a comuna
   * groups. What lets a reader find themselves on the map. */
  meta: string;
  /** `null` where IDECBA withheld the figure. */
  value: number | null;
};

/** Every region of a map, in registry order, for one size and one quarter. */
export function rows(geo: Geo, size: SizeId, period = LAST_PERIOD): Row[] {
  const at = PERIODS.indexOf(period);
  if (at < 0) throw new Error(`venta-caba: no quarter ${period}`);
  if (geo === "barrios") {
    return BARRIOS.map((b) => ({
      id: b.id,
      label: b.label,
      meta: comunaLabel(b.comuna),
      value: DATA.barrios[b.id][size][at],
    }));
  }
  return COMUNA_IDS.map((c) => ({
    id: String(c),
    label: comunaLabel(c),
    meta: comunaCovers(c),
    value: DATA.comunas[String(c)][size][at],
  }));
}

/** The city-wide average — IDECBA's own "Total" row, not a mean of the regions
 * (it weights by how many units were advertised, which we can't reproduce). */
export const ciudad = (size: SizeId, period = LAST_PERIOD): number | null =>
  DATA.ciudad[size][PERIODS.indexOf(period)];

/** How many regions of a map have a published price in `period`, and how many
 * there are. The map's honesty line — quoted in the note under every figure. */
export function coverage(
  geo: Geo,
  size: SizeId,
  period = LAST_PERIOD,
): { withData: number; total: number; missing: string[] } {
  const all = rows(geo, size, period);
  const missing = all.filter((r) => r.value === null);
  return {
    withData: all.length - missing.length,
    total: all.length,
    missing: missing.map((r) => r.label),
  };
}

/** Regions with a price, dearest first. `null`s are dropped rather than sorted
 * to the bottom: "no data" has no rank, and giving it one invents an ordering
 * the source refused to publish. */
export const ranked = (
  geo: Geo,
  size: SizeId,
  period = LAST_PERIOD,
): (Row & { value: number })[] =>
  rows(geo, size, period)
    .filter((r): r is Row & { value: number } => r.value !== null)
    .sort((a, b) => b.value - a.value);

// ── The colour scale ───────────────────────────────────────────────────────

/** Upper bounds of the six shading classes, in USD/m².
 *
 * Fixed round numbers rather than quantiles, and one scale for all six maps.
 * Quantiles would repaint the whole city every refresh and make each size look
 * equally spread, so switching from 1 to 3 ambientes would show no change even
 * though three-ambiente metres are about 200 dollars cheaper. Round breaks keep
 * the switch meaningful and the legend readable, at the cost of leaving the
 * lowest class empty for 1 ambiente — which is itself the correct reading. */
export const BREAKS = [1500, 2000, 2500, 3000, 3500] as const;

/** Which class a value falls in, 0-5. */
export const classOf = (value: number): number =>
  BREAKS.findIndex((b) => value < b) === -1
    ? BREAKS.length
    : BREAKS.findIndex((b) => value < b);

// ── Formatting ─────────────────────────────────────────────────────────────

/** Argentine number formatting: dot thousands, comma decimal. Prices per metre
 * are shown whole — the source's decimals are an artefact of averaging, and
 * nobody quotes an asking price to the cent. */
const NUMBER = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

export const formatUsd = (value: number): string =>
  `US$ ${NUMBER.format(Math.round(value))}`;

/** What a cell with no published figure says. */
export const NO_DATA = "Sin dato";

/** A value for display, or `null` where there is none — the pair the map
 * component takes, so it can shade by the number and print the string without
 * knowing what currency it is in. */
export const display = (value: number | null): string | null =>
  value === null ? null : formatUsd(value);

/** The legend, bottom class first: the range each shade stands for. */
export const LEGEND: { label: string }[] = [
  { label: `menos de ${NUMBER.format(BREAKS[0])}` },
  ...BREAKS.slice(1).map((b, i) => ({
    label: `${NUMBER.format(BREAKS[i])} – ${NUMBER.format(b)}`,
  })),
  { label: `${NUMBER.format(BREAKS[BREAKS.length - 1])} o más` },
];

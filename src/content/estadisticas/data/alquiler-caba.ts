import {
  BARRIOS,
  barriosOfZona,
  COMUNA_IDS,
  comunaCovers,
  comunaLabel,
  ZONAS,
  type ZonaId,
  zonaCovers,
} from "@/content/shared/caba";
import raw from "./alquiler-caba.json";

// IDECBA's asking rent for used apartments in CABA, in pesos a month,
// quarterly, by barrio and by comuna. This is the dataset behind
// /estadisticas/alquiler-caba.
//
// Same shape and same rules as `venta-caba.ts` — series-major arrays, `null`
// for a figure IDECBA withheld, assertions that tell a withheld value apart
// from a dropped one. Read that module's header for the reasoning; what
// follows is only what is different about rent.
//
// ── Two units, and why the map shades by the second one ───────────────────
// IDECBA publishes rent as the price of a *flat*: pesos a month for a unit of
// 1, 2 or 3 ambientes. That is the number people search for, so it is the
// number the page prints. But it can't drive the shading, because the three
// sizes are three different products — across the city the monthly figures
// span 2,9× while the price per square metre spans 1,6×. On one shared monthly
// scale the 3-ambiente map would be uniformly dark and the monoambiente map
// uniformly pale, which says only "a bigger flat costs more".
//
// So the colour is per square metre. That is not our invention: IDECBA derives
// its monthly figure from a price per m² times a fixed reference surface, and
// states the surface in each sheet's footnote — `REFERENCE_AREA` below is read
// out of the files by the refresh script, not typed here. Dividing gets back
// the source's own per-metre figure. Within any one map the two orderings are
// identical, since the surface is constant per size, so the colour never
// disagrees with the figure printed beside it.
//
// It also puts rent in the same unit as the sale series, which is what a
// comparison between the two pages will need.
//
// ── Pesos, and what that forbids ──────────────────────────────────────────
// These are nominal pesos in a country with ~30% annual inflation. Comparing
// two quarters of this series without deflating is measuring inflation, not
// the rental market. Nothing here derives a change over time for that reason —
// if a figure like that is ever wanted, it has to be deflated by the IPCBA, and
// `ipc-vivienda.ts` is *not* that index (it is INDEC division 04 by region).
//
// ── Refreshing ─────────────────────────────────────────────────────────────
// Don't hand-edit alquiler-caba.json. Run
//
//   bun run data:caba
//
// which rebuilds this and the sale dataset from IDECBA's twelve spreadsheets,
// and commit the diff. Read the coverage lines it prints before committing:
// rent is withheld for far more barrios than sale is.

export type SizeId = (typeof SIZES)[number]["id"];
export type Geo = "barrios" | "comunas";

/** The three unit sizes IDECBA publishes a barrio-level rent for. */
export const SIZES = [
  {
    id: "amb1",
    label: "1 ambiente",
    /** Used in a sentence: "alquilar {inTitle}". */
    inTitle: "un monoambiente",
    short: "1 amb.",
  },
  {
    id: "amb2",
    label: "2 ambientes",
    inTitle: "un dos ambientes",
    short: "2 amb.",
  },
  {
    id: "amb3",
    label: "3 ambientes",
    inTitle: "un tres ambientes",
    short: "3 amb.",
  },
] as const;

export const SIZE_IDS: readonly SizeId[] = SIZES.map((s) => s.id);

/** The size the page opens on: the most advertised segment, and the one with
 * the widest barrio coverage. */
export const DEFAULT_SIZE: SizeId = "amb2";

/** The geography the page opens on — and unlike the sale page, that is the
 * comuna.
 *
 * Rent is withheld for far more barrios: in the latest quarter the barrio map
 * can colour about 31 of 48 for one and two ambientes and about 21 for three,
 * against 43 to 45 on the sale side. A map that is a third holes is a poor
 * first impression of a dataset that is fine — at comuna level the same
 * quarter fills 14 or 15 of 15. The barrio view is one click away and the
 * table lists every barrio either way. */
export const DEFAULT_GEO: Geo = "comunas";

type Series = Record<SizeId, (number | null)[]>;

const DATA = raw as unknown as {
  periods: string[];
  provisional: string[];
  referenceArea: Record<SizeId, number>;
  ciudad: Series;
  barrios: Record<string, Series>;
  comunas: Record<string, Series>;
};

/**
 * The surface, in m², that IDECBA's monthly figure assumes for each size.
 *
 * **The source's own number, not ours** — read out of each sheet's footnote by
 * the refresh script, which fails if the footnote ever stops being there. That
 * distinction matters: `REFERENCE_AREA` in `venta-caba.ts` is a round number we
 * picked to illustrate a total, and has to be labelled as ours wherever it is
 * shown. This one can be presented as part of the published methodology.
 */
export const REFERENCE_AREA: Record<SizeId, number> = DATA.referenceArea;

/** Every quarter in the dataset, oldest first, as `YYYYQn`. */
export const PERIODS: readonly string[] = DATA.periods;

/** Quarters IDECBA flags as provisional. */
export const PROVISIONAL: ReadonlySet<string> = new Set(DATA.provisional);

const ordinal = (period: string): number =>
  Number(period.slice(0, 4)) * 4 + Number(period.slice(5)) - 1;

/** Fails the build on a gap, a repeat or an out-of-order quarter, on a missing
 * region, and on a series that isn't as long as the period axis. Every reader
 * of these arrays treats position as time. */
function assertShape(): void {
  for (let i = 1; i < PERIODS.length; i++) {
    if (ordinal(PERIODS[i]) !== ordinal(PERIODS[i - 1]) + 1) {
      throw new Error(
        `alquiler-caba.json: expected consecutive quarters, got ${PERIODS[i - 1]} → ${PERIODS[i]}`,
      );
    }
  }
  for (const size of SIZE_IDS) {
    if (!REFERENCE_AREA[size]) {
      throw new Error(`alquiler-caba.json: no reference surface for ${size}`);
    }
  }
  const expect = (
    where: string,
    keys: readonly string[],
    got: Record<string, Series>,
  ): void => {
    for (const key of keys) {
      const series = got[key];
      if (!series) throw new Error(`alquiler-caba.json: no ${where} "${key}"`);
      for (const size of SIZE_IDS) {
        if (series[size]?.length !== PERIODS.length) {
          throw new Error(
            `alquiler-caba.json: ${where} "${key}" ${size} has ${series[size]?.length} values, expected ${PERIODS.length}`,
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
 * `temporalCoverage` wants. A quarter is written as its first month. */
const isoQuarter = (period: string): string =>
  `${period.slice(0, 4)}-${String((Number(period.slice(5)) - 1) * 3 + 1).padStart(2, "0")}`;

export const TEMPORAL_COVERAGE = `${isoQuarter(PERIODS[0])}/${isoQuarter(LAST_PERIOD)}`;

/** One region of one map. `monthly` is what the page prints; `perMetre` is what
 * the map shades by and what compares across sizes. Both are `null` together —
 * one is derived from the other. */
export type Row = {
  id: string;
  label: string;
  meta: string;
  monthly: number | null;
  perMetre: number | null;
};

/** IDECBA's monthly figure divided by the surface it assumes. */
const perMetre = (monthly: number | null, size: SizeId): number | null =>
  monthly === null ? null : monthly / REFERENCE_AREA[size];

/** Every region of a map, in registry order, for one size and one quarter. */
export function rows(geo: Geo, size: SizeId, period = LAST_PERIOD): Row[] {
  const at = PERIODS.indexOf(period);
  if (at < 0) throw new Error(`alquiler-caba: no quarter ${period}`);
  if (geo === "barrios") {
    return BARRIOS.map((b) => {
      const monthly = DATA.barrios[b.id][size][at];
      return {
        id: b.id,
        label: b.label,
        meta: comunaLabel(b.comuna),
        monthly,
        perMetre: perMetre(monthly, size),
      };
    });
  }
  return COMUNA_IDS.map((c) => {
    const monthly = DATA.comunas[String(c)][size][at];
    return {
      id: String(c),
      label: comunaLabel(c),
      meta: comunaCovers(c),
      monthly,
      perMetre: perMetre(monthly, size),
    };
  });
}

/** The city-wide average — IDECBA's own "Total" row, weighted by how many units
 * were advertised, which we can't reproduce from the barrio figures. */
export const ciudad = (size: SizeId, period = LAST_PERIOD): number | null =>
  DATA.ciudad[size][PERIODS.indexOf(period)];

export const ciudadPerMetre = (
  size: SizeId,
  period = LAST_PERIOD,
): number | null => perMetre(ciudad(size, period), size);

/** How many regions of a map have a published rent in `period`. The map's
 * honesty line, and on this page it carries more weight than on the sale one. */
export function coverage(
  geo: Geo,
  size: SizeId,
  period = LAST_PERIOD,
): { withData: number; total: number; missing: string[] } {
  const all = rows(geo, size, period);
  const missing = all.filter((r) => r.monthly === null);
  return {
    withData: all.length - missing.length,
    total: all.length,
    missing: missing.map((r) => r.label),
  };
}

/** Regions with a published rent, dearest first. `null`s are dropped rather
 * than sorted to the bottom: "no data" has no rank. */
export const ranked = (
  geo: Geo,
  size: SizeId,
  period = LAST_PERIOD,
): (Row & { monthly: number; perMetre: number })[] =>
  rows(geo, size, period)
    .filter(
      (r): r is Row & { monthly: number; perMetre: number } =>
        r.monthly !== null,
    )
    .sort((a, b) => b.monthly - a.monthly);

/** One barrio, with where it sits among the barrios that have a figure this
 * quarter. `null` when this barrio is one of the withheld — which on this page
 * is common, so callers have to handle it. */
export function barrio(
  id: string,
  size: SizeId,
  period = LAST_PERIOD,
): {
  label: string;
  meta: string;
  monthly: number;
  perMetre: number;
  rank: number;
  of: number;
} | null {
  const order = ranked("barrios", size, period);
  const at = order.findIndex((r) => r.id === id);
  if (at < 0) {
    if (!BARRIOS.some((b) => b.id === id)) {
      throw new Error(`alquiler-caba: no barrio "${id}"`);
    }
    return null;
  }
  const row = order[at];
  return {
    label: row.label,
    meta: row.meta,
    monthly: row.monthly,
    perMetre: row.perMetre,
    rank: at + 1,
    of: order.length,
  };
}

// ── Zones ──────────────────────────────────────────────────────────────────

/** A zone's published barrio rents, summarised. The median of *barrios*, for
 * the reasons set out in `venta-caba.ts`: IDECBA's own weighting can't be
 * reproduced and an unweighted mean would follow whichever barrio is extreme.
 *
 * Our arithmetic over published figures, never a figure IDECBA published. */
export type ZonaRow = {
  id: ZonaId;
  label: string;
  comunas: string;
  withData: number;
  total: number;
  median: number | null;
  cheapest: (Row & { monthly: number }) | null;
  dearest: (Row & { monthly: number }) | null;
};

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function zonas(size: SizeId, period = LAST_PERIOD): ZonaRow[] {
  const all = rows("barrios", size, period);
  return ZONAS.map((z) => {
    const ids = new Set(barriosOfZona(z.id).map((b) => b.id));
    const mine = all.filter((r) => ids.has(r.id));
    const withValue = mine
      .filter((r): r is Row & { monthly: number } => r.monthly !== null)
      .sort((a, b) => b.monthly - a.monthly);
    return {
      id: z.id,
      label: z.label,
      comunas: zonaCovers(z.id),
      withData: withValue.length,
      total: mine.length,
      median: median(withValue.map((r) => r.monthly)),
      dearest: withValue[0] ?? null,
      cheapest: withValue[withValue.length - 1] ?? null,
    };
  }).sort((a, b) => (b.median ?? 0) - (a.median ?? 0));
}

// ── The colour scale ───────────────────────────────────────────────────────

/** Upper bounds of the six shading classes, in pesos per m² per month.
 *
 * Per metre, not per month, so one scale serves all six maps — see the header.
 * Round numbers rather than quantiles, so a refresh doesn't repaint the city
 * and the legend stays readable.
 *
 * Unlike the sale scale these will need moving: they are pesos, and inflation
 * walks every barrio up through the classes even when nothing about the market
 * has changed. When the top class starts swallowing the map, re-cut them and
 * say so on the page. */
export const BREAKS = [14000, 15500, 17000, 18500, 20000] as const;

/** Which class a value falls in, 0-5. */
export const classOf = (value: number): number =>
  BREAKS.findIndex((b) => value < b) === -1
    ? BREAKS.length
    : BREAKS.findIndex((b) => value < b);

// ── Formatting ─────────────────────────────────────────────────────────────

const NUMBER = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** Pesos, whole. The source's precision is an artefact of averaging. */
export const formatArs = (value: number): string =>
  `$ ${NUMBER.format(Math.round(value))}`;

/** Pesos per m² per month, rounded to the hundred — the last two digits of a
 * derived figure are noise, and printing them invites a precision the
 * arithmetic doesn't have. */
export const formatArsPerMetre = (value: number): string =>
  `$ ${NUMBER.format(Math.round(value / 100) * 100)}/m²`;

export const NO_DATA = "Sin dato";

export const display = (value: number | null): string | null =>
  value === null ? null : formatArs(value);

export const displayPerMetre = (value: number | null): string | null =>
  value === null ? null : formatArsPerMetre(value);

/** The legend, bottom class first. Per m² per month, like the shading. */
export const LEGEND: { label: string }[] = [
  { label: `menos de ${NUMBER.format(BREAKS[0])}` },
  ...BREAKS.slice(1).map((b, i) => ({
    label: `${NUMBER.format(BREAKS[i])} – ${NUMBER.format(b)}`,
  })),
  { label: `${NUMBER.format(BREAKS[BREAKS.length - 1])} o más` },
];

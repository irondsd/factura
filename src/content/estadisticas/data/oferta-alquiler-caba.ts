import {
  BARRIOS,
  barriosOfZona,
  COMUNA_IDS,
  comunaCovers,
  comunaLabel,
  ZONAS,
  type ZonaId,
  zonaCovers,
} from "./caba";
import raw from "./oferta-alquiler-caba.json";

// IDECBA's advertised floor area for rental flats in CABA, in square metres,
// monthly, by barrio. This is the dataset behind
// /estadisticas/oferta-alquiler-caba, and it answers a different question from
// the other two CABA modules: not what a flat costs, but whether there is one.
//
// ── Why this series behaves unlike the price ones ─────────────────────────
// It is a *total*, and that changes three things at once.
//
// 1. **Coverage is complete.** IDECBA withholds an average below a minimum
//    number of listings, which is why `alquiler-caba` can only colour about
//    two thirds of the barrio map. A total has no such threshold: zero is a
//    publishable answer. All 48 barrios carry a number in every month, so
//    nothing here is ever `null` and the map is never hatched.
//
//    The corollary matters more than it looks: **a zero is data.** It means
//    nothing at all was advertised in that barrio that month, which is the
//    single most informative thing this page has to say about Villa Riachuelo
//    or Villa Soldati. Never coalesce it with "no data".
//
// 2. **Our own aggregation needs no apology.** Sums add up, so rolling barrios
//    into comunas here is the same arithmetic the source would do — unlike
//    `PrecioPorZona`, which has to explain at length why a median of barrios
//    is not IDECBA's listing-weighted average. IDECBA publishes no comuna-level
//    superficie table at all, so `comunas()` below is the only way to get one,
//    and it is exact rather than approximate.
//
// 3. **It is monthly**, not quarterly like its two siblings, and it reaches
//    back to July 2013 rather than 2017 or 2018.
//
// ── Square metres, the count of flats, and the share ──────────────────────
// The published unit is m² advertised, which is not a number anyone has an
// intuition for: "20.594 m² en Palermo" says far less than "unos 460
// departamentos". So the page prints a count.
//
// The divisor is IDECBA's own `superficie promedio` table — the average
// advertised surface, month by month, for a 1-, 2- and 3-ambiente flat, which
// in mid-2026 runs around 32, 41 and 63 m². For the 1-to-5 series there is no
// published average, and `averageArea.total` is **derived by the refresh
// script** from the size distribution of advertised units; the derivation is
// documented there.
//
// The counts are approximate and are presented as such: a barrio whose flats
// are unusually large or small for their size band gets a count that is a
// little off, and on the 1-to-5 view that applies to its size mix too.
//
// **The count is not what the map shades by** — `share` is, and the argument
// for that is at `BREAKS` below. The short version: a count cannot carry one
// scale across the four size views, because the city advertises five times as
// many flats in total as it does three-ambiente ones. Within any one view the
// two rank identically, so the colour never contradicts the figure beside it.
//
// ── The universe is wider than the price pages' ───────────────────────────
// These tables count `usados y a estrenar`; the price tables count `usados`
// only. The supply map therefore describes a slightly bigger market than the
// price map, and the page says so.
//
// ── Refreshing ─────────────────────────────────────────────────────────────
// Don't hand-edit oferta-alquiler-caba.json. Run
//
//   bun run data:caba
//
// which rebuilds this and the two price datasets, and commit the diff. This one
// is monthly, so it has something new roughly every month — more often than its
// siblings, which move once a quarter.

export type SizeId = (typeof SIZES)[number]["id"];
export type Geo = "barrios" | "comunas";

/** The four supply series. `total` is the whole rental market — IDECBA's "1 a 5
 * ambientes" table — and the three others are the segments people search by. */
export const SIZES = [
  {
    id: "total",
    label: "todos los tamaños",
    /** Used in a sentence: "hay {inTitle} en oferta". */
    inTitle: "departamentos",
    short: "Todos",
  },
  {
    id: "amb1",
    label: "1 ambiente",
    inTitle: "monoambientes",
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

/** The size the page opens on: the whole rental market in one series, which is
 * the question "¿dónde hay algo para alquilar?" asked without qualification. */
export const DEFAULT_SIZE: SizeId = "total";

/** The geography the page opens on — and unlike the rent price map, that is the
 * barrio.
 *
 * That map opens on comunas because a third of its barrios have no published
 * figure and a map full of holes misrepresents the dataset. Here every barrio
 * has a number in every month, so the reason doesn't apply, and barrio is the
 * unit people actually think in when they ask where to look for a flat. */
export const DEFAULT_GEO: Geo = "barrios";

type Series = Record<SizeId, number[]>;

const DATA = raw as unknown as {
  periods: string[];
  provisional: string[];
  averageArea: Series;
  ciudad: Series;
  barrios: Record<string, Series>;
};

/** Every month in the dataset, oldest first, as `YYYY-MM`. */
export const PERIODS: readonly string[] = DATA.periods;

/** Months IDECBA flags as provisional. */
export const PROVISIONAL: ReadonlySet<string> = new Set(DATA.provisional);

const ordinal = (period: string): number =>
  Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7)) - 1;

/** Fails the build on a gap, a repeat or an out-of-order month, on a missing
 * barrio, and on a series that isn't as long as the period axis. Every reader
 * of these arrays treats position as time. */
function assertShape(): void {
  for (let i = 1; i < PERIODS.length; i++) {
    if (ordinal(PERIODS[i]) !== ordinal(PERIODS[i - 1]) + 1) {
      throw new Error(
        `oferta-alquiler-caba.json: expected consecutive months, got ${PERIODS[i - 1]} → ${PERIODS[i]}`,
      );
    }
  }
  const expectSeries = (where: string, series: Series | undefined): void => {
    if (!series) throw new Error(`oferta-alquiler-caba.json: no ${where}`);
    for (const size of SIZE_IDS) {
      if (series[size]?.length !== PERIODS.length) {
        throw new Error(
          `oferta-alquiler-caba.json: ${where} ${size} has ${series[size]?.length} values, expected ${PERIODS.length}`,
        );
      }
      // A total is never withheld, so a null here is a hole rather than a
      // suppression — and unlike the price modules there is no legitimate
      // reading of one. Guarded because the whole page assumes it.
      const bad = series[size].findIndex((v) => typeof v !== "number");
      if (bad >= 0) {
        throw new Error(
          `oferta-alquiler-caba.json: ${where} ${size} has no value for ${PERIODS[bad]}. Totals are never suppressed, so this is a hole in the sheet.`,
        );
      }
    }
  };
  expectSeries("ciudad", DATA.ciudad);
  expectSeries("averageArea", DATA.averageArea);
  for (const b of BARRIOS) expectSeries(`barrio "${b.id}"`, DATA.barrios[b.id]);

  // The divisor is the one number here that can't be sanity-checked by eye on
  // the page, and a wrong one silently rescales every count.
  for (const size of SIZE_IDS) {
    for (const [i, area] of DATA.averageArea[size].entries()) {
      if (!(area > 10 && area < 200)) {
        throw new Error(
          `oferta-alquiler-caba.json: averageArea ${size} ${PERIODS[i]} is ${area} m², which is not a flat.`,
        );
      }
    }
  }
}
assertShape();

/** The most recent month with data. */
export const LAST_PERIOD = PERIODS[PERIODS.length - 1];

export const SOURCE = raw.source;
export const SOURCE_URL = raw.sourceUrl;

const MONTHS = [
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

/** "2026-07" → "julio de 2026". */
export const periodLabel = (period: string): string =>
  `${MONTHS[Number(period.slice(5, 7)) - 1]} de ${period.slice(0, 4)}`;

export const LAST_UPDATED = periodLabel(LAST_PERIOD);

/** The span the dataset covers, as the ISO 8601 interval schema.org's
 * `temporalCoverage` wants. The periods are already ISO months. */
export const TEMPORAL_COVERAGE = `${PERIODS[0]}/${LAST_PERIOD}`;

/** m² per advertised flat in a given month — IDECBA's published average for the
 * three sizes, and a derived one for the whole market. The divisor behind every
 * count on the page. */
export const averageArea = (size: SizeId, period = LAST_PERIOD): number => {
  const at = PERIODS.indexOf(period);
  if (at < 0) throw new Error(`oferta-alquiler-caba: no month ${period}`);
  return DATA.averageArea[size][at];
};

/** One region of one map.
 *
 * `m2` is what IDECBA publishes. `units` is that divided by the month's average
 * advertised surface, and is what the page prints. `share` is the region's
 * percentage of everything advertised in the city that month, and is what the
 * map shades by — see `BREAKS`. None of the three is ever null; see the header. */
export type Row = {
  id: string;
  label: string;
  meta: string;
  m2: number;
  units: number;
  share: number;
};

const sumAt = (ids: readonly string[], size: SizeId, at: number): number =>
  ids.reduce((total, id) => total + DATA.barrios[id][size][at], 0);

/** Every region of a map, in registry order, for one size and one month.
 *
 * The comuna figures are summed from the barrios here rather than read from a
 * file, because IDECBA publishes no comuna-level superficie table. That is
 * exact, not approximate: these are totals, so the sum of the parts *is* the
 * whole. See the header. */
export function rows(geo: Geo, size: SizeId, period = LAST_PERIOD): Row[] {
  const at = PERIODS.indexOf(period);
  if (at < 0) throw new Error(`oferta-alquiler-caba: no month ${period}`);
  const area = DATA.averageArea[size][at];
  const city = DATA.ciudad[size][at];
  const derive = (m2: number) => ({
    m2,
    units: m2 / area,
    // A city with nothing at all advertised in a size band is not a state
    // IDECBA has ever published, but it is one this arithmetic has to survive.
    share: city === 0 ? 0 : (m2 / city) * 100,
  });

  if (geo === "barrios") {
    return BARRIOS.map((b) => ({
      id: b.id,
      label: b.label,
      meta: comunaLabel(b.comuna),
      ...derive(DATA.barrios[b.id][size][at]),
    }));
  }
  return COMUNA_IDS.map((c) => ({
    id: String(c),
    label: comunaLabel(c),
    meta: comunaCovers(c),
    ...derive(
      sumAt(
        BARRIOS.filter((b) => b.comuna === c).map((b) => b.id),
        size,
        at,
      ),
    ),
  }));
}

/** The city's advertised area — IDECBA's own "Total" row, which is what the 48
 * barrios add up to. */
export const ciudad = (size: SizeId, period = LAST_PERIOD): number =>
  DATA.ciudad[size][PERIODS.indexOf(period)];

/** The city's advertised area as an approximate count of flats. */
export const ciudadUnits = (size: SizeId, period = LAST_PERIOD): number =>
  ciudad(size, period) / averageArea(size, period);

/** Regions with the most on offer first. Nothing is dropped — a barrio with
 * zero advertised has a rank like any other, and it is the interesting end. */
export const ranked = (geo: Geo, size: SizeId, period = LAST_PERIOD): Row[] =>
  rows(geo, size, period).sort((a, b) => b.m2 - a.m2);

/** How many regions of a map have nothing at all advertised this month. The
 * honesty line on this page is the mirror image of the price pages': there,
 * some regions have no *figure*; here every region has one, and what some of
 * them have is a zero. */
export function empty(
  geo: Geo,
  size: SizeId,
  period = LAST_PERIOD,
): { withOffer: number; total: number; none: string[] } {
  const all = rows(geo, size, period);
  const none = all.filter((r) => r.m2 === 0);
  return {
    withOffer: all.length - none.length,
    total: all.length,
    none: none.map((r) => r.label),
  };
}

/** One barrio, with where it sits among the 48 this month. Never null — every
 * barrio has a figure — which is what makes this page usable for barrios the
 * price page can say nothing about. */
export function barrio(
  id: string,
  size: SizeId,
  period = LAST_PERIOD,
): {
  label: string;
  meta: string;
  m2: number;
  units: number;
  rank: number;
  of: number;
} {
  const order = ranked("barrios", size, period);
  const at = order.findIndex((r) => r.id === id);
  if (at < 0) throw new Error(`oferta-alquiler-caba: no barrio "${id}"`);
  const row = order[at];
  return {
    label: row.label,
    meta: row.meta,
    m2: row.m2,
    units: row.units,
    rank: at + 1,
    of: order.length,
  };
}

// ── Zones ──────────────────────────────────────────────────────────────────

/** A zone's share of everything on offer.
 *
 * A **sum**, and therefore a very different object from `zonas()` in
 * `alquiler-caba.ts`, which has to take a median of barrios and explain why. A
 * zone's total is exactly the sum of its barrios', so this is the source's own
 * arithmetic applied to a grouping the source doesn't publish. Only the
 * grouping is ours — see the note on `ZONAS`. */
export type ZonaRow = {
  id: ZonaId;
  label: string;
  comunas: string;
  m2: number;
  units: number;
  /** Percent of the city's advertised area. */
  share: number;
  /** The barrio in the zone with most on offer. */
  top: Row;
};

export function zonas(size: SizeId, period = LAST_PERIOD): ZonaRow[] {
  const all = rows("barrios", size, period);
  const city = ciudad(size, period);
  const area = averageArea(size, period);
  return ZONAS.map((z) => {
    const ids = new Set(barriosOfZona(z.id).map((b) => b.id));
    const mine = all.filter((r) => ids.has(r.id)).sort((a, b) => b.m2 - a.m2);
    const m2 = mine.reduce((t, r) => t + r.m2, 0);
    return {
      id: z.id,
      label: z.label,
      comunas: zonaCovers(z.id),
      m2,
      units: m2 / area,
      share: city === 0 ? 0 : (m2 / city) * 100,
      top: mine[0],
    };
  }).sort((a, b) => b.m2 - a.m2);
}

// ── The colour scale ───────────────────────────────────────────────────────

/** Upper bounds of the six shading classes, as a percentage of everything the
 * city advertised that month.
 *
 * **A share, not a count**, and that is the one decision on this page worth
 * arguing about. Two things forced it.
 *
 * Supply is skewed in a way a price never is: the busiest barrio advertises a
 * few hundred times what the quietest does, so a linear ladder of counts paints
 * one barrio black and forty-seven the palest shade — a map that says only
 * "Palermo is big", which the reader already knew.
 *
 * A logarithmic ladder of counts fixes that for one size and breaks for the
 * others. The four size views differ in scale by about five to one (the city
 * advertises some 3.000 flats in total but only ~600 of three ambientes), so
 * any single ladder of counts leaves the top classes unused on the smaller
 * views: measured over the last thirteen years, the best count ladder wasted
 * three to five of the six classes. AUTHORING.md §7 asks for one scale across
 * every cut of the same measure, and in counts there is no such scale.
 *
 * In shares there is. Each size band is read against its own city total, and
 * the four distributions come out almost identical — top barrio 12-15 %, median
 * around 1 %. These five breaks leave **no class unused in any of the four
 * views, in any month sampled across the whole series**, which is what makes
 * one legend honest above all eight maps.
 *
 * It also makes the scale immune to the thing that will move this series most.
 * The rent scale is in pesos and inflation walks the city up through it even
 * when nothing happens; a share has no such drift, so the ladder holds however
 * far the market grows or shrinks. That matters here: this is the series where
 * the city's total offer has changed several-fold within the published range.
 *
 * Within any one view, share and count rank identically — the divisor is the
 * same for every region — so the colour never contradicts the figure beside it.
 *
 * Recut these only if the map stops discriminating: if class 0 or class 5 ever
 * swallows most of the city, and say so on the page when you do. */
export const BREAKS = [0.5, 1.5, 3, 6, 10] as const;

/** Which class a value falls in, 0-5. */
export const classOf = (value: number): number =>
  BREAKS.findIndex((b) => value < b) === -1
    ? BREAKS.length
    : BREAKS.findIndex((b) => value < b);

// ── Formatting ─────────────────────────────────────────────────────────────

const NUMBER = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** Square metres, whole — the published figure. */
export const formatM2 = (value: number): string =>
  `${NUMBER.format(Math.round(value))} m²`;

/** A count of flats, rounded to what the arithmetic can carry.
 *
 * Rounded hard, and deliberately: below ten it is printed as it comes out,
 * above that to the nearest five, and above a hundred to the nearest ten. The
 * arithmetic behind it is a division by a city-wide average, so the last digit
 * of "213" is invented — and printing it invites a precision the number doesn't
 * have. Zero stays zero, because zero is the answer.
 *
 * A barrio with a single small flat advertised rounds to 1 rather than to 0:
 * "nothing" and "almost nothing" are the one distinction this page exists to
 * make, and rounding one into the other would erase it. */
const roundUnits = (value: number): number =>
  value === 0
    ? 0
    : value < 10
      ? Math.max(1, Math.round(value))
      : value < 100
        ? Math.round(value / 5) * 5
        : Math.round(value / 10) * 10;

export const formatUnits = (value: number): string =>
  NUMBER.format(roundUnits(value));

/** The count with its noun, for a tooltip or a table cell: "~200 deptos.".
 * The tilde is part of the figure, not decoration — see the header. */
export const display = (value: number): string => {
  const n = roundUnits(value);
  if (n === 0) return "Nada en oferta";
  return `~${NUMBER.format(n)} ${n === 1 ? "depto." : "deptos."}`;
};

export const displayM2 = (value: number): string => formatM2(value);

const SHARE = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** A region's share of the city's offer — what the shading is.
 *
 * One decimal below 10 %, none above: at the top of the scale the tenth is
 * noise, at the bottom it is the difference between a barrio and a rounding
 * error. Below a tenth of a point it becomes "< 0,1 %", because a barrio that
 * has *something* advertised must not print as "0,0 %" on a page whose whole
 * point is telling apart nothing from almost nothing. */
export const formatShare = (value: number): string => {
  if (value === 0) return "0 %";
  if (value < 0.05) return "< 0,1 %";
  return value < 10
    ? `${SHARE.format(value)} %`
    : `${NUMBER.format(Math.round(value))} %`;
};

/** The legend, bottom class first, as a share of the city.
 *
 * Its own formatter rather than `formatShare`: a break is a round number the
 * reader is meant to hold in their head, so "3 – 6 %" beats "3,0 – 6,0 %".
 * A table cell needs the decimal, a legend label does not. */
const BREAK = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

export const LEGEND: { label: string }[] = [
  { label: `menos de ${BREAK.format(BREAKS[0])} %` },
  ...BREAKS.slice(1).map((b, i) => ({
    label: `${BREAK.format(BREAKS[i])} – ${BREAK.format(b)} %`,
  })),
  { label: `${BREAK.format(BREAKS[BREAKS.length - 1])} % o más` },
];

/** `MapaCaba` requires a no-data label even where there is no no-data state.
 * Nothing on this page is ever hatched — every region has a figure every month
 * — but the legend swatch and the table's fallback are rendered
 * unconditionally, so they get a label that is true of this dataset. */
export const NO_DATA = "Sin oferta";

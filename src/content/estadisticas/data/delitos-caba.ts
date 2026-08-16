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
import raw from "./delitos-caba.json";

// Crimes recorded in CABA, by barrio and by comuna, every year since 2016 —
// the dataset behind /estadisticas/delitos-caba.
//
// Editorial/reference data like the other files here: it never touches a user's
// bills and it is baked into the static build beside the prose that explains it.
// Three things about *this* series shape everything below, and each of them is a
// place a page could go wrong quietly.
//
// ── 1. These are recorded crimes, not crimes ──────────────────────────────
// Every figure is a hecho registrado: something reached a police report, a
// judicial file or the 911 system. A crime nobody reports is not here, and how
// willing people are to report differs between a stolen phone in Recoleta and a
// stolen phone in Villa Soldati. Nothing in this module can correct for that,
// so the words it hands the page are "delitos registrados" and never "delitos".
//
// ── 2. A count is not a rate, and a rate needs a denominator ──────────────
// Palermo records more crime than Agronomía because Palermo is twelve times the
// size. Everything a reader wants to compare is per resident, so `rate()` is the
// primary reading and `count()` is the supporting one. The denominator is the
// 2022 census: exact for the comunas, and for the barrios an estimate whose
// construction is documented in the refresh script and named on the page.
//
// ── 3. Residents are the wrong denominator for half the city ──────────────
// San Nicolás has 33.000 residents and a million people a day. Dividing its
// crimes by its residents produces a real number that answers a question nobody
// asked — the risk to a resident, in a barrio that is mostly not residents. The
// module refuses to hide this: `flotante()` exists precisely to measure it, and
// the page leads with it rather than burying it in a footnote.
//
// ── Refreshing ─────────────────────────────────────────────────────────────
// Don't hand-edit delitos-caba.json. Run
//
//   bun run data:delitos
//
// which re-reads the yearly incident files and re-counts them, and commit the
// diff. The Mapa del Delito is published once a year, a few months after the
// year closes. Everything on the page — the latest year, the rankings, the
// temporal coverage in the page's structured data — is derived from the JSON.

export type Geo = "barrios" | "comunas";

/** The nine series stored per region per year, as the refresh script writes
 * them. Nothing outside this module names them: pages ask for a category. */
type MeasureId =
  | "robo"
  | "roboAutomotor"
  | "hurto"
  | "hurtoAutomotor"
  | "lesiones"
  | "amenazas"
  | "homicidios"
  | "lesionesViales"
  | "muertesViales";

type Series = Record<MeasureId, number[]>;

const DATA = raw as unknown as {
  years: number[];
  measures: MeasureId[];
  ciudad: Series;
  sinBarrio: Series;
  barrios: Record<string, Series>;
  comunas: Record<string, Series>;
  robos: { conArma: number[]; conMoto: number[] };
  perfil: {
    year: number;
    sinFranja: number;
    franja: Series;
    dia: Series;
    dias: string[];
  };
  poblacion: {
    censo: number;
    comunas: Record<string, number>;
    barrios: Record<string, number>;
    barrios2010: Record<string, number>;
  };
};

export const YEARS: readonly number[] = DATA.years;
export const LAST_YEAR = YEARS[YEARS.length - 1];
export const FIRST_YEAR = YEARS[0];

export const SOURCE = raw.source;

/** The span the dataset covers, as the ISO 8601 interval schema.org's
 * `temporalCoverage` wants — derived, so the page's structured data can't claim
 * a coverage the file no longer has. */
export const TEMPORAL_COVERAGE = `${FIRST_YEAR}/${LAST_YEAR}`;

// ── What the page can ask for ──────────────────────────────────────────────

/**
 * The four cuts the map offers. Disjoint by construction: `robos`, `hurtos` and
 * `personas` partition `total`, so a reader switching between them is looking at
 * three slices of one pie rather than three overlapping selections.
 *
 * Road-traffic casualties are deliberately *not* in `total`. The source files
 * them under the same dataset — they are what the city's emergency system
 * records — but a crash is not an offence, and folding 11.000 of them into a
 * crime count would move every barrio near an avenue for the wrong reason. They
 * have their own entry in `OTRAS`, shown in the summary table and named.
 */
export const CATEGORIES = [
  {
    id: "total",
    label: "Todos los delitos",
    short: "Todos",
    /** Used in a sentence: "los {inTitle} registrados". */
    inTitle: "delitos",
    measures: [
      "robo",
      "roboAutomotor",
      "hurto",
      "hurtoAutomotor",
      "lesiones",
      "amenazas",
      "homicidios",
    ],
  },
  {
    id: "robos",
    label: "Robos",
    short: "Robos",
    inTitle: "robos",
    measures: ["robo", "roboAutomotor"],
  },
  {
    id: "hurtos",
    label: "Hurtos",
    short: "Hurtos",
    inTitle: "hurtos",
    measures: ["hurto", "hurtoAutomotor"],
  },
  {
    id: "personas",
    label: "Delitos contra las personas",
    short: "Personas",
    inTitle: "delitos contra las personas",
    measures: ["lesiones", "amenazas", "homicidios"],
  },
] as const satisfies readonly {
  id: string;
  label: string;
  short: string;
  inTitle: string;
  measures: readonly MeasureId[];
}[];

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const DEFAULT_CATEGORY: CategoryId = "total";

const measuresOf = (category: CategoryId): readonly MeasureId[] =>
  CATEGORIES.find((c) => c.id === category)!.measures;

/**
 * The rows of the summary table: what the city recorded, broken down further
 * than the map's four cuts go.
 *
 * `inTotal` is what keeps the table honest — the first four rows add up to the
 * "Todos los delitos" row, the ones after it don't, and a reader adding the
 * column deserves to be told which is which rather than discovering it.
 */
export const BREAKDOWN = [
  { id: "robos", label: "Robos (con violencia)", measures: ["robo", "roboAutomotor"], inTotal: true }, // prettier-ignore
  { id: "hurtos", label: "Hurtos (sin violencia)", measures: ["hurto", "hurtoAutomotor"], inTotal: true }, // prettier-ignore
  { id: "lesiones", label: "Lesiones dolosas", measures: ["lesiones"], inTotal: true }, // prettier-ignore
  { id: "amenazas", label: "Amenazas", measures: ["amenazas"], inTotal: true }, // prettier-ignore
  { id: "homicidios", label: "Homicidios dolosos", measures: ["homicidios"], inTotal: true }, // prettier-ignore
  { id: "automotor", label: "Robo y hurto de vehículos", measures: ["roboAutomotor", "hurtoAutomotor"], inTotal: false }, // prettier-ignore
  { id: "viales", label: "Heridos y muertos en siniestros viales", measures: ["lesionesViales", "muertesViales"], inTotal: false }, // prettier-ignore
] as const satisfies readonly {
  id: string;
  label: string;
  measures: readonly MeasureId[];
  inTotal: boolean;
}[];

// ── Shape assertions ───────────────────────────────────────────────────────

/** Fails the build on a gap, a repeat or an out-of-order year, on a missing
 * region, and on a series of the wrong length — the same guard the other data
 * modules put on their periods, for the same reason: every reader of these
 * arrays treats position as time. */
function assertShape(): void {
  for (let i = 1; i < YEARS.length; i++) {
    if (YEARS[i] !== YEARS[i - 1] + 1) {
      throw new Error(
        `delitos-caba.json: expected consecutive years, got ${YEARS[i - 1]} → ${YEARS[i]}`,
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
      if (!series) throw new Error(`delitos-caba.json: no ${where} "${key}"`);
      for (const m of DATA.measures) {
        if (series[m]?.length !== YEARS.length) {
          throw new Error(
            `delitos-caba.json: ${where} "${key}" ${m} has ${series[m]?.length} values, expected ${YEARS.length}`,
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

  // The city total, the regions and the unplaceable events have to reconcile in
  // every year: the whole point of publishing `sinBarrio` is that the gap
  // between the map and the city figure is a number rather than a mystery.
  for (let i = 0; i < YEARS.length; i++) {
    for (const geo of ["barrios", "comunas"] as const) {
      for (const m of DATA.measures) {
        const sum = Object.values(DATA[geo]).reduce((a, s) => a + s[m][i], 0);
        const expected = DATA.ciudad[m][i] - DATA.sinBarrio[m][i];
        if (sum !== expected) {
          throw new Error(
            `delitos-caba.json: in ${YEARS[i]} the ${geo} sum to ${sum} ${m}, but the city recorded ${DATA.ciudad[m][i]} of which ${DATA.sinBarrio[m][i]} could not be placed.`,
          );
        }
      }
    }
  }

  for (const b of BARRIOS) {
    if (!DATA.poblacion.barrios[b.id]) {
      throw new Error(`delitos-caba.json: no population for barrio ${b.id}`);
    }
  }
  for (const c of COMUNA_IDS) {
    if (!DATA.poblacion.comunas[String(c)]) {
      throw new Error(`delitos-caba.json: no population for comuna ${c}`);
    }
  }
}
assertShape();

const yearAt = (year: number): number => {
  const at = YEARS.indexOf(year);
  if (at < 0) throw new Error(`delitos-caba: no year ${year}`);
  return at;
};

// ── Population ─────────────────────────────────────────────────────────────

export const CITY_POPULATION = COMUNA_IDS.reduce(
  (a, c) => a + DATA.poblacion.comunas[String(c)],
  0,
);

const population = (geo: Geo, id: string): number =>
  geo === "barrios"
    ? DATA.poblacion.barrios[id]
    : DATA.poblacion.comunas[id];

/**
 * Barrios whose estimated population is least trustworthy, named rather than
 * hinted at.
 *
 * The barrio denominators are the 2010 count rescaled to each comuna's 2022
 * census total (see the refresh script), which assumes a barrio's share of its
 * own comuna held over twelve years. Puerto Madero is where that assumption is
 * worst: it was still being built in 2010, it has grown far faster than the rest
 * of Comuna 1, and so its population here is understated and its rate
 * correspondingly overstated. The page names it wherever it appears near the top
 * of a ranking, which — because it is a business district with very few
 * residents — is everywhere.
 */
export const ESTIMATE_WEAKEST = ["puerto-madero"] as const;

// ── The numbers ────────────────────────────────────────────────────────────

const sum = (series: Series, ms: readonly MeasureId[], at: number): number =>
  ms.reduce((a, m) => a + series[m][at], 0);

const seriesOf = (geo: Geo, id: string): Series =>
  geo === "barrios" ? DATA.barrios[id] : DATA.comunas[id];

/** Recorded events in one region, one category, one year. */
export const count = (
  geo: Geo,
  id: string,
  category: CategoryId = DEFAULT_CATEGORY,
  year = LAST_YEAR,
): number => sum(seriesOf(geo, id), measuresOf(category), yearAt(year));

/** Recorded events per 1.000 residents per year — the reading everything on the
 * page is ranked and shaded by.
 *
 * Per 1.000 rather than the per 100.000 criminology usually quotes, because at
 * this scale per 100.000 puts every figure on the page in five digits: CABA
 * records about 39 crimes a year per 1.000 residents, which is a number a reader
 * can hold, and 3.890 per 100.000, which is not. Homicide is the exception and
 * is quoted per 100.000 where it appears, as everyone quotes it. */
export const rate = (
  geo: Geo,
  id: string,
  category: CategoryId = DEFAULT_CATEGORY,
  year = LAST_YEAR,
): number => (count(geo, id, category, year) / population(geo, id)) * 1000;

/** City-wide, including the events the source could not place in a barrio. */
export const cityCount = (
  category: CategoryId = DEFAULT_CATEGORY,
  year = LAST_YEAR,
): number => sum(DATA.ciudad, measuresOf(category), yearAt(year));

export const cityRate = (
  category: CategoryId = DEFAULT_CATEGORY,
  year = LAST_YEAR,
): number => (cityCount(category, year) / CITY_POPULATION) * 1000;

/** The events in `cityCount` that no region can show — the source's own "NULL"
 * barrio, about 2 % of the total. The figure the map's coverage note quotes. */
export const unplaced = (
  category: CategoryId = DEFAULT_CATEGORY,
  year = LAST_YEAR,
): number => sum(DATA.sinBarrio, measuresOf(category), yearAt(year));

/** One row of the breakdown table, city-wide. */
export function breakdown(year = LAST_YEAR): {
  id: string;
  label: string;
  inTotal: boolean;
  count: number;
  rate: number;
  /** Change against the previous year, as a fraction. `null` in the first. */
  change: number | null;
}[] {
  const at = yearAt(year);
  const before = at > 0 ? at - 1 : null;
  return BREAKDOWN.map((row) => {
    const n = sum(DATA.ciudad, row.measures, at);
    const was = before === null ? null : sum(DATA.ciudad, row.measures, before);
    return {
      id: row.id,
      label: row.label,
      inTotal: row.inTotal,
      count: n,
      rate: (n / CITY_POPULATION) * 1000,
      change: was === null || was === 0 ? null : n / was - 1,
    };
  });
}

// ── One region of one map ──────────────────────────────────────────────────

export type Row = {
  id: string;
  label: string;
  /** Secondary line — the comuna a barrio sits in, or the barrios a comuna
   * groups. What lets a reader find themselves on the map. */
  meta: string;
  count: number;
  rate: number;
  /** The rate as a multiple of the city's, which is what the map shades by.
   *
   * Shading by the ratio rather than by the rate is what lets one colour scale
   * serve all four categories: the city records 39 crimes per 1.000 residents a
   * year but only 7 delitos contra las personas, so a scale built for the first
   * would paint the fourth map a single flat colour. Within any one view the
   * ratio and the rate rank identically, so the colour never contradicts the
   * figure printed beside it. */
  ratio: number;
};

/** Every region of a map, in registry order, for one category and one year. No
 * value is ever missing: unlike the price series, a count is never suppressed —
 * every barrio has a figure in every year, including zero. */
export function rows(
  geo: Geo,
  category: CategoryId = DEFAULT_CATEGORY,
  year = LAST_YEAR,
): Row[] {
  const city = cityRate(category, year);
  const make = (id: string, label: string, meta: string): Row => {
    const r = rate(geo, id, category, year);
    return {
      id,
      label,
      meta,
      count: count(geo, id, category, year),
      rate: r,
      ratio: r / city,
    };
  };
  return geo === "barrios"
    ? BARRIOS.map((b) => make(b.id, b.label, comunaLabel(b.comuna)))
    : COMUNA_IDS.map((c) => make(String(c), comunaLabel(c), comunaCovers(c)));
}

/** Regions with the highest rate first. */
export const ranked = (
  geo: Geo,
  category: CategoryId = DEFAULT_CATEGORY,
  year = LAST_YEAR,
): Row[] => rows(geo, category, year).sort((a, b) => b.rate - a.rate);

// ── Residents, and everybody else ──────────────────────────────────────────

/**
 * The gap between where crime is recorded and where people live.
 *
 * For each region: its share of the city's recorded crime against its share of
 * the city's residents. A barrio at 3× has three times the crime its population
 * would account for, and the reason is almost never that its residents are
 * being robbed three times as often — it is that a barrio's daytime population
 * is not its census population. San Nicolás holds 1 % of the city's residents
 * and the whole microcentro; Puerto Madero holds 0,2 % and the offices.
 *
 * This is the same arithmetic as `ratio` on a Row — share of crime over share of
 * population is algebraically the rate over the city rate — and it is exposed
 * separately because it is a different *argument*: the map uses the ratio to
 * colour, and this uses the two shares to show why the colour should not be read
 * as risk. Both shares are computed against the placed events only, so they each
 * sum to 100 %.
 */
export type Flotante = Row & {
  shareCrime: number;
  sharePeople: number;
};

export function flotante(
  geo: Geo = "barrios",
  category: CategoryId = DEFAULT_CATEGORY,
  year = LAST_YEAR,
): Flotante[] {
  const all = rows(geo, category, year);
  const crimes = all.reduce((a, r) => a + r.count, 0);
  const people = all.reduce((a, r) => a + population(geo, r.id), 0);
  return all
    .map((r) => ({
      ...r,
      shareCrime: r.count / crimes,
      sharePeople: population(geo, r.id) / people,
    }))
    .sort((a, b) => b.ratio - a.ratio);
}

// ── Zones ──────────────────────────────────────────────────────────────────

/** A zone's recorded crime, aggregated rather than averaged: the zone's events
 * over the zone's residents. Unlike the price pages, which have to take a median
 * of barrios because IDECBA's weighting can't be reproduced, counts and
 * populations both add up, so the honest figure here is the real one. */
export type ZonaRow = {
  id: ZonaId;
  label: string;
  comunas: string;
  count: number;
  population: number;
  rate: number;
  ratio: number;
  dearest: Row;
  calmest: Row;
};

export function zonas(
  category: CategoryId = DEFAULT_CATEGORY,
  year = LAST_YEAR,
): ZonaRow[] {
  const all = rows("barrios", category, year);
  const city = cityRate(category, year);
  return ZONAS.map((z) => {
    const ids = new Set(barriosOfZona(z.id).map((b) => b.id));
    const mine = all
      .filter((r) => ids.has(r.id))
      .sort((a, b) => b.rate - a.rate);
    const n = mine.reduce((a, r) => a + r.count, 0);
    const people = mine.reduce((a, r) => a + population("barrios", r.id), 0);
    const r = (n / people) * 1000;
    return {
      id: z.id,
      label: z.label,
      comunas: zonaCovers(z.id),
      count: n,
      population: people,
      rate: r,
      ratio: r / city,
      dearest: mine[0],
      calmest: mine[mine.length - 1],
    };
  }).sort((a, b) => b.rate - a.rate);
}

// ── The history ────────────────────────────────────────────────────────────

/** One year of the city series, for the time chart. */
export type YearRow = {
  year: number;
  count: number;
  rate: number;
};

/** The city, year by year, for one category. The rate uses the same 2022
 * population in every year — the series it is drawn against moved by 47 % over
 * the decade and the city's population by about 3 %, so an annually interpolated
 * denominator would add precision the reader can't see and a second estimate the
 * page would have to explain. */
export const history = (category: CategoryId = DEFAULT_CATEGORY): YearRow[] =>
  YEARS.map((year) => ({
    year,
    count: cityCount(category, year),
    rate: cityRate(category, year),
  }));

/** Change between two years of the city series, as a fraction. */
export function change(
  category: CategoryId,
  from: number,
  to = LAST_YEAR,
): number | null {
  const was = cityCount(category, from);
  return was === 0 ? null : cityCount(category, to) / was - 1;
}

/** The lowest and highest year of a category's city series. The pandemic floor
 * is the most striking thing in this dataset and it is never typed into prose:
 * it is looked up here. */
export function extremes(category: CategoryId = DEFAULT_CATEGORY): {
  low: YearRow;
  high: YearRow;
  last: YearRow;
} {
  const all = history(category);
  return {
    low: all.reduce((a, r) => (r.rate < a.rate ? r : a)),
    high: all.reduce((a, r) => (r.rate > a.rate ? r : a)),
    last: all[all.length - 1],
  };
}

/**
 * Share of robberies recorded with a motorcycle and with a firearm, by year.
 *
 * The two flags the source carries beyond the offence type, and the only series
 * on the page that is about *how* rather than *where*. Worth publishing because
 * it is the one thing in this dataset a reader cannot get anywhere else: the
 * motochorro is the most-discussed crime in Buenos Aires and this is the only
 * public count of how often a motorcycle actually appears in a robbery report.
 */
export const robos = (): {
  year: number;
  count: number;
  conMoto: number;
  conArma: number;
  shareMoto: number;
  shareArma: number;
}[] =>
  YEARS.map((year, i) => {
    const n = cityCount("robos", year);
    return {
      year,
      count: n,
      conMoto: DATA.robos.conMoto[i],
      conArma: DATA.robos.conArma[i],
      shareMoto: n === 0 ? 0 : DATA.robos.conMoto[i] / n,
      shareArma: n === 0 ? 0 : DATA.robos.conArma[i] / n,
    };
  });

// ── When ───────────────────────────────────────────────────────────────────

export const PERFIL_YEAR = DATA.perfil.year;

/** Events by hour of day, 0-23, as a share of the category's day — the latest
 * year only, city-wide. Shares rather than counts so two categories of very
 * different size can be drawn on one axis, which is the whole point of the
 * figure: robos and hurtos happen at different hours. */
export function byHour(category: CategoryId): { hour: number; share: number }[] {
  const ms = measuresOf(category);
  const counts = Array.from({ length: 24 }, (_, h) =>
    ms.reduce((a, m) => a + DATA.perfil.franja[m][h], 0),
  );
  const total = counts.reduce((a, b) => a + b, 0);
  return counts.map((n, hour) => ({ hour, share: total === 0 ? 0 : n / total }));
}

/** Events by day of week, Monday first, as a share of the category's week. */
export function byDay(category: CategoryId): { day: string; share: number }[] {
  const ms = measuresOf(category);
  const counts = DATA.perfil.dias.map((_, d) =>
    ms.reduce((a, m) => a + DATA.perfil.dia[m][d], 0),
  );
  const total = counts.reduce((a, b) => a + b, 0);
  return counts.map((n, i) => ({
    day: DIA_LABELS[i],
    share: total === 0 ? 0 : n / total,
  }));
}

/** The source writes days in caps and without accents; these are what a reader
 * sees. Written out in full because the only thing that reads them is a
 * sentence, not an axis. Positional, and checked against the file so a reordered
 * source can't silently relabel them. */
const DIA_LABELS = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
];

if (DATA.perfil.dias.length !== DIA_LABELS.length) {
  throw new Error(
    `delitos-caba.json: perfil.dias has ${DATA.perfil.dias.length} entries, expected ${DIA_LABELS.length}`,
  );
}

/** Events in the profile year whose hour the source left blank, as a share.
 * Quoted in the figure's note: the hourly shares are of the events that carry
 * an hour, not of all of them. */
export const SIN_FRANJA_SHARE =
  DATA.perfil.sinFranja /
  DATA.measures.reduce(
    (a, m) => a + DATA.ciudad[m][YEARS.indexOf(DATA.perfil.year)],
    0,
  );

// ── The colour scale ───────────────────────────────────────────────────────

/**
 * Upper bounds of the six shading classes, as multiples of the city rate.
 *
 * Fixed multiples rather than quantiles, and one scale for all eight maps.
 * Quantiles would repaint the city every refresh and make every category look
 * equally spread; multiples keep the middle of the scale — the two classes on
 * either side of 1× — pinned to the city average, which is the comparison a
 * reader is actually making when they look for their barrio.
 */
export const BREAKS = [0.7, 0.85, 1, 1.3, 2] as const;

// ── Formatting ─────────────────────────────────────────────────────────────

const NUMBER = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const ONE_DP = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
/** Fixed at two decimals rather than "up to two": these format the columns where
 * every cell is read against the one above it, and a column that reads 3,6 /
 * 1,02 / 1,5 makes the reader align decimal points by eye. */
const TWO_DP = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatCount = (value: number): string => NUMBER.format(value);

/** "38,9 cada 1.000 hab." — the unit is part of the string because the map
 * component prints it without knowing what it is. */
export const formatRate = (value: number): string =>
  `${ONE_DP.format(value)} cada 1.000 hab.`;

/** The same, abbreviated, for the map's table and tooltip: those print one of
 * these per row beside a column header that already names the unit, and the long
 * form there is 48 repetitions of "cada 1.000 hab." down a phone screen. Still
 * carries a unit, because the tooltip has no header above it. */
export const formatRateShort = (value: number): string =>
  `${ONE_DP.format(value)} c/1.000 hab.`;

/** The same figure without its unit, for a table with a unit in its header. */
export const formatRateBare = (value: number): string => ONE_DP.format(value);

/** "2,01×" — a rate as a multiple of the city's. */
export const formatRatio = (value: number): string =>
  `${TWO_DP.format(value)}×`;

export const formatPct = (fraction: number): string =>
  `${fraction > 0 ? "+" : ""}${ONE_DP.format(fraction * 100)} %`;

export const formatShare = (fraction: number): string =>
  `${TWO_DP.format(fraction * 100)} %`;

/** Homicide, and only homicide, in the unit everyone quotes it in. */
export const formatPer100k = (count: number, people: number): string =>
  `${TWO_DP.format((count / people) * 100_000)} cada 100.000 hab.`;

/** The legend, lowest class first. Written as multiples of the city average,
 * which is what the shading means. */
export const LEGEND: { label: string }[] = [
  { label: `menos de ${TWO_DP.format(BREAKS[0])}×` },
  ...BREAKS.slice(1).map((b, i) => ({
    label: `${TWO_DP.format(BREAKS[i])}–${TWO_DP.format(b)}×`,
  })),
  { label: `${TWO_DP.format(BREAKS[BREAKS.length - 1])}× o más` },
];

/** No region is ever without a figure in this dataset, so the map's hatched
 * class never appears. The label exists because the component requires one. */
export const NO_DATA = "Sin dato";

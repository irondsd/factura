import {
  PARTIDOS,
  partidoLabel,
  PRICED,
  PRICED_IDS,
  ZONAS,
} from "@/content/shared/pba";
import raw from "./suelo-pba.json";
import {
  LAST_UPDATED as VENTA_UPDATED,
  value as ventaValue,
} from "./venta-pba";

// The Observatorio de Valores de Suelo's relevamiento of **land** prices across
// the Provincia de Buenos Aires, aggregated per partido by
// `scripts/fetch-pba-suelo.ts`.
//
// It is the only official, province-wide price per square metre that exists,
// and it is read by two pages that treat it very differently:
//
//   • /estadisticas/precio-m2-terreno-provincia-buenos-aires — its own page.
//     The whole province is the subject there: the map shades all 135 partidos,
//     and everything below beyond `interior()` exists for it.
//   • /estadisticas/precio-m2-provincia-buenos-aires — one section near the
//     end, `SueloPbaInterior`, answering "and what about the rest of the
//     province" for a page whose own series stops at the conurbano.
//
// ── The thing that must never be lost in a caption ────────────────────────
// It prices **terreno**, not built space. A square metre of land in Tandil is
// USD 56; a square metre of apartment in the conurbano is USD 1.500. They are
// not the same measure and neither is a discount on the other — a reader who
// takes one for the other concludes the interior is thirty times cheaper than
// it is. Every component that renders these figures says "terreno" in the
// figure's own heading, not only in a note below it.
//
// It is also **not a series**. 18.042 samples taken between 2021-06 and
// 2024-03, one observation per parcel, never repeated. There is no "latest
// month", nothing here can be compared with anything a year earlier, and the
// vintage is old enough that it belongs on the figure rather than in the small
// print.
//
// A fuller write-up, and the plan for the page that will publish this properly
// rather than as one section, is in `.claude/terreno-m2.md`.
//
// ── Refreshing ─────────────────────────────────────────────────────────────
//   bun run data:suelo
// Effectively never: the relevamiento has not been extended since 2024. Running
// it checks whether that changed.

type Entry = {
  /** Samples surviving the lot-size cut. */
  n: number;
  /** Samples before it, so the cut is auditable from the data. */
  nRaw: number;
  /** Median USD per m² of land, or `null` where `n` is under the threshold. */
  usdM2: number | null;
  p25: number;
  p75: number;
  supMedian: number;
  /** Median asking price of a whole lot, in USD. Its own median of the asking
   * prices, not `usdM2 × supMedian` — see the script. `null` on the same
   * threshold as `usdM2`. */
  priceMedian: number | null;
  from: string;
  to: string;
};

const DATA = raw as unknown as {
  partidos: Record<string, Entry>;
  provincial: number;
  provincialLot: number;
  provincialSup: number;
  source: string;
  sourceUrl: string;
  sourceNote: string;
  unit: string;
  method: { maxSupM2: number; minSamples: number; statistic: string };
  coverage: {
    samplesTotal: number;
    samplesUrban: number;
    partidosWithSamples: number;
    partidosWithFigure: number;
    partidosTotal: number;
    from: string;
    to: string;
  };
};

export const SOURCE = DATA.source;
export const SOURCE_URL = DATA.sourceUrl;
export const SOURCE_NOTE = DATA.sourceNote;
export const METHOD = DATA.method;
export const COVERAGE = DATA.coverage;

/** Median across every urban-scale parcel in the province. */
export const PROVINCIAL = DATA.provincial;

/** The same parcels, priced whole: the median asking price and the median
 * surface. `PROVINCIAL_LOT` is not `PROVINCIAL × PROVINCIAL_SUP` and is not
 * meant to be — each is the median of its own column. */
export const PROVINCIAL_LOT = DATA.provincialLot;
export const PROVINCIAL_SUP = DATA.provincialSup;

export type Row = {
  id: string;
  label: string;
  usdM2: number | null;
  n: number;
  p25: number;
  p75: number;
  supMedian: number;
  priceMedian: number | null;
  /** True where this partido also has an apartment price on this page, which is
   * what lets the two be shown side by side. */
  priced: boolean;
};

const PRICED_SET = new Set<string>(PRICED_IDS);

const row = (id: string): Row | null => {
  const e = DATA.partidos[id];
  if (!e) return null;
  return {
    id,
    label: partidoLabel(id),
    usdM2: e.usdM2,
    n: e.n,
    p25: e.p25,
    p75: e.p75,
    supMedian: e.supMedian,
    priceMedian: e.priceMedian,
    priced: PRICED_SET.has(id),
  };
};

/** Every partido with a published median, dearest first. */
export function ranked(): Row[] {
  return PARTIDOS.map((p) => row(p.id))
    .filter((r): r is Row => r !== null && r.usdM2 !== null)
    .sort((a, b) => (b.usdM2 as number) - (a.usdM2 as number));
}

export const find = (id: string): Row | null => row(id);

/**
 * The interior partidos worth naming on a page whose own series stops at the
 * conurbano — the cities a reader outside Greater Buenos Aires would look for.
 *
 * A hand-picked list rather than "the top N by sample count", because the
 * question this answers is "is my city here", and the answer has to be the same
 * next refresh. Every one of these clears the sample threshold; the module
 * throws below if one stops doing so, which is the signal to reword the section
 * rather than to quietly drop a row.
 */
export const INTERIOR = [
  "general-pueyrredon",
  "bahia-blanca",
  "tandil",
  "junin",
  "pergamino",
  "olavarria",
  "necochea",
  "zarate",
  "campana",
  "lujan",
  "pinamar",
  "villa-gesell",
] as const;

export function interior(): Row[] {
  return INTERIOR.map((id) => {
    const r = row(id);
    if (!r || r.usdM2 === null) {
      throw new Error(
        `suelo-pba: ${id} no longer has a published median (samples ${r?.n ?? 0}, threshold ${METHOD.minSamples}). Reword the interior section rather than dropping the row silently.`,
      );
    }
    return r;
  }).sort((a, b) => (b.usdM2 as number) - (a.usdM2 as number));
}

const NUMBER = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

export const formatUsd = (value: number): string =>
  `US$ ${NUMBER.format(Math.round(value))}`;

/** "2021 y 2024" — the vintage, for a sentence. */
export const VINTAGE = `${COVERAGE.from.slice(0, 4)} y ${COVERAGE.to.slice(0, 4)}`;

export const TEMPORAL_COVERAGE = `${COVERAGE.from}/${COVERAGE.to}`;

// ── The province page ──────────────────────────────────────────────────────
// Everything below is read by /estadisticas/precio-m2-terreno-provincia-buenos-aires
// and by nothing else. `interior()` above predates it and belongs to the other
// page; the two lists overlap on purpose and are not merged, because they
// answer different questions — that one is "is my city here" on a page about
// the conurbano, this one is the province's own geography.

/** Every partido in the province, in registry order, whether or not it has a
 * figure — the map draws all 135 and stripes the ones it cannot shade, which is
 * the point of putting this dataset on a map at all. */
export function all(): Row[] {
  return PARTIDOS.map((p) => row(p.id) ?? blank(p.id));
}

/** A partido the relevamiento never visited. Not the same thing as one it
 * visited too few times, and the difference survives into the table: this row
 * says "sin muestras", the thin one says how many it has. */
const blank = (id: string): Row => ({
  id,
  label: partidoLabel(id),
  usdM2: null,
  n: 0,
  p25: 0,
  p75: 0,
  supMedian: 0,
  priceMedian: null,
  priced: PRICED_SET.has(id),
});

/**
 * Shading classes, in dollars per m² of land.
 *
 * Not evenly spaced, because the province is not: the 74 published medians run
 * 20 to 870 and are strongly bimodal — the interior sits between 20 and 100 and
 * the built-up conurbano between 150 and 870, with almost nothing in the middle.
 * Linear steps would put two thirds of the province in one shade and leave two
 * classes empty. These five bounds split it 22 · 17 · 13 · 7 · 10 · 5.
 */
export const BREAKS = [45, 70, 110, 200, 450] as const;

export const LEGEND: { label: string }[] = [
  { label: `menos de ${NUMBER.format(BREAKS[0])}` },
  ...BREAKS.slice(1).map((b, i) => ({
    label: `${NUMBER.format(BREAKS[i])} – ${NUMBER.format(b)}`,
  })),
  { label: `${NUMBER.format(BREAKS[BREAKS.length - 1])} o más` },
];

export const NO_DATA = "Sin dato";

export const display = (value: number | null): string | null =>
  value === null ? null : formatUsd(value);

/** The two extremes of the published figures and how far apart they are, for
 * the line under the map's heading. Derived rather than written down: a refresh
 * that adds a partido can change either end. */
export function extremes(): { top: Row; bottom: Row; ratio: number } {
  const order = ranked();
  const top = order[0];
  const bottom = order[order.length - 1];
  return {
    top,
    bottom,
    ratio: (top.usdM2 as number) / (bottom.usdM2 as number),
  };
}

/** How much of the map can be shaded, split by *why* the rest cannot. The two
 * reasons are different failures and a coverage note that merges them is
 * telling half the truth: 20 partidos the relevamiento never reached, and 41 it
 * reached too thinly to publish a median for. */
export function coverage(): {
  withFigure: number;
  thin: number;
  absent: number;
  total: number;
} {
  const rows = all();
  const withFigure = rows.filter((r) => r.usdM2 !== null).length;
  const absent = rows.filter((r) => r.n === 0).length;
  return {
    withFigure,
    thin: rows.length - withFigure - absent,
    absent,
    total: rows.length,
  };
}

/**
 * The cities the lot table names, grouped the way somebody looking for land
 * actually thinks about the province: the coast, the interior cities, and the
 * ring around the metropolis where a plot is still a plot.
 *
 * Hand-picked and fixed, like `INTERIOR` and for the same reason — the question
 * is "is the place I am thinking of here", and the answer must not depend on
 * which partidos happened to be sampled hardest. `lotes()` throws if one falls
 * below the publication threshold rather than dropping the row quietly.
 */
export const LOTE_GROUPS = [
  {
    id: "costa",
    label: "La costa atlántica",
    ids: [
      "pinamar",
      "villa-gesell",
      "general-pueyrredon",
      "la-costa",
      "mar-chiquita",
      "monte-hermoso",
      "general-alvarado",
      "necochea",
    ],
  },
  {
    id: "interior",
    label: "Las ciudades del interior",
    ids: [
      "tandil",
      "bahia-blanca",
      "la-plata",
      "junin",
      "pergamino",
      "olavarria",
      "san-nicolas",
      "mercedes",
      "tres-arroyos",
      "trenque-lauquen",
    ],
  },
  {
    id: "corona",
    label: "El borde del área metropolitana",
    ids: [
      "pilar",
      "escobar",
      "campana",
      "zarate",
      "lujan",
      "general-rodriguez",
      "canuelas",
      "san-vicente",
      "brandsen",
    ],
  },
] as const;

export type LoteGroup = {
  id: string;
  label: string;
  rows: (Row & { priceMedian: number })[];
};

export function lotes(): LoteGroup[] {
  return LOTE_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    rows: g.ids
      .map((id) => {
        const r = row(id);
        if (!r || r.usdM2 === null || r.priceMedian === null) {
          throw new Error(
            `suelo-pba: ${id} no longer has a published lot price (samples ${r?.n ?? 0}, threshold ${METHOD.minSamples}). Reword the group rather than dropping the row silently.`,
          );
        }
        return r as Row & { priceMedian: number };
      })
      .sort((a, b) => b.priceMedian - a.priceMedian),
  }));
}

// ── Land against built space ───────────────────────────────────────────────

/**
 * The 27 partidos that have both a land price here and an apartment price in
 * `venta-pba`, and the ratio between them.
 *
 * The ratio is the whole point of the figure and it is not a discount: it is
 * how many square metres of land one square metre of finished apartment buys,
 * which is a reading of how much is built on each plot. Three and a half in
 * Vicente López, where every lot carries a tower; twenty-four in Pilar, where a
 * lot carries a house. Nobody publishes that number, and it falls out of
 * putting the province's two price datasets side by side.
 *
 * ── The caveat that has to travel with it ─────────────────────────────────
 * **The two sides are not contemporaneous.** The land figures were relevados
 * between 2021 and 2024 and the apartment figures are last month's. A ratio
 * built out of two different years is a statement about *structure* — density,
 * how much floor space a plot carries — and not about today's market, and the
 * component that renders it says so on the figure rather than in the small
 * print. Sorted by the ratio, never by either price, so nothing on screen
 * invites reading the two columns as one series.
 */
/** The month the apartment half of `contraste()` comes from. It has to be on
 * the figure: it is four to five years newer than the land half, and a reader
 * who assumes one date for both columns reads a density ratio as a discount. */
export const VENTA_LAST_UPDATED = VENTA_UPDATED;

export type ContrasteRow = {
  id: string;
  label: string;
  zonaLabel: string;
  terreno: number;
  departamento: number;
  ratio: number;
};

export function contraste(): ContrasteRow[] {
  const out: ContrasteRow[] = [];
  for (const p of PRICED) {
    const land = row(p.id);
    const flat = ventaValue(p.id, "usd");
    if (!land || land.usdM2 === null || flat === null) continue;
    out.push({
      id: p.id,
      label: p.label,
      zonaLabel: ZONAS.find((z) => z.id === p.zona)!.label,
      terreno: land.usdM2,
      departamento: flat,
      ratio: flat / land.usdM2,
    });
  }
  return out.sort((a, b) => a.ratio - b.ratio);
}

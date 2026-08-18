import { PARTIDOS, partidoLabel, PRICED_IDS } from "@/content/shared/pba";
import raw from "./suelo-pba.json";

// The Observatorio de Valores de Suelo's relevamiento of **land** prices across
// the Provincia de Buenos Aires, aggregated per partido by
// `scripts/fetch-pba-suelo.ts`.
//
// On /estadisticas/precio-m2-provincia-buenos-aires this is the secondary
// figure, and it is here for one reason: it is the only official, province-wide
// price per square metre that exists. The page's own series covers 27 partidos
// because that is all a listings portal prices; this covers 115, including
// every interior city — and it is the honest answer to "and what about the rest
// of the province".
//
// ── The thing that must never be lost in a caption ────────────────────────
// It prices **terreno**, not built space. A square metre of land in Tandil is
// USD 53; a square metre of apartment in the conurbano is USD 1.500. They are
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
  from: string;
  to: string;
};

const DATA = raw as unknown as {
  partidos: Record<string, Entry>;
  provincial: number;
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

export type Row = {
  id: string;
  label: string;
  usdM2: number | null;
  n: number;
  p25: number;
  p75: number;
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

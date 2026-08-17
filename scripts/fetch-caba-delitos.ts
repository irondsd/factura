#!/usr/bin/env bun
/**
 * Rebuilds the crime dataset behind /estadisticas/delitos-caba:
 *
 *   src/content/estadisticas/data/delitos-caba.json
 *
 * Run: `bun scripts/fetch-caba-delitos.ts`   (or `npm run data:delitos`)
 *      `--dry-run`   parse and report without writing
 *
 * Four sources, joined on the city's 48 barrios and 15 comunas:
 *
 *   Mapa del Delito   one CSV per year, one row per reported event, with the
 *                     barrio and comuna it happened in. ~1,4 M rows over ten
 *                     years, which is why nothing downstream ever sees a row:
 *                     this script counts them and writes the counts.
 *   Población 2010    the city's own barrio-level census figures, used only to
 *                     split each comuna's 2022 population across its barrios.
 *                     See `barrioPopulation` for why that is an estimate and
 *                     what it can and cannot support.
 *   Barrios           the boundary file's own surface per barrio, in m².
 *   Censo 2022        INDEC's definitive population and surface by comuna — the
 *                     denominator, without which a map shaded by counts is a map
 *                     of where people are. The one source transcribed rather
 *                     than downloaded; see `CENSO_2022` for why.
 *
 * The Mapa del Delito is published once a year, a few months after the year
 * closes, so this runs about annually. Run it, read the summary it prints, and
 * commit the diff.
 *
 * ── Why a script and not a hand-append ────────────────────────────────────
 * The house rule for this directory (`AUTHORING.md` §6) is that a data file is
 * "the thing a human appends to each month". That rule assumes a published
 * table someone can retype. There is no published table here: the source ships
 * raw incidents, and every number on the page — 48 barrios × 9 offence types ×
 * 10 years — is an aggregate this script computes. Retyping is not an option,
 * and neither is trusting a one-off notebook nobody can re-run next year.
 *
 * ── Why the URLs are discovered rather than hardcoded ─────────────────────
 * Same reason as the IDECBA scripts, with a better handle: Buenos Aires Data
 * runs CKAN, so the *dataset* names below are the stable identifiers and the
 * current file URL for each resource is looked up through the API on every run.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BARRIOS,
  COMUNA_IDS,
  findBarrio,
} from "../src/content/estadisticas/data/caba";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(here, "../src/content/estadisticas/data");
const TARGET = path.join(DATA_DIR, "delitos-caba.json");

const CKAN = "https://data.buenosaires.gob.ar/api/3/action";

/** The CKAN dataset holding one CSV per year of the Mapa del Delito. */
const DELITOS = "delitos";

/** The CKAN dataset holding the barrio boundaries — and, filed beside them, the
 * city's barrio-level population figures from the 2010 census. */
const BARRIOS_DATASET = "barrios";

/**
 * Population and surface of the 15 comunas: INDEC, Censo Nacional de Población,
 * Hogares y Viviendas 2022, resultados definitivos, cuadro 2.1 — "Total de
 * población y densidad, por superficie, según comuna".
 *
 *   https://censo.gob.ar/wp-content/uploads/2023/11/c2022_caba_est_c2_1.xlsx
 *
 * ── Why this is transcribed and not fetched ───────────────────────────────
 * Everything else in this script is downloaded, and the reason this isn't comes
 * in two parts. The first is that censo.gob.ar serves an incomplete certificate
 * chain: it omits the Sectigo intermediate, so `fetch` refuses it on any machine
 * whose trust store hasn't cached that certificate from somewhere else. curl on
 * a Mac happens to succeed and Bun, Node and CI all fail, which is the worst
 * shape a dependency can have — it works for whoever writes it and for nobody
 * else.
 *
 * The second is that it would buy nothing. This is a census: thirty numbers,
 * definitive since November 2023, and the next thing that will change them is
 * the 2032 count. A yearly crime refresh should not be able to fail on them.
 *
 * The transcription is checked two ways below, against the two totals INDEC
 * prints in the same cuadro.
 */
const CENSO_2022: Record<number, { poblacion: number; km2: number }> = {
  1: { poblacion: 223_554, km2: 17.9 },
  2: { poblacion: 161_645, km2: 6.3 },
  3: { poblacion: 196_240, km2: 6.4 },
  4: { poblacion: 229_240, km2: 22.7 },
  5: { poblacion: 194_271, km2: 6.7 },
  6: { poblacion: 203_043, km2: 6.9 },
  7: { poblacion: 215_896, km2: 12.4 },
  8: { poblacion: 204_367, km2: 22.5 },
  9: { poblacion: 169_063, km2: 16.6 },
  10: { poblacion: 173_004, km2: 12.6 },
  11: { poblacion: 204_601, km2: 14.1 },
  12: { poblacion: 236_887, km2: 15.7 },
  13: { poblacion: 264_385, km2: 15.0 },
  14: { poblacion: 248_635, km2: 15.9 },
  15: { poblacion: 196_876, km2: 14.3 },
};

/** The two city totals printed in the same cuadro. The comuna figures are
 * rounded to a tenth of a km², so their sum lands a tenth over the published
 * surface — the tolerance is for that and nothing else. */
const CENSO_TOTAL = 3_121_707;
const CENSO_KM2 = 205.9;

/** Years to read. The Mapa del Delito starts in 2016; the newest year appears a
 * few months after it closes, and a year that isn't published yet is skipped
 * with a note rather than failing the run. */
const FIRST_YEAR = 2016;

// ── The offence taxonomy ───────────────────────────────────────────────────

/**
 * `tipo|subtipo` from the source → the series it is counted into.
 *
 * Exhaustive on purpose: a pair that isn't listed stops the run. The source has
 * reorganised this taxonomy once already inside the span this file covers —
 * "Femicidios" was a published subtype through 2022 and disappears from 2023,
 * folded back into homicidios dolosos — and it did so without any announcement
 * the data carries. A silent new category would otherwise land as a hole in
 * every total on the page.
 *
 * Femicidios is mapped onto `homicidios` here rather than kept as its own
 * series, which is the one editorial decision in this table. Kept separate it
 * would read as zero from 2023 on, and a zero that means "no longer published
 * separately" sitting in a column of counts is the worst kind of wrong number.
 * Folded in, `homicidios` means the same thing in all ten years.
 */
const SUBTIPOS: Record<string, MeasureId> = {
  "Robo|Robo total": "robo",
  "Robo|Robo automotor": "roboAutomotor",
  "Hurto|Hurto total": "hurto",
  "Hurto|Hurto automotor": "hurtoAutomotor",
  "Lesiones|Lesiones Dolosas": "lesiones",
  "Amenazas|Amenazas": "amenazas",
  "Homicidios|Homicidios dolosos": "homicidios",
  "Homicidios|Femicidios": "homicidios",
  "Vialidad|Lesiones por siniestros viales": "lesionesViales",
  "Vialidad|Muertes por siniestros viales": "muertesViales",
};

/** The nine series stored per region per year. Everything the page shows is a
 * sum of these — the groupings live in the data module, next to the labels that
 * name them, not here. */
const MEASURES = [
  "robo",
  "roboAutomotor",
  "hurto",
  "hurtoAutomotor",
  "lesiones",
  "amenazas",
  "homicidios",
  "lesionesViales",
  "muertesViales",
] as const;

type MeasureId = (typeof MEASURES)[number];

type Counts = Record<MeasureId, number>;

const zero = (): Counts =>
  Object.fromEntries(MEASURES.map((m) => [m, 0])) as Counts;

// ── Reading the incident files ─────────────────────────────────────────────

/** One year's aggregates. Everything here is a count of rows. */
type Year = {
  year: number;
  rows: number;
  ciudad: Counts;
  barrios: Map<string, Counts>;
  comunas: Map<number, Counts>;
  /** Events the source could not place in a barrio — its own "NULL". Counted
   * into `ciudad` (they happened in the city) and into no region, so the two
   * disagree by exactly this much. Published so that gap is checkable rather
   * than mysterious. */
  sinBarrio: Counts;
  /** Robberies recorded with a firearm and with a motorcycle, city-wide. The
   * two flags the source carries beyond the offence type. */
  roboConArma: number;
  roboConMoto: number;
  /** City-wide counts by hour of day, 0-23, per series. */
  franja: Record<MeasureId, number[]>;
  /** Same, by day of week, Monday first. */
  dia: Record<MeasureId, number[]>;
  /** Events whose hour the source left as "NULL". */
  sinFranja: number;
  /** Events placed in a barrio, for the tolerance below. */
  placed: number;
  /** Events whose `comuna` column disagrees with the comuna the boundary file
   * puts their barrio in. A handful per decade — see `MISPLACED_SHARE`. */
  misplaced: number;
};

/**
 * How much barrio/comuna disagreement to tolerate before stopping.
 *
 * The two columns are filled independently upstream, and across 1,35 M events
 * they disagree six times — a Colegiales filed under Comuna 15, a Paternal under
 * Comuna 11, two rows with no comuna at all. That is data entry, not a
 * disagreement about geography, and the barrio registry wins because it is what
 * every other dataset in this directory is joined on.
 *
 * The tolerance exists so that a *systematic* divergence still stops the run:
 * if the comunas were ever redrawn, or the source started filing barrios under
 * some other unit, the mismatch would be thousands of rows rather than one.
 */
const MISPLACED_SHARE = 0.001;
const MISPLACED_FLOOR = 25;

/** Day names as the source writes them, in the order the page reads them. */
const DIAS = [
  "LUNES",
  "MARTES",
  "MIERCOLES",
  "JUEVES",
  "VIERNES",
  "SABADO",
  "DOMINGO",
];

/**
 * A quoted-CSV reader, yielding one array of fields per line.
 *
 * These files are ~20 MB each and every field is quoted, so `split(",")` is
 * wrong and a streaming parser is overkill: the whole file already fits in
 * memory as the string `fetch` handed over. Handles quotes, doubled quotes
 * inside them, and CRLF, which is everything this source uses.
 */
function* csvRows(text: string): Generator<string[]> {
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') {
        field += c;
      } else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
      }
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      // A trailing blank line is a line with one empty field, not a record.
      if (row.length > 1 || row[0] !== "") yield row;
      row = [];
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") yield row;
  }
}

/** The columns this script reads, by the header names the source uses. Read by
 * name rather than by position: the files are wide, the order has been stable,
 * and a reorder would otherwise silently swap barrio for comuna. */
const COLUMNS = [
  "anio",
  "mes",
  "dia",
  "franja",
  "tipo",
  "subtipo",
  "uso_arma",
  "uso_moto",
  "barrio",
  "comuna",
  "cantidad",
] as const;

function parseYear(year: number, text: string): Year {
  const lines = csvRows(text);
  const header = lines.next();
  if (header.done) throw new Error(`delitos_${year}.csv: empty file`);
  const at: Record<string, number> = {};
  for (const name of COLUMNS) {
    const i = header.value.indexOf(name);
    if (i < 0) {
      throw new Error(
        `delitos_${year}.csv: no "${name}" column. Header is: ${header.value.join(", ")}`,
      );
    }
    at[name] = i;
  }

  const out: Year = {
    year,
    rows: 0,
    ciudad: zero(),
    barrios: new Map(BARRIOS.map((b) => [b.id, zero()])),
    comunas: new Map(COMUNA_IDS.map((c) => [c, zero()])),
    sinBarrio: zero(),
    roboConArma: 0,
    roboConMoto: 0,
    franja: Object.fromEntries(
      MEASURES.map((m) => [m, Array(24).fill(0)]),
    ) as Record<MeasureId, number[]>,
    dia: Object.fromEntries(
      MEASURES.map((m) => [m, Array(7).fill(0)]),
    ) as Record<MeasureId, number[]>,
    sinFranja: 0,
    placed: 0,
    misplaced: 0,
  };

  for (const row of lines) {
    const anio = row[at.anio];
    if (anio !== String(year)) {
      throw new Error(
        `delitos_${year}.csv: a row dated ${JSON.stringify(anio)}. The file mixes years, which every count here assumes it does not.`,
      );
    }
    const key = `${row[at.tipo]}|${row[at.subtipo]}`;
    const measure = SUBTIPOS[key];
    if (!measure) {
      throw new Error(
        `delitos_${year}.csv: unknown offence ${JSON.stringify(key)}. The source has changed its taxonomy — add it to SUBTIPOS, and check whether the groupings in data/delitos-caba.ts still describe what they claim.`,
      );
    }
    // The column exists and has been 1 in every row of every year so far, but it
    // is the source's own multiplier and reading it costs nothing.
    const n = Number(row[at.cantidad] || 1);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(
        `delitos_${year}.csv: cantidad ${JSON.stringify(row[at.cantidad])}`,
      );
    }
    out.rows += n;
    out.ciudad[measure] += n;

    const name = row[at.barrio].trim();
    if (name === "NULL" || name === "") {
      out.sinBarrio[measure] += n;
    } else {
      const barrio = findBarrio(name);
      if (!barrio) {
        throw new Error(
          `delitos_${year}.csv: unknown barrio ${JSON.stringify(name)}. Add it to the \`aka\` list of the right entry in data/caba.ts.`,
        );
      }
      // The comuna is taken from the barrio registry rather than from the file's
      // own `comuna` column: one of the two has to win, and the registry is what
      // every other dataset in this directory is joined on. How often they
      // disagree is counted, and checked against MISPLACED_SHARE below.
      out.placed += n;
      if (Number(row[at.comuna]) !== barrio.comuna) out.misplaced += n;
      out.barrios.get(barrio.id)![measure] += n;
      out.comunas.get(barrio.comuna)![measure] += n;
    }

    if (measure === "robo" || measure === "roboAutomotor") {
      if (row[at.uso_arma] === "SI") out.roboConArma += n;
      if (row[at.uso_moto] === "SI") out.roboConMoto += n;
    }

    const hour = Number(row[at.franja]);
    if (row[at.franja] === "NULL" || !Number.isInteger(hour))
      out.sinFranja += n;
    else if (hour < 0 || hour > 23) {
      throw new Error(`delitos_${year}.csv: franja horaria ${hour}`);
    } else out.franja[measure][hour] += n;

    const day = DIAS.indexOf(row[at.dia]);
    if (day < 0) {
      throw new Error(
        `delitos_${year}.csv: unknown day ${JSON.stringify(row[at.dia])}`,
      );
    }
    out.dia[measure][day] += n;
  }

  const allowed = Math.max(MISPLACED_FLOOR, out.placed * MISPLACED_SHARE);
  if (out.misplaced > allowed) {
    throw new Error(
      `delitos_${year}.csv: ${out.misplaced} of ${out.placed} located events are filed under a comuna that doesn't contain their barrio. That is past the tolerance for data entry (${Math.round(allowed)}), so the two files probably no longer describe the same geography — re-check data/caba.ts against the boundary file.`,
    );
  }

  return out;
}

// ── Population ─────────────────────────────────────────────────────────────

/** The 15 comunas of `CENSO_2022`, checked against INDEC's own city totals — the
 * two figures that catch a transcription slip, since a mistyped digit in any one
 * comuna moves one of the two sums. */
function censo(): Record<number, { poblacion: number; km2: number }> {
  const missing = COMUNA_IDS.filter((c) => !CENSO_2022[c]);
  if (missing.length) {
    throw new Error(`censo: no figures for comuna ${missing.join(", ")}`);
  }
  const rows = COMUNA_IDS.map((c) => CENSO_2022[c]);
  const total = rows.reduce((a, r) => a + r.poblacion, 0);
  if (total !== CENSO_TOTAL) {
    throw new Error(
      `censo: the 15 comunas sum to ${total}, but INDEC publishes ${CENSO_TOTAL} for the city.`,
    );
  }
  const km2 = rows.reduce((a, r) => a + r.km2, 0);
  if (Math.abs(km2 - CENSO_KM2) > 0.25) {
    throw new Error(
      `censo: the 15 comunas cover ${km2.toFixed(1)} km², but INDEC publishes ${CENSO_KM2}.`,
    );
  }
  return CENSO_2022;
}

/**
 * Population per barrio: the *only* estimate in this file, and the reason it is
 * one is worth stating plainly, because everything the page says about a barrio
 * rests on it.
 *
 * A barrio is not a census unit. INDEC counts people by radio and publishes by
 * comuna, and neither it nor IDECBA publishes a barrio-level figure for 2022 —
 * the last official one is the city's own tabulation of the 2010 census. So
 * each comuna's 2022 population is split across its barrios in the proportions
 * the 2010 count found:
 *
 *     pob(barrio) = pob2010(barrio) × pob2022(comuna) / pob2010(comuna)
 *
 * What that buys: every comuna total is exactly INDEC's, so the comuna map — the
 * one the page leads with — is built on published figures alone, and the barrio
 * map is built on published figures plus one assumption.
 *
 * What it assumes: that a barrio's share *of its own comuna* held between 2010
 * and 2022. Across the city the comuna totals moved by between −2 % and +18 %,
 * so the assumption is not heroic, but it fails wherever one barrio grew very
 * differently from its neighbours — Puerto Madero above all, which was still
 * being built in 2010 and is scaled here by the whole of Comuna 1. Its
 * population is understated and its rate correspondingly overstated, and the
 * page says so where the barrio appears.
 */
function barrioPopulation(
  pob2010: Map<string, number>,
  comunas: Record<number, { poblacion: number }>,
): Map<string, number> {
  const comuna2010 = new Map<number, number>();
  for (const b of BARRIOS) {
    const p = pob2010.get(b.id);
    if (p === undefined) throw new Error(`pob2010: no figure for ${b.id}`);
    comuna2010.set(b.comuna, (comuna2010.get(b.comuna) ?? 0) + p);
  }

  const out = new Map<string, number>();
  for (const c of COMUNA_IDS) {
    const base = comuna2010.get(c)!;
    const target = comunas[c].poblacion;
    // Distributed by largest remainder so the barrios of a comuna sum to the
    // comuna's published population exactly, rather than to within a rounding
    // error that a reader adding up the table would find.
    const mine = BARRIOS.filter((b) => b.comuna === c);
    const exact = mine.map((b) => (pob2010.get(b.id)! * target) / base);
    const floors = exact.map(Math.floor);
    let left = target - floors.reduce((a, b) => a + b, 0);
    const order = exact
      .map((v, i) => ({ i, frac: v - Math.floor(v) }))
      .sort((a, b) => b.frac - a.frac);
    for (const { i } of order) {
      if (left <= 0) break;
      floors[i]++;
      left--;
    }
    mine.forEach((b, i) => out.set(b.id, floors[i]));
  }
  return out;
}

// ── Discovery ──────────────────────────────────────────────────────────────

const get = async (url: string, timeout = 120_000): Promise<Response> => {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res;
};

/** Every CSV resource of a CKAN dataset, by the file's basename. */
async function resources(dataset: string): Promise<Map<string, string>> {
  const body = (await (
    await get(`${CKAN}/package_show?id=${dataset}`, 45_000)
  ).json()) as {
    success: boolean;
    result?: { resources: { url: string; format: string }[] };
  };
  if (!body.success || !body.result) {
    throw new Error(
      `Buenos Aires Data has no dataset "${dataset}" any more. Check https://data.buenosaires.gob.ar/dataset/${dataset}.`,
    );
  }
  const out = new Map<string, string>();
  for (const r of body.result.resources) {
    if (!/\.csv($|\?)/i.test(r.url)) continue;
    out.set(
      r.url
        .split("/")
        .pop()!
        .replace(/\.csv$/i, ""),
      r.url,
    );
  }
  return out;
}

/** A two-column CSV as a map, keyed by barrio id. Used for the 2010 population
 * file, whose only columns are BARRIO and POBLACION. */
function barrioCsv(text: string, file: string): Map<string, number> {
  const rows = [...csvRows(text)];
  const header = rows[0].map((h) => h.trim().replace(/^﻿/, ""));
  const name = header.findIndex((h) => /^barrio$/i.test(h));
  const value = header.findIndex((h) => /^poblacion$/i.test(h));
  if (name < 0 || value < 0) {
    throw new Error(`${file}: expected BARRIO and POBLACION, got ${header}`);
  }
  const out = new Map<string, number>();
  for (const row of rows.slice(1)) {
    const barrio = findBarrio(row[name]);
    if (!barrio) throw new Error(`${file}: unknown barrio ${row[name]}`);
    out.set(barrio.id, Number(row[value]));
  }
  if (out.size !== BARRIOS.length) {
    throw new Error(`${file}: ${out.size} barrios, expected ${BARRIOS.length}`);
  }
  return out;
}

// ── Output ─────────────────────────────────────────────────────────────────

/** JSON with each series on one line, so a yearly refresh is a readable diff
 * rather than ten thousand changed lines. */
function format(data: unknown): string {
  const json = JSON.stringify(data, null, 2);
  return `${json.replace(
    /\[\n\s+((?:[^[\]{}]|\n)*?)\n\s+\]/g,
    (_, body: string) => `[${body.trim().replace(/\s*\n\s*/g, " ")}]`,
  )}\n`;
}

const int = (n: number): string => Math.round(n).toLocaleString("es-AR");

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  console.log("discovering current file URLs…");
  const [delitos, barriosIndex] = await Promise.all([
    resources(DELITOS),
    resources(BARRIOS_DATASET),
  ]);

  // ── The incident files ───────────────────────────────────────────────────
  const years: Year[] = [];
  for (let year = FIRST_YEAR; ; year++) {
    const url = delitos.get(`delitos_${year}`);
    if (!url) {
      if (year === FIRST_YEAR) {
        throw new Error(
          `Buenos Aires Data lists no delitos_${FIRST_YEAR}.csv. The dataset has been restructured — see https://data.buenosaires.gob.ar/dataset/delitos.`,
        );
      }
      console.log(`  ${year} not published yet — stopping`);
      break;
    }
    const text = await (await get(url)).text();
    const parsed = parseYear(year, text);
    years.push(parsed);
    console.log(
      `  ${year}  ${int(parsed.rows).padStart(9)} events  (${(text.length / 1e6).toFixed(0)} MB)`,
    );
  }

  // ── Population ───────────────────────────────────────────────────────────
  const comunas = censo();

  const pobUrl = barriosIndex.get("caba_pob_barrios_2010");
  if (!pobUrl) {
    throw new Error(
      `The "barrios" dataset no longer lists caba_pob_barrios_2010.csv. Check https://data.buenosaires.gob.ar/dataset/barrios.`,
    );
  }
  const pob2010 = barrioCsv(
    await (await get(pobUrl)).text(),
    "caba_pob_barrios_2010.csv",
  );
  const barrioPob = barrioPopulation(pob2010, comunas);

  // ── Assemble ─────────────────────────────────────────────────────────────
  const series = (pick: (y: Year) => Counts): Record<string, number[]> =>
    Object.fromEntries(MEASURES.map((m) => [m, years.map((y) => pick(y)[m])]));

  const last = years[years.length - 1];

  const out = {
    id: "delitos-caba",
    title:
      "Delitos registrados por barrio y comuna. Ciudad Autónoma de Buenos Aires",
    source:
      "Ministerio de Justicia y Seguridad (GCBA), Dirección General de Estadística Criminal y Mapa del Delito",
    sourceUrl: "https://data.buenosaires.gob.ar/dataset/delitos",
    license: "CC-BY",
    sourceNote:
      "Mapa del Delito: hechos registrados por el sistema de seguridad de la Ciudad —denuncias, actuaciones policiales y judiciales—, no delitos cometidos. Un delito que nadie denuncia no está en esta serie.",
    poblacionSource:
      "INDEC, Censo Nacional de Población, Hogares y Viviendas 2022. Resultados definitivos, cuadro 2.1 (población y superficie por comuna).",
    poblacionSourceUrl:
      "https://censo.gob.ar/index.php/datos_definitivos_caba/",
    generatedBy: "scripts/fetch-caba-delitos.ts",
    years: years.map((y) => y.year),
    measures: MEASURES,
    /** City-wide, including the events with no barrio. */
    ciudad: series((y) => y.ciudad),
    /** The events `ciudad` has and the regions do not. */
    sinBarrio: series((y) => y.sinBarrio),
    barrios: Object.fromEntries(
      BARRIOS.map((b) => [
        b.id,
        Object.fromEntries(
          MEASURES.map((m) => [m, years.map((y) => y.barrios.get(b.id)![m])]),
        ),
      ]),
    ),
    comunas: Object.fromEntries(
      COMUNA_IDS.map((c) => [
        String(c),
        Object.fromEntries(
          MEASURES.map((m) => [m, years.map((y) => y.comunas.get(c)![m])]),
        ),
      ]),
    ),
    robos: {
      conArma: years.map((y) => y.roboConArma),
      conMoto: years.map((y) => y.roboConMoto),
    },
    /** The latest year only. What time of day and what day of week look like is
     * a portrait of the city as it is now, not a series — ten years of it would
     * be 1.700 numbers nothing on the page reads. */
    perfil: {
      year: last.year,
      sinFranja: last.sinFranja,
      franja: last.franja,
      dia: last.dia,
      dias: DIAS,
    },
    poblacion: {
      censo: 2022,
      comunas: Object.fromEntries(
        COMUNA_IDS.map((c) => [String(c), comunas[c].poblacion]),
      ),
      /** Estimated — see `barrioPopulation` in the script. */
      barrios: Object.fromEntries(
        BARRIOS.map((b) => [b.id, barrioPob.get(b.id)!]),
      ),
      /** The 2010 count the estimate is built from, so the split is checkable. */
      barrios2010: Object.fromEntries(
        BARRIOS.map((b) => [b.id, pob2010.get(b.id)!]),
      ),
    },
  };

  const text = format(out);

  // ── Summary ──────────────────────────────────────────────────────────────
  const totalOf = (c: Counts): number =>
    c.robo +
    c.roboAutomotor +
    c.hurto +
    c.hurtoAutomotor +
    c.lesiones +
    c.amenazas +
    c.homicidios;

  const city = totalOf(last.ciudad);
  const pop = CENSO_TOTAL;
  console.log(
    `\n  ${years[0].year}–${last.year}  (${years.length} years, ${int(years.reduce((a, y) => a + y.rows, 0))} events)`,
  );
  console.log(`  ${last.year}:`);
  console.log(
    `    delitos          ${int(city).padStart(9)}   ${(city / (pop / 1000)).toFixed(1)} cada 1.000 hab.`,
  );
  for (const m of MEASURES) {
    console.log(`    ${m.padEnd(16)} ${int(last.ciudad[m]).padStart(9)}`);
  }
  const before = years[years.length - 2];
  if (before) {
    const change = (city / totalOf(before.ciudad) - 1) * 100;
    console.log(
      `    interanual       ${change > 0 ? "+" : ""}${change.toFixed(1)} % contra ${before.year}`,
    );
  }
  console.log(
    `    sin barrio       ${int(totalOf(last.sinBarrio)).padStart(9)}   ${((totalOf(last.sinBarrio) / city) * 100).toFixed(1)} % de los delitos`,
  );
  console.log(
    `    robos con moto   ${int(last.roboConMoto).padStart(9)}   ${((last.roboConMoto / (last.ciudad.robo + last.ciudad.roboAutomotor)) * 100).toFixed(1)} % de los robos`,
  );
  const misplaced = years.reduce((a, y) => a + y.misplaced, 0);
  if (misplaced) {
    console.log(
      `    ${misplaced} event(s) across the whole span are filed under a comuna that doesn't contain their barrio; the barrio registry won.`,
    );
  }

  const rate = (id: string): number =>
    (MEASURES.reduce(
      (a, m) =>
        a +
        (m === "lesionesViales" || m === "muertesViales"
          ? 0
          : out.barrios[id][m][years.length - 1]),
      0,
    ) /
      barrioPob.get(id)!) *
    1000;
  const ranked = BARRIOS.map((b) => ({ b, r: rate(b.id) })).sort(
    (x, y) => y.r - x.r,
  );
  console.log(
    `\n  cada 1.000 habitantes, ${last.year}:  máximo ${ranked[0].b.label} ${ranked[0].r.toFixed(1)} · mínimo ${ranked[ranked.length - 1].b.label} ${ranked[ranked.length - 1].r.toFixed(1)}`,
  );

  if (dryRun) {
    console.log(`\n  --dry-run: not writing (${text.length} bytes)`);
    return;
  }
  writeFileSync(TARGET, text);
  console.log(
    `\n  wrote ${path.relative(process.cwd(), TARGET)} (${(text.length / 1024).toFixed(0)} KB)`,
  );
}

await main();

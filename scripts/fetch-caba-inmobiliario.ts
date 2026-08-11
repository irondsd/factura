#!/usr/bin/env bun
/**
 * Rebuilds the two IDECBA datasets behind the CABA property pages:
 *
 *   src/content/estadisticas/data/venta-caba.json     USD per m², for sale
 *   src/content/estadisticas/data/alquiler-caba.json  ARS per month, to rent
 *
 * both by barrio and by comuna, for 1/2/3-ambiente used apartments.
 *
 * Run: `bun scripts/fetch-caba-inmobiliario.ts`   (or `npm run data:caba`)
 *      `--dry-run`          parse and report without writing
 *      `--only=alquiler`    just one of them
 *
 * IDECBA publishes quarterly, roughly two months after the quarter closes, so
 * this runs about four times a year. Run it, read the summary it prints, and
 * commit the diff.
 *
 * ── Why a script and not a hand-append ────────────────────────────────────
 * The house rule for this directory (see `AUTHORING.md` §6) is that a data
 * file is "the thing a human appends to each month", and for INDEC's seven
 * regions that is the right call. These two are 378 numbers a quarter spread
 * over twelve spreadsheets whose barrio labels disagree with the city's own
 * boundary file in three places — typed by hand they would be wrong within a
 * year, and wrong in a way that looks like data.
 *
 * ── Why the URLs are discovered rather than hardcoded ─────────────────────
 * IDECBA's stable identifier is the file *code* (`MI_DVP_AX03`), not its URL:
 * the files live under a WordPress upload folder named for the month they were
 * first published, and they are overwritten in place — until the day one is
 * re-uploaded and silently moves to a new folder. So the codes are written
 * down below and the current URL for each is looked up from the section index
 * on every run.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BARRIOS,
  COMUNA_IDS,
  findBarrio,
} from "../src/content/estadisticas/data/caba";
import { quarters, titleRange } from "./lib/quarters";
import { type Cell, readSheet } from "./lib/xlsx";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(here, "../src/content/estadisticas/data");

/** Where the section indexes its tables. Two pages cover every price series. */
const INDEX_PAGES = [
  "https://www.estadisticaciudad.gob.ar/eyc/categoria-banco-datos/mercado-inmobiliario/",
  "https://www.estadisticaciudad.gob.ar/eyc/categoria-banco-datos/mercado-inmobiliario/page/2/",
];

type Size = "amb1" | "amb2" | "amb3";
type Geo = "barrio" | "comuna";

const SIZES: Size[] = ["amb1", "amb2", "amb3"];

type Dataset = {
  id: string;
  file: string;
  title: string;
  unit: string;
  /** Printed after each figure in the console summary. */
  unitShort: string;
  sourceNote: string;
  /** First quarter kept, and why. */
  from: string;
  /** Decimal places to keep. */
  decimals: number;
  series: { size: Size; geo: Geo; code: string }[];
  /**
   * Whether the sheets state the surface their unit price assumes.
   *
   * The rent tables publish a price for a *flat*, derived from a price per
   * square metre times a fixed reference surface, and say so in a footnote
   * ("se considera una superficie de 43 m2"). Reading that number out means the
   * page can show rent per m² as the source's own arithmetic rather than as our
   * guess — and it is the bridge to comparing rent against the sale series,
   * which is per m² already. The sale tables have no such note.
   */
  readsReferenceArea: boolean;
};

const DATASETS: Dataset[] = [
  {
    id: "venta-caba",
    file: "venta-caba.json",
    title:
      "Precio promedio de publicación del metro cuadrado de departamentos usados en venta",
    unit: "USD/m2",
    unitShort: "USD/m2",
    sourceNote:
      "IDECBA (Jefatura de Gabinete de Ministros - GCBA) sobre la base de datos de Argenprop. Precios de publicación, no de escrituración.",
    // The 2- and 3-ambiente barrio tables reach back to 2006, but their own
    // footnotes disclaim the early years: readings before 2015 are the first
    // month of the quarter rather than the quarter, the source changes from
    // Adinco to Argenprop in mid-2015, and "la información anterior a 2010 se
    // encuentra en revisión". 2017Q1 is both the first quarter clear of all
    // that and the first present in every one of the six files.
    from: "2017Q1",
    // The source carries fifteen decimals, which is fourteen more than an
    // average asking price supports and half the file size.
    decimals: 1,
    // `usados` throughout — the "a estrenar" tables cover far fewer barrios and
    // would grey out half the map.
    series: [
      { size: "amb1", geo: "barrio", code: "MI_DVP_AX10" },
      { size: "amb2", geo: "barrio", code: "MI_DVP_AX03" },
      { size: "amb3", geo: "barrio", code: "MI_DVP_AX04" },
      { size: "amb1", geo: "comuna", code: "MI_DVP_AX12" },
      { size: "amb2", geo: "comuna", code: "MI_DVP_AX07" },
      { size: "amb3", geo: "comuna", code: "MI_DVP_AX08" },
    ],
    readsReferenceArea: false,
  },
  {
    id: "alquiler-caba",
    file: "alquiler-caba.json",
    title:
      "Precio promedio de publicación de departamentos usados en alquiler, por mes",
    unit: "ARS/mes",
    unitShort: "ARS/mes",
    sourceNote:
      "IDECBA (Jefatura de Gabinete de Ministros - GCBA) sobre la base de datos de Argenprop. Precios de publicación en pesos, no de contratos firmados.",
    // All six rent tables start here, so no padding is needed. There is no
    // earlier data to discard: unlike the sale series, IDECBA's barrio-level
    // rent tables begin at 2018Q1.
    from: "2018Q1",
    // Pesos a month, in the hundreds of thousands. A decimal would be noise.
    decimals: 0,
    series: [
      { size: "amb1", geo: "barrio", code: "MI_DAP_AX09" },
      { size: "amb2", geo: "barrio", code: "MI_DAP_AX10" },
      { size: "amb3", geo: "barrio", code: "MI_DAP_AX11" },
      { size: "amb1", geo: "comuna", code: "MI_DAP_AX12" },
      { size: "amb2", geo: "comuna", code: "MI_DAP_AX13" },
      { size: "amb3", geo: "comuna", code: "MI_DAP_AX14" },
    ],
    readsReferenceArea: true,
  },
];

// ── Reading one table ──────────────────────────────────────────────────────
// The period axis comes from `lib/quarters`, which derives it from the sheet
// *title* rather than its header rows — see the note there for why the header
// rows can't be trusted. The column count is asserted against it below.

type Table = {
  code: string;
  title: string;
  periods: string[];
  /** Periods IDECBA marks with an asterisk in the header. */
  provisional: string[];
  /** Row label as published → one value per period. */
  rows: Map<string, (number | null)[]>;
  ciudad: (number | null)[];
  /** m² the unit price assumes, from the sheet's own footnote. */
  referenceArea?: number;
};

/** A published cell. `///` is IDECBA's "withheld: too few listings to publish",
 * which is data — the barrio exists, the number doesn't — and becomes `null`.
 * Anything else is a format change we should hear about. */
function value(cell: Cell, where: string, decimals: number): number | null {
  if (typeof cell === "number") {
    const f = 10 ** decimals;
    return Math.round(cell * f) / f;
  }
  if (cell === null) return null;
  if (typeof cell === "string" && (cell.trim() === "///" || cell.trim() === ""))
    return null;
  throw new Error(`unexpected cell ${JSON.stringify(cell)} at ${where}`);
}

function readTable(code: string, file: Buffer, ds: Dataset): Table {
  const grid = readSheet(file, 0);
  const title = String(grid[0][0] ?? "");
  const { start, end } = titleRange(title);

  const periods = quarters(start, end);
  const dataCols = grid[0].length - 1;
  if (periods.length !== dataCols) {
    throw new Error(
      `${code}: title says ${start}→${end} (${periods.length} quarters) but the sheet has ${dataCols} data columns`,
    );
  }

  // The quarter row does carry the provisional asterisk reliably, even though
  // its year row does not. Its first cell is junk and its first data cell is
  // sometimes blank; neither matters, since only recent quarters are ever
  // flagged and every quarter is covered by at least one of the six files.
  const provisional = periods.filter((_, i) =>
    String(grid[2][i + 1] ?? "").includes("*"),
  );

  const rows = new Map<string, (number | null)[]>();
  let ciudad: (number | null)[] | undefined;
  let referenceArea: number | undefined;

  for (let r = 3; r < grid.length; r++) {
    const label = grid[r][0];
    if (label === null) continue;
    const text = String(label).trim();

    // Footnote rows are the only place the reference surface is stated.
    const area = /superficie de\s+(\d+(?:[.,]\d+)?)\s*m/i.exec(text);
    if (area) referenceArea = Number(area[1].replace(",", "."));

    const series = periods.map((p, i) =>
      value(grid[r][i + 1], `${code} ${p}`, ds.decimals),
    );
    if (text === "Total") ciudad = series;
    else rows.set(text, series);
  }
  if (!ciudad) throw new Error(`${code}: no "Total" row`);
  if (ds.readsReferenceArea && !referenceArea) {
    throw new Error(
      `${code}: expected a footnote stating the reference surface ("se considera una superficie de N m2") and found none. If IDECBA has stopped publishing it, the rent page can no longer show a price per m².`,
    );
  }

  return { code, title, periods, provisional, rows, ciudad, referenceArea };
}

// ── Discovery ──────────────────────────────────────────────────────────────

async function discover(): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  for (const page of INDEX_PAGES) {
    const html = await (await fetch(page)).text();
    const links = [
      ...html.matchAll(
        /href="(https:\/\/www\.estadisticaciudad\.gob\.ar\/eyc\/banco-datos\/[^"]+)"[^>]*>\s*Precio promedio/g,
      ),
    ].map((m) => m[1]);
    for (const url of links) {
      const page = await (await fetch(url)).text();
      const file = /href="([^"]*wp-content\/uploads\/[^"]+\.xlsx?)"/i.exec(
        page,
      )?.[1];
      if (file) {
        index.set(file.split("/").pop()!.replace(/\.xlsx?$/i, ""), file);
      }
    }
  }
  return index;
}

// ── Output ─────────────────────────────────────────────────────────────────

/** JSON with every series array on one line. `JSON.stringify(v, null, 2)`
 * would put each of the ~7.000 numbers on its own line, which turns a quarterly
 * refresh into an unreadable diff; this keeps one line per series, so a review
 * shows which barrios moved. */
function format(data: unknown): string {
  const json = JSON.stringify(data, null, 2);
  return `${json.replace(/\[\n\s+((?:[^[\]{}]|\n)*?)\n\s+\]/g, (_, body: string) =>
    `[${body.trim().replace(/\s*\n\s*/g, " ")}]`,
  )}\n`;
}

async function build(
  ds: Dataset,
  index: Map<string, string>,
  dryRun: boolean,
): Promise<void> {
  console.log(`\n── ${ds.id} ${"─".repeat(Math.max(0, 60 - ds.id.length))}`);

  const tables = new Map<string, Table>();
  for (const { code } of ds.series) {
    const url = index.get(code);
    if (!url) {
      throw new Error(
        `${code} is not listed on the section index any more. Open ${INDEX_PAGES[0]} and check whether IDECBA renamed or retired the table.`,
      );
    }
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    tables.set(code, readTable(code, buf, ds));
    console.log(`  ${code}  ${url.split("/").slice(-3).join("/")}`);
  }

  // One axis for all six, or the file is not internally comparable.
  const ends = new Set([...tables.values()].map((t) => t.periods.at(-1)!));
  if (ends.size !== 1) {
    throw new Error(
      `${ds.id}: the six tables end in different quarters (${[...ends].join(", ")}). IDECBA has published a partial update; re-run once the rest lands.`,
    );
  }
  const periods = quarters(ds.from, [...ends][0]);
  const provisional = [
    ...new Set([...tables.values()].flatMap((t) => t.provisional)),
  ]
    .filter((p) => periods.includes(p))
    .sort();

  /** One table's row, cut to the shared axis. */
  const slice = (t: Table, series: (number | null)[]): (number | null)[] => {
    const at = t.periods.indexOf(ds.from);
    if (at < 0) throw new Error(`${t.code} starts after ${ds.from}`);
    return series.slice(at);
  };

  const ciudad: Record<string, (number | null)[]> = {};
  const barrios: Record<string, Record<string, (number | null)[]>> = {};
  const comunas: Record<string, Record<string, (number | null)[]>> = {};
  const referenceArea: Record<string, number> = {};

  for (const { size, geo, code } of ds.series) {
    const table = tables.get(code)!;

    // The city total appears in all six; take it from the barrio tables and
    // check the comuna ones agree, since a mismatch means we've paired a size
    // with the wrong file.
    const total = slice(table, table.ciudad);
    if (geo === "barrio") ciudad[size] = total;
    else if (JSON.stringify(ciudad[size]) !== JSON.stringify(total)) {
      throw new Error(
        `${code}: its city total disagrees with the barrio table for ${size}`,
      );
    }

    // Same check for the surface: both files for a size must assume the same
    // one, or a price per m² derived from it would depend on which table it
    // came from.
    if (table.referenceArea) {
      const seen = referenceArea[size];
      if (seen && seen !== table.referenceArea) {
        throw new Error(
          `${code}: assumes ${table.referenceArea} m² for ${size} but another table assumes ${seen} m²`,
        );
      }
      referenceArea[size] = table.referenceArea;
    }

    if (geo === "barrio") {
      const seen = new Set<string>();
      for (const [label, series] of table.rows) {
        const barrio = findBarrio(label);
        if (!barrio) continue; // footnote rows
        seen.add(barrio.id);
        (barrios[barrio.id] ??= {})[size] = slice(table, series);
      }
      const missing = BARRIOS.filter((b) => !seen.has(b.id)).map((b) => b.label);
      if (missing.length) {
        throw new Error(
          `${code}: no row for ${missing.join(", ")}. IDECBA may have renamed a barrio — add the new spelling to that barrio's \`aka\` in data/caba.ts.`,
        );
      }
    } else {
      const seen = new Set<number>();
      for (const [label, series] of table.rows) {
        const id = Number(label);
        if (!COMUNA_IDS.includes(id)) continue; // footnote rows
        seen.add(id);
        (comunas[String(id)] ??= {})[size] = slice(table, series);
      }
      const missing = COMUNA_IDS.filter((c) => !seen.has(c));
      if (missing.length) {
        throw new Error(`${code}: no row for comuna ${missing.join(", ")}`);
      }
    }
  }

  const out = {
    id: ds.id,
    title: ds.title,
    source: "Instituto de Estadística y Censos de la Ciudad de Buenos Aires",
    sourceUrl:
      "https://www.estadisticaciudad.gob.ar/eyc/categoria-banco-datos/mercado-inmobiliario/",
    sourceNote: ds.sourceNote,
    unit: ds.unit,
    condition: "usados",
    ...(ds.readsReferenceArea ? { referenceArea } : {}),
    files: Object.fromEntries(ds.series.map((s) => [`${s.geo}-${s.size}`, s.code])),
    generatedBy: "scripts/fetch-caba-inmobiliario.ts",
    periods,
    provisional,
    ciudad,
    barrios: Object.fromEntries(
      BARRIOS.map((b) => [
        b.id,
        Object.fromEntries(SIZES.map((s) => [s, barrios[b.id][s]])),
      ]),
    ),
    comunas: Object.fromEntries(
      COMUNA_IDS.map((c) => [
        String(c),
        Object.fromEntries(SIZES.map((s) => [s, comunas[String(c)][s]])),
      ]),
    ),
  };

  const text = format(out);

  // What the reviewer needs to see before committing: how much of the map each
  // size can actually colour in the newest quarter.
  const last = periods.length - 1;
  console.log(
    `\n  ${periods[0]} → ${periods.at(-1)}  (${periods.length} quarters, ${provisional.length} provisional)`,
  );
  for (const size of SIZES) {
    const withData = BARRIOS.filter((b) => out.barrios[b.id][size][last] !== null);
    const comunasWith = COMUNA_IDS.filter(
      (c) => out.comunas[String(c)][size][last] !== null,
    );
    const grey = BARRIOS.filter((b) => out.barrios[b.id][size][last] === null).map(
      (b) => b.label,
    );
    const area = referenceArea[size] ? ` (${referenceArea[size]} m²)` : "";
    console.log(
      `  ${size}: ciudad ${out.ciudad[size][last]} ${ds.unitShort}${area} · barrios ${withData.length}/48 · comunas ${comunasWith.length}/15`,
    );
    if (grey.length) console.log(`         sin dato: ${grey.join(", ")}`);
  }

  const target = path.join(DATA_DIR, ds.file);
  if (dryRun) {
    console.log(`\n  --dry-run: not writing (${text.length} bytes)`);
    return;
  }
  writeFileSync(target, text);
  console.log(
    `\n  wrote ${path.relative(process.cwd(), target)} (${(text.length / 1024).toFixed(0)} KB)`,
  );
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const only = /--only=(\S+)/.exec(process.argv.join(" "))?.[1];
  const wanted = only
    ? DATASETS.filter((d) => d.id.includes(only))
    : DATASETS;
  if (!wanted.length) {
    throw new Error(
      `--only=${only} matches nothing. Known: ${DATASETS.map((d) => d.id).join(", ")}`,
    );
  }

  console.log("discovering current file URLs…");
  const index = await discover();

  for (const ds of wanted) await build(ds, index, dryRun);
}

await main();

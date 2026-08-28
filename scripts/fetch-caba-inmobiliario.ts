#!/usr/bin/env bun
/**
 * Rebuilds the three IDECBA datasets behind the CABA property pages:
 *
 *   src/content/estadisticas/data/venta-caba.json     USD per m², for sale
 *   src/content/estadisticas/data/alquiler-caba.json  ARS per month, to rent
 *   src/content/estadisticas/data/oferta-alquiler-caba.json  m² advertised
 *
 * The first two are prices, by barrio and by comuna, for 1/2/3-ambiente used
 * apartments. The third is supply — how much floor area is on offer — and is
 * built by a separate pass further down, for reasons set out there.
 *
 * Run: `bun scripts/fetch-caba-inmobiliario.ts`   (or `bun run data:caba`)
 *      `--dry-run`          parse and report without writing
 *      `--only=alquiler`    just the ones whose id contains this
 *
 * IDECBA publishes the price tables quarterly, roughly two months after the
 * quarter closes, so this runs about four times a year. The supply tables are
 * monthly and are refreshed on the same visit. Run it, read the summary it
 * prints, and commit the diff.
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
import { BARRIOS, COMUNA_IDS, findBarrio } from "../src/content/shared/caba";
import { months, titleMonths } from "./lib/months";
import { quarters, titleRange } from "./lib/quarters";
import { type Cell, readSheet } from "./lib/xlsx";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(here, "../src/content/estadisticas/data");

/** Where the section indexes its tables. The two `mercado-inmobiliario` pages
 * cover every price series; the `alquileres` page repeats the rent half and is
 * the only one that lists all four superficie tables together. */
const INDEX_PAGES = [
  "https://www.estadisticaciudad.gob.ar/eyc/categoria-banco-datos/mercado-inmobiliario/",
  "https://www.estadisticaciudad.gob.ar/eyc/categoria-banco-datos/mercado-inmobiliario/page/2/",
  "https://www.estadisticaciudad.gob.ar/eyc/categoria-banco-datos/alquileres/",
];

type Size = "amb1" | "amb2" | "amb3";
type Geo = "barrio" | "comuna";

const SIZES: Size[] = ["amb1", "amb2", "amb3"];

/** How often a table's columns step. The price tables are quarterly and the
 * supply tables monthly, and the axis is derived from the sheet title either
 * way — see `lib/quarters.ts` and `lib/months.ts` for why never from the
 * header rows. */
type Cadence = "quarterly" | "monthly";

type Dataset = {
  id: string;
  file: string;
  title: string;
  unit: string;
  /** Printed after each figure in the console summary. */
  unitShort: string;
  sourceNote: string;
  /** First period kept, and why. */
  from: string;
  cadence: Cadence;
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
    cadence: "quarterly",
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
    cadence: "quarterly",
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

function readTable(
  code: string,
  file: Buffer,
  ds: Pick<Dataset, "decimals" | "cadence" | "readsReferenceArea">,
): Table {
  const grid = readSheet(file, 0);
  const title = String(grid[0][0] ?? "");

  const periods =
    ds.cadence === "quarterly"
      ? ((r) => quarters(r.start, r.end))(titleRange(title))
      : ((r) => months(r.start, r.end))(titleMonths(title));
  const dataCols = grid[0].length - 1;
  if (periods.length !== dataCols) {
    throw new Error(
      `${code}: title says ${periods[0]}→${periods.at(-1)} (${periods.length} ${ds.cadence === "quarterly" ? "quarters" : "months"}) but the sheet has ${dataCols} data columns`,
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
  // The rent tables are listed on two of the three index pages, so the landing
  // pages are collected before any of them is opened — otherwise every table
  // that appears twice is downloaded twice.
  const landings = new Set<string>();
  for (const page of INDEX_PAGES) {
    const html = await (await fetch(page)).text();
    // "Precio promedio" reaches the twelve price tables, "Superficie" the four
    // supply ones plus the two city-level tables the unit counts divide by.
    // Everything else the section lists (notarial acts, the price index, the
    // percentage distributions by comuna) is deliberately left out — this is a
    // fetch of listed URLs, so a wider net costs a request per table.
    const links = [
      ...html.matchAll(
        /href="(https:\/\/www\.estadisticaciudad\.gob\.ar\/eyc\/banco-datos\/[^"]+)"[^>]*>\s*(?:Precio promedio|Superficie|Distribución porcentual de departamentos publicados en alquiler)/g,
      ),
    ].map((m) => m[1]);
    for (const url of links) landings.add(url);
  }

  for (const url of landings) {
    // A landing page that won't open is reported and stepped over rather than
    // fatal. The index lists tables this script has no use for — the sale-side
    // superficie series was discontinued in 2015 and its pages currently refuse
    // connections — and failing the whole refresh over one of those would make
    // the run depend on the health of pages nothing here reads. A table we
    // *do* need going missing is caught downstream, by name, with a message
    // saying which one.
    let page: string;
    try {
      // Bounded, because "refuses connections" and "accepts and never answers"
      // are both live states of this site and only the first fails on its own.
      page = await (
        await fetch(url, { signal: AbortSignal.timeout(20_000) })
      ).text();
    } catch (err) {
      console.warn(`  skipped ${url.split("/").slice(-2)[0]}: ${err}`);
      continue;
    }
    const file = /href="([^"]*wp-content\/uploads\/[^"]+\.xlsx?)"/i.exec(
      page,
    )?.[1];
    if (file) {
      index.set(
        file
          .split("/")
          .pop()!
          .replace(/\.xlsx?$/i, ""),
        file,
      );
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
  return `${json.replace(
    /\[\n\s+((?:[^[\]{}]|\n)*?)\n\s+\]/g,
    (_, body: string) => `[${body.trim().replace(/\s*\n\s*/g, " ")}]`,
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
      const missing = BARRIOS.filter((b) => !seen.has(b.id)).map(
        (b) => b.label,
      );
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
    files: Object.fromEntries(
      ds.series.map((s) => [`${s.geo}-${s.size}`, s.code]),
    ),
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
    const withData = BARRIOS.filter(
      (b) => out.barrios[b.id][size][last] !== null,
    );
    const comunasWith = COMUNA_IDS.filter(
      (c) => out.comunas[String(c)][size][last] !== null,
    );
    const grey = BARRIOS.filter(
      (b) => out.barrios[b.id][size][last] === null,
    ).map((b) => b.label);
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

// ── Supply: how much floor area is on offer ────────────────────────────────
// A second pass rather than a third entry in DATASETS, because almost nothing
// above applies to it:
//
//   • it is monthly — 157 columns where a price table has 38;
//   • there is no comuna table to pair a barrio table with. IDECBA publishes
//     none, and none is needed: these are *sums*, so adding barrios up is the
//     same arithmetic the source would do. The rollup happens in the data
//     module rather than here, which keeps 15 more series out of the file;
//   • coverage is complete, so there is no suppression to reconcile. Zero is a
//     publishable answer for a total in a way it never is for an average, and a
//     zero here means "nothing advertised", not "withheld";
//   • it needs two extra city-level tables, in a third layout again, to turn
//     square metres into a count of apartments. See `AVERAGE_AREA` below.

const OFERTA_ID = "oferta-alquiler-caba";

/** The four supply tables. `total` is the whole rental market in one series;
 * the other three are the segments people actually search by. */
const OFERTA_SERIES = [
  { size: "total", code: "MI_DAS2_AX02", words: "1 a 5 ambientes" },
  { size: "amb1", code: "MI_DAS2_AX02a", words: "1 ambiente" },
  { size: "amb2", code: "MI_DAS2_AX02b", words: "2 ambientes" },
  { size: "amb3", code: "MI_DAS2_AX02c", words: "3 ambientes" },
] as const;

/** First month kept: the four tables all start here, and the sheets' own
 * footnote says why nothing earlier is offered — "las series de superficie
 * fueron discontinuadas entre septiembre de 2011 y junio de 2013 por cambio del
 * proveedor de datos". */
const OFERTA_FROM = "2013-07";

/**
 * The two city-level tables that turn square metres into apartments.
 *
 * `MI_DAN_AX02` publishes the average advertised surface for a 1-, 2- and
 * 3-ambiente flat, month by month — the honest divisor for those three, and the
 * source's own number rather than one we picked.
 *
 * `MI_DAN_AX01` is what makes the 1-to-5 series divisible at all. There is no
 * published average surface for the whole market, but this table gives the
 * share of advertised *units* in each size band, including the "4 y 5" one
 * whose surface is nowhere stated. Knowing the unit counts of the three sizes
 * we can divide, and the share those three represent, gives the count for the
 * whole market — and the whole market's square metres divided by that is the
 * average surface across everything on offer. It comes out around 45 m², which
 * is what a market that is ~40 % two-ambiente flats should look like.
 *
 * Both are laid out differently again from the barrio tables: one month per
 * *row*, with a sparse year column and a month-name column that is filled in
 * only on the first row. Neither label column is usable, so the axis is derived
 * from the title and asserted against the row count, exactly as elsewhere.
 */
const AVERAGE_AREA = { code: "MI_DAN_AX02", cols: [2, 3, 4] };
const DISTRIBUTION = { code: "MI_DAN_AX01", cols: [3, 4, 5, 6] };

/** One of the city-level monthly tables: the period axis from the title, and
 * the data rows aligned to it. */
function readCityMonthly(
  code: string,
  file: Buffer,
): { periods: string[]; rows: Cell[][] } {
  const grid = readSheet(file, 0);
  const title = String(grid[0][0] ?? "");
  const { start, end } = titleMonths(title);
  const periods = months(start, end);

  // Rows 0-2 are the title and two header rows; the footnotes at the bottom are
  // text in the first column with nothing beside them. A data row is one that
  // carries a number in its first data column, which is true of every month and
  // of no footnote.
  const rows = grid
    .slice(3)
    .filter((row) => typeof row[Math.min(...AVERAGE_AREA.cols)] === "number");
  if (rows.length !== periods.length) {
    throw new Error(
      `${code}: title says ${start}→${end} (${periods.length} months) but the sheet has ${rows.length} data rows`,
    );
  }
  return { periods, rows };
}

async function buildOferta(
  index: Map<string, string>,
  dryRun: boolean,
): Promise<void> {
  console.log(
    `\n── ${OFERTA_ID} ${"─".repeat(Math.max(0, 60 - OFERTA_ID.length))}`,
  );

  const fetchTable = async (code: string): Promise<Buffer> => {
    const url = index.get(code);
    if (!url) {
      throw new Error(
        `${code} is not listed on the section index any more. Open ${INDEX_PAGES[2]} and check whether IDECBA renamed or retired the table.`,
      );
    }
    console.log(`  ${code}  ${url.split("/").slice(-3).join("/")}`);
    return Buffer.from(await (await fetch(url)).arrayBuffer());
  };

  // ── The four barrio tables ───────────────────────────────────────────────
  const tables = new Map<string, Table>();
  for (const { code, words } of OFERTA_SERIES) {
    const table = readTable(code, await fetchTable(code), {
      // Whole square metres. The source carries two decimals, which on a figure
      // that is a sum of advertised floor area is precision no one can use and
      // a third of the file.
      decimals: 0,
      cadence: "monthly",
      readsReferenceArea: false,
    });

    // Which size a file holds, checked against the sheet's own title rather
    // than trusted from the code in the table above.
    //
    // This is the only check that catches the mistake worth catching. The
    // obvious one — that the three sizes add up to no more than the 1-to-5
    // total — cannot: swapping the 1- and 3-ambiente files leaves every sum
    // exactly as it was. The title says the size in words, so it is checked in
    // words.
    if (!table.title.includes(`de ${words} (usados y a estrenar)`)) {
      throw new Error(
        `${code}: expected a "${words}" table and its title reads "${table.title}". IDECBA may have renumbered the tables.`,
      );
    }
    tables.set(code, table);
  }

  const ends = new Set([...tables.values()].map((t) => t.periods.at(-1)!));
  if (ends.size !== 1) {
    throw new Error(
      `${OFERTA_ID}: the four tables end in different months (${[...ends].join(", ")}). IDECBA has published a partial update; re-run once the rest lands.`,
    );
  }
  const periods = months(OFERTA_FROM, [...ends][0]);
  const provisional = [
    ...new Set([...tables.values()].flatMap((t) => t.provisional)),
  ]
    .filter((p) => periods.includes(p))
    .sort();

  const slice = (t: Table, series: (number | null)[]): (number | null)[] => {
    const at = t.periods.indexOf(OFERTA_FROM);
    if (at < 0) throw new Error(`${t.code} starts after ${OFERTA_FROM}`);
    return series.slice(at);
  };

  /** A published total. Unlike a price, this is never withheld — so a `null`
   * here is a hole in the sheet, not a suppression, and there is no honest way
   * to draw it. */
  const total = (v: number | null, where: string): number => {
    if (v === null) throw new Error(`${where}: empty cell in a total column`);
    return v;
  };

  const ciudad: Record<string, number[]> = {};
  const barrios: Record<string, Record<string, number[]>> = {};

  for (const { size, code } of OFERTA_SERIES) {
    const table = tables.get(code)!;
    ciudad[size] = slice(table, table.ciudad).map((v, i) =>
      total(v, `${code} ${periods[i]} Total`),
    );

    const seen = new Set<string>();
    for (const [label, series] of table.rows) {
      const barrio = findBarrio(label);
      if (!barrio) continue; // footnote rows
      seen.add(barrio.id);
      (barrios[barrio.id] ??= {})[size] = slice(table, series).map((v, i) =>
        total(v, `${code} ${periods[i]} ${label}`),
      );
    }
    const missing = BARRIOS.filter((b) => !seen.has(b.id)).map((b) => b.label);
    if (missing.length) {
      throw new Error(
        `${code}: no row for ${missing.join(", ")}. IDECBA may have renamed a barrio — add the new spelling to that barrio's \`aka\` in data/caba.ts.`,
      );
    }
  }

  // ── Do the parts fit inside the whole? ───────────────────────────────────
  // 1, 2 and 3 ambientes are three of the five the total covers, so their sum
  // must not exceed it. Checked at two levels, and strictly at only one of
  // them, because the source is not equally consistent at both.
  //
  // The city row is exact: in all 157 months the 4- and 5-ambiente residual is
  // positive, and lately it runs at 11-13 % of the advertised area. The unit
  // count for the whole market is derived from that residual, so if it ever
  // went negative the arithmetic below would be meaningless and this should
  // stop the run.
  for (let i = 0; i < periods.length; i++) {
    const parts = ciudad.amb1[i] + ciudad.amb2[i] + ciudad.amb3[i];
    if (parts > ciudad.total[i]) {
      throw new Error(
        `${periods[i]}: the city's 1+2+3 ambientes sum to ${parts} m² but the 1-to-5 table says ${ciudad.total[i]} m². The 4-5 ambiente residual the unit counts rest on has gone negative.`,
      );
    }
  }

  // The barrio rows are not exact, and this is the source's own inconsistency
  // rather than ours: about 0.4 % of barrio-months overshoot, all of them in
  // December 2016 and May 2018, by up to ~11 %. Two months out of 157 where
  // IDECBA's per-size and combined tables were evidently built from different
  // cuts. So the barrio check is a rate rather than a rule — it exists to catch
  // an axis that has slipped a column, which would light up hundreds of cells,
  // and not to relitigate two bad months from 2016 and 2018.
  const off: { where: string; by: number }[] = [];
  for (const b of BARRIOS) {
    for (let i = 0; i < periods.length; i++) {
      const parts =
        barrios[b.id].amb1[i] + barrios[b.id].amb2[i] + barrios[b.id].amb3[i];
      if (parts > barrios[b.id].total[i] + 1) {
        off.push({
          where: `${b.label} ${periods[i]}`,
          by: parts - barrios[b.id].total[i],
        });
      }
    }
  }
  const cells = BARRIOS.length * periods.length;
  if (off.length > cells * 0.02) {
    const worst = off.sort((a, b) => b.by - a.by)[0];
    throw new Error(
      `${OFERTA_ID}: 1+2+3 ambientes exceed the 1-to-5 total in ${off.length} of ${cells} barrio-months (${((off.length / cells) * 100).toFixed(1)} %), worst ${worst.where} by ${worst.by} m². Above 2 % this is an axis that has slipped, not the source's usual noise.`,
    );
  }
  if (off.length) {
    const worstMonth = [
      ...off.reduce(
        (m, o) => m.set(o.where.slice(-7), (m.get(o.where.slice(-7)) ?? 0) + 1),
        new Map<string, number>(),
      ),
    ].sort((a, b) => b[1] - a[1])[0];
    console.log(
      `  note: ${off.length}/${cells} barrio-months where 1+2+3 > the 1-to-5 total (worst month ${worstMonth[0]}, ${worstMonth[1]} barrios) — the source's own inconsistency, within tolerance`,
    );
  }

  // ── The divisors ─────────────────────────────────────────────────────────
  const area = readCityMonthly(
    AVERAGE_AREA.code,
    await fetchTable(AVERAGE_AREA.code),
  );
  const dist = readCityMonthly(
    DISTRIBUTION.code,
    await fetchTable(DISTRIBUTION.code),
  );

  const at = (
    t: { periods: string[]; rows: Cell[][] },
    period: string,
    col: number,
    code: string,
  ): number => {
    const i = t.periods.indexOf(period);
    if (i < 0) throw new Error(`${code}: no month ${period}`);
    const cell = t.rows[i][col];
    if (typeof cell !== "number") {
      throw new Error(
        `${code} ${period}: expected a number in column ${col}, got ${JSON.stringify(cell)}`,
      );
    }
    return cell;
  };

  const averageArea: Record<string, number[]> = {
    amb1: [],
    amb2: [],
    amb3: [],
    total: [],
  };
  for (const period of periods) {
    const s = AVERAGE_AREA.cols.map((c) =>
      at(area, period, c, AVERAGE_AREA.code),
    );
    const p = DISTRIBUTION.cols.map((c) =>
      at(dist, period, c, DISTRIBUTION.code),
    );

    // The four shares are a distribution, so they add to 100. If they ever
    // don't, this script is reading the wrong four columns and every unit count
    // below it is wrong by a factor nobody would notice.
    const sum = p.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 0.5) {
      throw new Error(
        `${DISTRIBUTION.code} ${period}: the size shares add to ${sum.toFixed(2)} %, not 100. The column layout has changed.`,
      );
    }

    const i = periods.indexOf(period);
    // Units in the three sizes we have a surface for, then the whole market:
    // those three account for `share123` of every advertised unit.
    const units123 =
      ciudad.amb1[i] / s[0] + ciudad.amb2[i] / s[1] + ciudad.amb3[i] / s[2];
    const share123 = (p[0] + p[1] + p[2]) / 100;
    const units = units123 / share123;
    const sAll = ciudad.total[i] / units;

    // A sanity band, not a tolerance: the average advertised flat cannot be a
    // cupboard or a mansion, and anything outside this means the arithmetic
    // above has lost its footing rather than that the market moved.
    if (!(sAll > 25 && sAll < 120)) {
      throw new Error(
        `${period}: derived a market-wide average surface of ${sAll.toFixed(1)} m², which is not plausible. Check ${AVERAGE_AREA.code} and ${DISTRIBUTION.code}.`,
      );
    }

    const round = (v: number): number => Math.round(v * 10) / 10;
    averageArea.amb1.push(round(s[0]));
    averageArea.amb2.push(round(s[1]));
    averageArea.amb3.push(round(s[2]));
    averageArea.total.push(round(sAll));
  }

  const out = {
    id: OFERTA_ID,
    title:
      "Superficie total publicada en alquiler, por barrio y por cantidad de ambientes",
    source: "Instituto de Estadística y Censos de la Ciudad de Buenos Aires",
    sourceUrl:
      "https://www.estadisticaciudad.gob.ar/eyc/categoria-banco-datos/alquileres/",
    sourceNote:
      "IDECBA (Jefatura de Gabinete de Ministros - GCBA) sobre la base de datos de Adinco (hasta junio de 2015) y Argenprop (a partir de julio de 2015). Superficie de las unidades en oferta cuya fecha de publicación corresponde al mes de referencia.",
    unit: "m2",
    // Broader than the price tables, which are `usados` only. The page says so.
    condition: "usados y a estrenar",
    files: {
      ...Object.fromEntries(OFERTA_SERIES.map((s) => [s.size, s.code])),
      superficiePromedio: AVERAGE_AREA.code,
      distribucion: DISTRIBUTION.code,
    },
    generatedBy: "scripts/fetch-caba-inmobiliario.ts",
    periods,
    provisional,
    /** m² per advertised flat, per month. `amb1`/`amb2`/`amb3` are IDECBA's own
     * published averages; `total` is derived here — see AVERAGE_AREA. */
    averageArea,
    ciudad,
    barrios: Object.fromEntries(BARRIOS.map((b) => [b.id, barrios[b.id]])),
  };

  const text = format(out);

  // What the reviewer needs before committing. Coverage is never the question
  // here — every barrio carries a number every month — so the summary reports
  // the shape of the newest month instead: the city's total, what it works out
  // to in flats, and the two ends of the range the map has to colour.
  const last = periods.length - 1;
  console.log(
    `\n  ${periods[0]} → ${periods.at(-1)}  (${periods.length} months, ${provisional.length} provisional)`,
  );
  for (const { size } of OFERTA_SERIES) {
    const order = BARRIOS.map((b) => ({
      label: b.label,
      m2: barrios[b.id][size][last],
    })).sort((a, b) => b.m2 - a.m2);
    const zeros = order.filter((r) => r.m2 === 0).length;
    const s = averageArea[size][last];
    console.log(
      `  ${size.padEnd(5)}: ciudad ${ciudad[size][last].toLocaleString("es-AR")} m² ≈ ${Math.round(ciudad[size][last] / s).toLocaleString("es-AR")} deptos (${s} m² c/u)`,
    );
    console.log(
      `         máx ${order[0].label} ${order[0].m2} m² · mín ${order[order.length - 1].label} ${order[order.length - 1].m2} m²` +
        ` · ${zeros} barrio(s) en cero · ${(order[0].m2 / Math.max(1, order[order.length - 1].m2)).toFixed(0)}× de rango`,
    );
  }

  const target = path.join(DATA_DIR, `${OFERTA_ID}.json`);
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
  const ids = [...DATASETS.map((d) => d.id), OFERTA_ID];
  const wanted = ids.filter((id) => !only || id.includes(only));
  if (!wanted.length) {
    throw new Error(`--only=${only} matches nothing. Known: ${ids.join(", ")}`);
  }

  console.log("discovering current file URLs…");
  const index = await discover();

  for (const id of wanted) {
    const ds = DATASETS.find((d) => d.id === id);
    if (ds) await build(ds, index, dryRun);
    else await buildOferta(index, dryRun);
  }
}

await main();

#!/usr/bin/env bun
/**
 * Rebuilds the construction-cost dataset behind /estadisticas/precio-m2-construccion-caba:
 *
 *   src/content/estadisticas/data/costo-construccion-caba.json
 *
 * Run: `bun scripts/fetch-caba-construccion.ts`   (or `bun run data:construccion`)
 *      `--dry-run`   parse and report without writing
 *
 * Two IDECBA tables, joined on one monthly axis:
 *
 *   EE_CMC        pesos per square metre, by building model — the number the
 *                 page is named after.
 *   EE_ICC_02-16  the index those pesos move with, split into materiales, mano
 *                 de obra and gastos generales — which is the only way the page
 *                 can say *why* the metre moved rather than just that it did.
 *
 * IDECBA publishes both monthly, about six weeks after the month closes, so this
 * runs roughly monthly. Run it, read the summary it prints, and commit the diff.
 *
 * ── Why a script and not a hand-append ────────────────────────────────────
 * The house rule for this directory (`AUTHORING.md` §7) is that a data file is
 * "the thing a human appends to each month", and for a single national series
 * that is right. These two are nine series over 138 months spread across 24
 * sheets — one sheet per year per file, newest first — and the append is not the
 * hard part anyway: the axis is. Neither file carries a usable date column (see
 * `monthOf` below), so the month has to be read out of a Spanish month name and
 * checked against the year in the sheet *title*. Done by hand once a month, that
 * is a series that silently slips a month and still looks like data.
 *
 * ── Why the URLs are discovered rather than hardcoded ─────────────────────
 * Same reason as `fetch-caba-inmobiliario.ts`: IDECBA's stable identifier is the
 * file code, not its URL. The files sit in a WordPress upload folder named for
 * the month they were last re-uploaded, so the codes are written down here and
 * the current URL for each is looked up from the section indexes on every run.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { months, ordinal } from "./lib/months";
import { type Cell, readSheet } from "./lib/xlsx";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(here, "../src/content/estadisticas/data");
const TARGET = path.join(DATA_DIR, "costo-construccion-caba.json");

/** Where the section indexes the two tables. */
const INDEX_PAGES = [
  "https://www.estadisticaciudad.gob.ar/eyc/categoria-banco-datos/costo-de-construccion-por-metro-cuadrado/",
  "https://www.estadisticaciudad.gob.ar/eyc/categoria-banco-datos/indice-de-costo-de-la-construccion/",
];

const COSTO = {
  code: "EE_CMC",
  /** Every year sheet's title starts with this; the ficha técnica and the stray
   * chart-data sheet at the end of the workbook do not. That prefix is how the
   * year sheets are told apart from everything else in the file. */
  titlePrefix: "Costo de construcción del metro cuadrado",
  /** Column → series id. Column 2 is "Tipo I", whose header cell reads as blank
   * (the label sits in a cell the sheet merges oddly), so the mapping cannot be
   * taken from the header row and is asserted against the source's own published
   * figures instead — see `assertKnownFigures`. */
  columns: { total: 1, tipo1: 2, tipo2: 3, tipo3: 4, tipo4: 5 },
} as const;

const ICC = {
  code: "EE_ICC_02-16",
  titlePrefix: "Índice del Costo de la Construcción",
  /** The first four data columns are index levels; the four after them are the
   * month-on-month variations, which are derived here instead (they carry "-"
   * where a month didn't move, and a derived series can't disagree with the
   * levels it's drawn beside). */
  columns: { nivel: 1, materiales: 2, manoObra: 3, gastosGenerales: 4 },
} as const;

type SeriesId = keyof typeof COSTO.columns | keyof typeof ICC.columns;

// ── Reading one workbook ───────────────────────────────────────────────────

/** Lowercased Spanish month name → 1-12. The sheets label rows "Enero",
 * "Mayo*", "Septiembre" — a name, never a date — so this is the only route from
 * a row to a period. */
const MONTH: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

/** A row label to a month number, or `null` for the footnote rows. The asterisk
 * IDECBA puts on a provisional month is stripped here and read separately. */
function monthOf(
  label: string,
): { month: number; provisional: boolean } | null {
  const provisional = label.includes("*");
  const name = label.replace(/[*\s]/g, "").toLowerCase();
  const month = MONTH[name];
  return month ? { month, provisional } : null;
}

/** The year a sheet covers, from its own title — "… Enero/junio de 2026" → 2026.
 * The title is used rather than a header cell for the same reason the sibling
 * script derives its axis from the title: these workbooks' header rows carry
 * merged cells whose values do not sit at their merge anchors. */
function yearOf(title: string, code: string): number {
  const m = /(\d{4})\s*$/.exec(title.trim());
  if (!m) {
    throw new Error(
      `${code}: cannot read a year from the sheet title ${JSON.stringify(title)}`,
    );
  }
  return Number(m[1]);
}

/** A published cell. These two tables have no suppression — every month of every
 * series is published — so anything that isn't a number is a format change we
 * should hear about rather than quietly drop. */
function value(cell: Cell, where: string): number {
  if (typeof cell === "number") return cell;
  throw new Error(`${where}: expected a number, got ${JSON.stringify(cell)}`);
}

type Parsed = {
  /** `YYYY-MM` → one value per series id. */
  rows: Map<string, Record<string, number>>;
  provisional: Set<string>;
  /** One entry per footnote *cell* — the model definitions and the index base
   * live here and are checked below. Kept as cells rather than joined because
   * EE_CMC's model footnote is itself a multi-line cell (the four models are
   * separated by CRLFs inside it), so splitting a joined blob on newlines would
   * cut it into fragments. */
  notes: string[];
};

function parse(
  file: Buffer,
  spec: {
    code: string;
    titlePrefix: string;
    columns: Record<string, number>;
  },
): Parsed {
  const rows = new Map<string, Record<string, number>>();
  const provisional = new Set<string>();
  const notes: string[] = [];
  let sheets = 0;

  for (let s = 0; ; s++) {
    let grid: Cell[][];
    try {
      grid = readSheet(file, s);
    } catch {
      break; // past the last sheet
    }
    const title = String(grid[0]?.[0] ?? "");
    // Sheet 0 is an index of years and the last sheets are the ficha técnica and
    // (in EE_CMC) a leftover chart-data range. Only the year sheets carry the
    // table's own title *and* data rows.
    if (!title.startsWith(spec.titlePrefix)) continue;
    const dataRows = grid
      .slice(3)
      .filter((r) => typeof r[0] === "string" && monthOf(String(r[0])));
    if (dataRows.length === 0) continue;

    const year = yearOf(title, spec.code);
    sheets++;

    for (const row of grid.slice(3)) {
      const label = row[0];
      if (typeof label !== "string") continue;
      const m = monthOf(label);
      if (!m) {
        if (label.trim()) notes.push(label.trim());
        continue;
      }
      const period = `${year}-${String(m.month).padStart(2, "0")}`;
      if (rows.has(period)) {
        throw new Error(
          `${spec.code}: ${period} appears in two sheets — the workbook has a duplicated year`,
        );
      }
      const out: Record<string, number> = {};
      for (const [id, col] of Object.entries(spec.columns)) {
        out[id] = value(row[col], `${spec.code} ${period} ${id}`);
      }
      rows.set(period, out);
      if (m.provisional) provisional.add(period);
    }
  }

  if (sheets === 0) {
    throw new Error(
      `${spec.code}: no sheet whose title starts with "${spec.titlePrefix}". IDECBA may have restructured the workbook.`,
    );
  }
  return { rows, provisional, notes };
}

// ── Discovery ──────────────────────────────────────────────────────────────

async function discover(): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  const landings = new Set<string>();

  for (const page of INDEX_PAGES) {
    const html = await (
      await fetch(page, { signal: AbortSignal.timeout(45_000) })
    ).text();
    for (const m of html.matchAll(
      /href="(https:\/\/www\.estadisticaciudad\.gob\.ar\/eyc\/banco-datos\/[^"]+)"/g,
    )) {
      landings.add(m[1]);
    }
  }

  for (const url of landings) {
    // A landing page that won't open is reported and stepped over: these two
    // index pages list tables this script has no use for, and the health of one
    // of those should not fail the refresh. A table we *do* need going missing
    // is caught downstream, by code, with a message naming it.
    let page: string;
    try {
      page = await (
        await fetch(url, { signal: AbortSignal.timeout(30_000) })
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

// ── Sanity checks that would otherwise pass silently ───────────────────────

/**
 * The one mapping in this script that cannot be read off a header row.
 *
 * EE_CMC's header leaves the "Tipo I" cell blank, so the five cost columns are
 * positional — and swapping two of them would produce a page that is wrong in a
 * way nothing else here could notice, since all five series are the same shape
 * and the same order of magnitude. These are three figures IDECBA has published
 * in its own releases, checked against the columns this script believes they sit
 * in. If IDECBA ever reorders the table, this is what says so.
 */
function assertKnownFigures(rows: Map<string, Record<string, number>>): void {
  const known: { period: string; id: SeriesId; expect: number }[] = [
    { period: "2025-06", id: "tipo2", expect: 1_121_022.07 },
    { period: "2025-06", id: "tipo3", expect: 1_434_300.28 },
    { period: "2025-06", id: "total", expect: 1_206_819.98 },
  ];
  for (const { period, id, expect } of known) {
    const got = rows.get(period)?.[id];
    if (got === undefined) continue; // the series no longer reaches back this far
    if (Math.abs(got - expect) > 0.5) {
      throw new Error(
        `EE_CMC: ${period} ${id} reads ${got} but IDECBA published ${expect} for it. ` +
          `The cost columns are positional (the "Tipo I" header cell is blank), so this ` +
          `almost certainly means the table has been reordered — re-check COSTO.columns.`,
      );
    }
  }
}

/** The four models the per-m² table prices, named in its own footnote. All four
 * are *multivivienda*: there is no single-family model in this table, which is
 * the caveat the page leads with, so it is checked rather than assumed. */
function assertModels(notes: string[]): void {
  const blob = notes.join("\n");
  for (const tipo of ["tipo I", "tipo II", "tipo III", "tipo IV"]) {
    if (!blob.includes(`Unidad ${tipo}:`)) {
      throw new Error(
        `EE_CMC: the footnote no longer defines "Unidad ${tipo}". IDECBA has changed the ` +
          `set of models, so the labels in data/costo-construccion-caba.ts and the page's ` +
          `prose need re-reading against it.`,
      );
    }
  }
  if (/unifamiliar/i.test(blob)) {
    throw new Error(
      `EE_CMC: the footnote now mentions a "unifamiliar" model. The page says in so many ` +
        `words that this table prices apartment buildings only — if that has changed, the ` +
        `page has to change with it.`,
    );
  }
}

// ── Output ─────────────────────────────────────────────────────────────────

/** JSON with each series on one line, so a monthly refresh is a readable diff
 * rather than nine thousand changed lines. */
function format(data: unknown): string {
  const json = JSON.stringify(data, null, 2);
  return `${json.replace(
    /\[\n\s+((?:[^[\]{}]|\n)*?)\n\s+\]/g,
    (_, body: string) => `[${body.trim().replace(/\s*\n\s*/g, " ")}]`,
  )}\n`;
}

const ars = (v: number): string =>
  `$${Math.round(v).toLocaleString("es-AR")}/m²`;

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  console.log("discovering current file URLs…");
  const index = await discover();

  const fetchTable = async (code: string): Promise<Buffer> => {
    const url = index.get(code);
    if (!url) {
      throw new Error(
        `${code} is not listed on the section indexes any more. Open ${INDEX_PAGES.join(" and ")} and check whether IDECBA renamed or retired the table.`,
      );
    }
    console.log(`  ${code}  ${url.split("/").slice(-3).join("/")}`);
    return Buffer.from(
      await (
        await fetch(url, { signal: AbortSignal.timeout(60_000) })
      ).arrayBuffer(),
    );
  };

  const costo = parse(await fetchTable(COSTO.code), COSTO);
  const icc = parse(await fetchTable(ICC.code), ICC);

  assertKnownFigures(costo.rows);
  assertModels(costo.notes);

  // ── One axis for both, and no holes in it ────────────────────────────────
  // The page draws the cost and the index against each other, so a month present
  // in one and missing from the other is not something to paper over.
  const keys = [...costo.rows.keys()].sort();
  const first = keys[0];
  const last = keys[keys.length - 1];
  const periods = months(first, last);
  if (periods.length !== keys.length) {
    const missing = periods.filter((p) => !costo.rows.has(p));
    throw new Error(
      `${COSTO.code}: ${first}→${last} is ${periods.length} months but only ${keys.length} were read. Missing: ${missing.join(", ")}`,
    );
  }
  for (let i = 1; i < keys.length; i++) {
    if (ordinal(keys[i]) !== ordinal(keys[i - 1]) + 1) {
      throw new Error(
        `${COSTO.code}: expected consecutive months, got ${keys[i - 1]} → ${keys[i]}`,
      );
    }
  }
  const iccMissing = periods.filter((p) => !icc.rows.has(p));
  if (iccMissing.length) {
    throw new Error(
      `${ICC.code}: no data for ${iccMissing.join(", ")}, which ${COSTO.code} publishes. ` +
        `IDECBA has released a partial update; re-run once the rest lands.`,
    );
  }

  const base = /Base promedio (\d{4}) = 100/.exec(icc.notes.join("\n"));
  if (!base) {
    throw new Error(
      `${ICC.code}: the footnote no longer states the index base ("Base promedio YYYY = 100"). ` +
        `The page prints the base beside the index and can't invent it.`,
    );
  }

  const series = (
    src: Map<string, Record<string, number>>,
    id: string,
    decimals: number,
  ): number[] =>
    periods.map((p) => {
      const f = 10 ** decimals;
      return Math.round(src.get(p)![id] * f) / f;
    });

  const out = {
    id: "costo-construccion-caba",
    title:
      "Costo de construcción del metro cuadrado y Índice del Costo de la Construcción. Ciudad de Buenos Aires",
    source: "Instituto de Estadística y Censos de la Ciudad de Buenos Aires",
    sourceUrl:
      "https://www.estadisticaciudad.gob.ar/eyc/categoria-banco-datos/costo-de-construccion-por-metro-cuadrado/",
    sourceNote:
      "IDECBA (Jefatura de Gabinete de Ministros - GCBA). Costo directo de construcción: materiales, mano de obra y gastos generales. No incluye el terreno, los honorarios profesionales, los derechos de construcción, el IVA, los gastos financieros ni el beneficio de la empresa constructora.",
    unit: "ARS/m2",
    iccBase: `Base promedio ${base[1]} = 100`,
    /** The footnote that defines the four models, verbatim, so the labels in the
     * data module can be checked against the source without opening it. */
    modelsNote: (
      costo.notes.find((n) => /Modelos de vivienda/i.test(n)) ?? ""
    ).replace(/\r/g, ""),
    files: { costo: COSTO.code, icc: ICC.code },
    generatedBy: "scripts/fetch-caba-construccion.ts",
    periods,
    // Either table can flag a month with IDECBA's asterisk; recorded here
    // exactly as the source marks it.
    //
    // Read it as "the source still shows an asterisk here", not as "this figure
    // is about to change". EE_CMC carries one on the December of every year back
    // to 2015 — a flag set when that December was the newest month and never
    // cleared, as EE_ICC_02-16's identical Decembers, unasterisked, show. So the
    // data module surfaces provisionality only for the most recent month, which
    // is the one where it means what it says; see `IS_PROVISIONAL` there.
    provisional: periods.filter(
      (p) => costo.provisional.has(p) || icc.provisional.has(p),
    ),
    // Pesos per m², to the peso. The source carries centavos, which on a figure
    // in the millions is precision nobody can use.
    costo: Object.fromEntries(
      Object.keys(COSTO.columns).map((id) => [id, series(costo.rows, id, 0)]),
    ),
    // Index points, two decimals — the source's own precision, and the series is
    // read as ratios so the decimals do work here.
    icc: Object.fromEntries(
      Object.keys(ICC.columns).map((id) => [id, series(icc.rows, id, 2)]),
    ),
  };

  const text = format(out);

  const at = periods.length - 1;
  console.log(
    `\n  ${periods[0]} → ${periods.at(-1)}  (${periods.length} months, ${out.provisional.length} provisional)`,
  );
  console.log(`  costo/m² en ${periods[at]}:`);
  for (const id of Object.keys(COSTO.columns)) {
    console.log(`    ${id.padEnd(6)} ${ars(out.costo[id][at])}`);
  }
  const yearAgo = at - 12;
  if (yearAgo >= 0) {
    const change = (out.costo.total[at] / out.costo.total[yearAgo] - 1) * 100;
    console.log(
      `  interanual (total): ${change > 0 ? "+" : ""}${change.toFixed(1)} %`,
    );
  }
  console.log(
    `  ICC ${out.iccBase}: nivel ${out.icc.nivel[at]} · materiales ${out.icc.materiales[at]} · mano de obra ${out.icc.manoObra[at]} · gastos generales ${out.icc.gastosGenerales[at]}`,
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

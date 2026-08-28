#!/usr/bin/env bun
/**
 * Rebuilds the deeds dataset behind
 * /estadisticas/escrituras-provincia-buenos-aires:
 *
 *   src/content/estadisticas/data/escrituras-pba.json
 *
 * Run: `bun scripts/fetch-pba-escrituras.ts`   (or `bun run data:escrituras`)
 *      `--dry-run`   parse and report without writing
 *
 * ── The source ────────────────────────────────────────────────────────────
 * The Colegio de Escribanos de la Provincia de Buenos Aires — the notaries'
 * body, which registers every deed signed over a property in the province. It
 * is a **census, not a survey**: it counts acts that actually happened at the
 * price actually paid, which is the one thing no listings portal can see.
 *
 * Scope, in the PDF's own words: *actos sobre inmuebles de la Provincia de Bs.
 * As., independientemente de la jurisdicción del escribano* — the property has
 * to be in the province, the notary does not. Rows are by **fecha de
 * escritura**, so the newest months get revised slightly as late filings land;
 * `PROVISIONAL_MONTHS` below is what the page uses to say so.
 *
 * ── Discovery ─────────────────────────────────────────────────────────────
 * The filename encodes its own date range — `…_01_2005_al_06_2026_…` — and so
 * changes every month. Never hardcode it. It is the only `.pdf` on the landing
 * page matching `Estad_compraventas`; the other two hrefs are chart PDFs, which
 * are pictures and carry no text.
 *
 * ── The trap: the column count changes twice ──────────────────────────────
 * The printed header never moves (COMPRAVENTA · HIPOTECA <$60.000 · HIPOTECA
 * resto · FIDEICOMISO, each as Cant. Actos + Total Monto), but the number of
 * columns actually filled shrinks over the series:
 *
 *   from 2005-01   8 columns
 *   from 2009-04   6 — fideicomiso disappears into a unified "actos no
 *                  registrables" code (cód. 800), per the PDF's own footnote
 *   from 2012-01   4 — the hipoteca <$60.000 / resto split collapses into one
 *
 * A parser that assumes eight columns reads hipoteca counts as fideicomiso
 * counts for half the series, and nothing about the output looks wrong. So the
 * shape of every row is asserted against `LAYOUTS` and the run fails if it
 * moves again.
 *
 * The two hipoteca pairs are **summed** into one series, which is what makes a
 * continuous 2005→today mortgage count possible at all. The `<$60.000` leg is
 * tiny throughout (157 acts against 585 in the first month, 5 against 793 by
 * 2011), so the sum is dominated by "resto" on both sides of the 2012 change.
 *
 * ── Refreshing ────────────────────────────────────────────────────────────
 *   bun run data:escrituras
 * Monthly, about two weeks after a month closes. The whole series is in one
 * PDF, so this is a rebuild: throwing the JSON away and regenerating it is
 * safe, unlike `fetch-pba-inmobiliario.ts`.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-serverless";
import { fromOrdinal, ordinal } from "./lib/months";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(
  here,
  "../src/content/estadisticas/data/escrituras-pba.json",
);

const LANDING =
  "https://www.colescba.org.ar/portal/sala-de-prensa/estadisticas";

/** The month the series is expected to start on. Asserted, not assumed: a PDF
 * that silently began in 2010 would otherwise rewrite the page's history. */
const FIRST_PERIOD = "2005-01";

/** Deeds are counted by fecha de escritura, so the tail keeps moving for a
 * while after a month closes. The page marks this many months as provisional. */
const PROVISIONAL_MONTHS = 2;

/** How many numeric columns each row carries, from a given month onward. The
 * whole point of this table is that the parser knows the answer before it
 * counts, so a third change is an error rather than a shift. */
const LAYOUTS = [
  { from: "2005-01", pairs: ["compraventa", "hipMenor", "hipResto", "fide"] },
  { from: "2009-04", pairs: ["compraventa", "hipMenor", "hipResto"] },
  { from: "2012-01", pairs: ["compraventa", "hipoteca"] },
] as const;

type PairName = (typeof LAYOUTS)[number]["pairs"][number];

const layoutFor = (period: string): readonly PairName[] => {
  let found = LAYOUTS[0].pairs as readonly PairName[];
  for (const l of LAYOUTS) {
    if (ordinal(period) >= ordinal(l.from)) found = l.pairs;
  }
  return found;
};

// ── PDF reading ───────────────────────────────────────────────────────────

type Item = { x: number; y: number; s: string };

async function rowsOf(data: Uint8Array): Promise<Item[][]> {
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const out: Item[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    const items = (content.items as { str?: string; transform: number[] }[])
      .filter((i) => i.str?.trim())
      .map((i) => ({
        x: i.transform[4],
        y: i.transform[5],
        s: i.str!.trim(),
      }));
    // Cells of one row share a baseline to within a rounding error; grouping by
    // it is the only reliable way to rebuild a table out of a text stream.
    const byRow = new Map<number, Item[]>();
    for (const it of items) {
      const key = [...byRow.keys()].find((k) => Math.abs(k - it.y) <= 2);
      const y = key ?? it.y;
      if (!byRow.has(y)) byRow.set(y, []);
      byRow.get(y)!.push(it);
    }
    for (const y of [...byRow.keys()].sort((a, b) => b - a)) {
      out.push(byRow.get(y)!.sort((a, b) => a.x - b.x));
    }
  }
  return out;
}

/** `1,022,488,473,130.90` → 1022488473130.9. Anglo separators throughout. */
const num = (s: string): number => Number(s.replace(/,/g, ""));

const NUMERIC = /^[\d,]+(?:\.\d+)?$/;

type Parsed = {
  period: string;
  values: Partial<Record<PairName, { actos: number; monto: number }>>;
  /** The `**` the PDF prints against 2007-12. */
  flagged: boolean;
};

/**
 * One data row of the table.
 *
 * The year is printed only on a partido's first row and has to be carried
 * forward; `Total <year>` lines look exactly like data rows apart from that
 * label and must be skipped rather than parsed. Everything after the month is
 * read in x order and paired off — the columns are consistently ordered, only
 * their *number* changes, so position within the row is what identifies them.
 */
function parseRows(rows: Item[][]): {
  months: Parsed[];
  /** The PDF's own `Total <year>` lines, kept to check the rows against. */
  totals: Map<number, { actos: number; monto: number }>;
} {
  const out: Parsed[] = [];
  const totals = new Map<number, { actos: number; monto: number }>();
  let year: number | null = null;

  for (const cells of rows) {
    const joined = cells.map((c) => c.s).join(" ");
    const totalOf = joined.match(/^Total\s+(\d{4})/);
    if (totalOf) {
      const nums = cells.filter((c) => c.x >= 80 && NUMERIC.test(c.s));
      // Compraventa is always the first pair, whatever the layout.
      if (nums.length >= 2) {
        totals.set(Number(totalOf[1]), {
          actos: num(nums[0].s),
          monto: num(nums[1].s),
        });
      }
      continue;
    }
    if (!/^(?:\*\*\s*)?\d/.test(joined)) continue;

    const flagged = joined.startsWith("**");
    // Labels live left of the first data column; the year (4 digits) and the
    // month (1-2 digits) are the only things printed there.
    const labels = cells
      .filter((c) => c.x < 80)
      .map((c) => c.s.replace(/\*/g, "").trim());
    const nums = cells.filter((c) => c.x >= 80 && NUMERIC.test(c.s));

    let month: number | null = null;
    for (const l of labels) {
      if (/^\d{4}$/.test(l)) year = Number(l);
      else if (/^\d{1,2}$/.test(l)) month = Number(l);
    }
    if (month === null || year === null) continue;
    if (month < 1 || month > 12) {
      throw new Error(`month out of range in row: ${joined}`);
    }

    const period = `${year}-${String(month).padStart(2, "0")}`;
    const expected = layoutFor(period);
    if (nums.length !== expected.length * 2) {
      throw new Error(
        `${period}: expected ${expected.length * 2} figures for layout ` +
          `[${expected.join(", ")}], got ${nums.length} — the PDF's column ` +
          `layout changed. Update LAYOUTS before trusting this run.\n  ${joined}`,
      );
    }

    const values: Parsed["values"] = {};
    expected.forEach((name, i) => {
      values[name] = {
        actos: num(nums[i * 2].s),
        monto: num(nums[i * 2 + 1].s),
      };
    });
    out.push({ period, values, flagged });
  }
  return { months: out, totals };
}

// ── Assembly ──────────────────────────────────────────────────────────────

type Series = {
  compraventaActos: number[];
  compraventaMonto: number[];
  hipotecaActos: number[];
  hipotecaMonto: number[];
  /** Only published until 2009-03; `null` after the code was unified. */
  fideicomisoActos: (number | null)[];
};

function assemble(parsed: Parsed[]): {
  periods: string[];
  series: Series;
  flagged: string[];
} {
  const periods: string[] = [];
  const series: Series = {
    compraventaActos: [],
    compraventaMonto: [],
    hipotecaActos: [],
    hipotecaMonto: [],
    fideicomisoActos: [],
  };
  const flagged: string[] = [];

  for (const row of parsed) {
    const cv = row.values.compraventa;
    if (!cv) throw new Error(`${row.period}: no compraventa columns`);
    // Before 2012 hipotecas are split by amount; the page needs one series, and
    // the two legs are the same act counted under two codes.
    const hip = row.values.hipoteca ?? {
      actos:
        (row.values.hipMenor?.actos ?? 0) + (row.values.hipResto?.actos ?? 0),
      monto:
        (row.values.hipMenor?.monto ?? 0) + (row.values.hipResto?.monto ?? 0),
    };
    periods.push(row.period);
    series.compraventaActos.push(cv.actos);
    series.compraventaMonto.push(cv.monto);
    series.hipotecaActos.push(hip.actos);
    series.hipotecaMonto.push(hip.monto);
    series.fideicomisoActos.push(row.values.fide?.actos ?? null);
    if (row.flagged) flagged.push(row.period);
  }
  return { periods, series, flagged };
}

/** No gap, no repeat, nothing out of order, and the start where it should be.
 * The axis is the part of this dataset a silent error would live in. */
function assertAxis(periods: string[]): void {
  if (periods.length === 0) throw new Error("no rows parsed");
  if (periods[0] !== FIRST_PERIOD) {
    throw new Error(
      `expected the series to start at ${FIRST_PERIOD}, got ${periods[0]}`,
    );
  }
  for (let i = 1; i < periods.length; i++) {
    if (ordinal(periods[i]) !== ordinal(periods[i - 1]) + 1) {
      throw new Error(
        `expected consecutive months, got ${periods[i - 1]} → ${periods[i]} ` +
          `(missing ${fromOrdinal(ordinal(periods[i - 1]) + 1)})`,
      );
    }
  }
}

/**
 * The rows, added up, against the `Total <year>` line the PDF prints under
 * each block.
 *
 * This is the check worth having. The axis guard proves the *labels* are
 * right; this proves the *figures* are — a column read one place to the left
 * would still produce 258 consecutive months, and only fail here. The monto
 * comparison is relative because the PDF rounds its own totals to the cent.
 */
function assertTotals(
  periods: string[],
  series: Series,
  totals: Map<number, { actos: number; monto: number }>,
): void {
  if (totals.size === 0)
    throw new Error("no `Total <year>` lines found to check against");
  for (const [year, expected] of totals) {
    const idx = periods
      .map((p, i) => (p.startsWith(String(year)) ? i : -1))
      .filter((i) => i >= 0);
    const actos = idx.reduce((s, i) => s + series.compraventaActos[i], 0);
    const monto = idx.reduce((s, i) => s + series.compraventaMonto[i], 0);
    if (actos !== expected.actos) {
      throw new Error(
        `${year}: months sum to ${actos} compraventas, the PDF's own total says ${expected.actos}`,
      );
    }
    if (Math.abs(monto - expected.monto) / expected.monto > 1e-9) {
      throw new Error(
        `${year}: months sum to ${monto} in monto, the PDF's own total says ${expected.monto}`,
      );
    }
  }
}

// ── Run ───────────────────────────────────────────────────────────────────

const dryRun = process.argv.includes("--dry-run");

const page = await fetch(LANDING).then((r) => {
  if (!r.ok) throw new Error(`${LANDING} → ${r.status}`);
  return r.text();
});

const links = [
  ...new Set(
    [...page.matchAll(/href="([^"]*Estad_compraventas[^"]*\.pdf)"/g)].map(
      (m) => m[1],
    ),
  ),
];
if (links.length !== 1) {
  throw new Error(
    `expected exactly one Estad_compraventas PDF on the landing page, found ${links.length}:\n  ${links.join("\n  ")}`,
  );
}
const pdfUrl = new URL(links[0], LANDING).toString();
console.log(`pdf  ${pdfUrl}`);

const response = await fetch(pdfUrl);
if (!response.ok) throw new Error(`${pdfUrl} → ${response.status}`);
const bytes = new Uint8Array(await response.arrayBuffer());

const rows = await rowsOf(bytes);
const { months: parsed, totals } = parseRows(rows);
const { periods, series, flagged } = assemble(parsed);
assertAxis(periods);
assertTotals(periods, series, totals);

/** The date the Colegio stamped on the top of the PDF, dd/mm/yyyy. */
const stamped = rows
  .map((cells) => cells.map((c) => c.s).join(" "))
  .find((line) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(line.trim()));

const last = periods[periods.length - 1];
const provisional = periods.slice(-PROVISIONAL_MONTHS);

const out = {
  id: "escrituras-pba",
  title:
    "Escrituras de compraventa e hipotecas sobre inmuebles de la Provincia de Buenos Aires, por mes",
  source: "Colegio de Escribanos de la Provincia de Buenos Aires",
  sourceUrl: LANDING,
  pdfUrl,
  sourceNote:
    "Censo de actos, no encuesta: cuenta las escrituras efectivamente firmadas sobre inmuebles de la provincia, cualquiera sea la jurisdicción del escribano. Ordenadas por fecha de escritura.",
  unit: "cantidad de actos y monto en pesos corrientes",
  generatedBy: "scripts/fetch-pba-escrituras.ts",
  fetchedAt: new Date().toISOString().slice(0, 10),
  pdfDate: stamped?.trim() ?? null,
  lastPeriod: last,
  provisional,
  /** Months the PDF itself marks with `**`, and why. */
  flagged: flagged.map((period) => ({
    period,
    note: "Paro de actividades del Registro de la Propiedad",
  })),
  /** The month from which the source stopped identifying fideicomisos. */
  fideicomisoUntil: "2009-03",
  periods,
  ...series,
};

const total = (a: readonly number[]) => a.reduce((s, v) => s + v, 0);
console.log(
  `rows ${periods.length} · ${periods[0]} → ${last}` +
    (stamped ? ` · PDF fechado ${stamped.trim()}` : ""),
);
console.log(
  `2025 compraventas ${total(
    series.compraventaActos.filter((_, i) => periods[i].startsWith("2025")),
  ).toLocaleString("es-AR")} · hipotecas ${total(
    series.hipotecaActos.filter((_, i) => periods[i].startsWith("2025")),
  ).toLocaleString("es-AR")}`,
);
if (flagged.length) console.log(`flagged ${flagged.join(", ")}`);
console.log(`provisional ${provisional.join(", ")}`);

if (dryRun) {
  console.log("dry run — nothing written");
} else {
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
}

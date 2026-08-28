#!/usr/bin/env bun
/**
 * Rebuilds the quarterly ARS/USD series behind the rentability page:
 *
 *   src/content/estadisticas/data/dolar.json
 *
 * Run: `bun scripts/fetch-dolar.ts`   (or `bun run data:dolar`)
 *      `--dry-run`   fetch and report without writing
 *
 * ── Why this file exists ───────────────────────────────────────────────────
 * IDECBA publishes sale prices in dollars and rents in pesos. Dividing one by
 * the other — which is the whole of `/estadisticas/rentabilidad-alquiler-caba`
 * — needs a rate, and the choice of rate is a methodological decision, not a
 * detail. Baking a quarterly series into the build makes that decision visible,
 * reviewable in a diff, and identical for every reader.
 *
 * ── Why three rates and not one ────────────────────────────────────────────
 * The page quotes the **blue**, and it has to be able to show why. Between the
 * 2019 cepo and its lifting in April 2025 the official rate ran up to half the
 * blue, so the same peso rent converted at the official rate yields nearly
 * twice as much — the difference between "renting out a flat in CABA returned
 * 1,7 % in 2020" and "it returned 3,3 %". Only one of those is true for someone
 * who actually had to buy the dollars, and the page can only say so by putting
 * the three series side by side. So all three are stored, and the page's own
 * figures use the blue.
 *
 * The MEP is here as the corroborating rate rather than as an alternative: it
 * is legally accessible where the blue is not, and it tracks the blue closely
 * enough that the yield computed from either agrees to a few tenths of a point.
 * That agreement is the actual argument for the blue, and it is worth being
 * able to show it rather than assert it.
 *
 * ── Why quarterly averages ─────────────────────────────────────────────────
 * The two IDECBA series are quarterly averages of asking prices, so the rate
 * that converts them has to be the average over the same quarter. A closing or
 * mid-quarter rate would put a point-in-time number over a three-month average
 * and read the difference as a change in the market — which is exactly what a
 * devaluation inside a quarter would manufacture.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fromOrdinal, ordinal } from "./lib/quarters";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(here, "../src/content/estadisticas/data");
const TARGET = path.join(DATA_DIR, "dolar.json");

/** The same API `src/server/fx.ts` uses to price the app's own bills in USD.
 * One source for both, so a figure on a statistics page and a figure in a
 * signed-in user's ledger can never disagree about what a dollar cost. */
const API = "https://api.argentinadatos.com/v1/cotizaciones/dolares";

/**
 * The rates kept, and what each is for.
 *
 * `blue` first because it is the one the page divides by. The order is the
 * order the JSON lists them, which is the order a reviewer reads them in.
 */
const RATES = [
  {
    id: "blue",
    path: "blue",
    label: "Dólar blue",
    note: "Mercado informal. Es la referencia con la que se compran y se venden departamentos en CABA, que se escrituran en billetes.",
  },
  {
    id: "oficial",
    path: "oficial",
    label: "Dólar oficial",
    note: "Tipo de cambio minorista del mercado formal. Entre 2019 y abril de 2025 estuvo separado del resto por el control de cambios.",
  },
  {
    id: "mep",
    path: "bolsa",
    label: "Dólar MEP",
    note: "Dólar bolsa, la vía legal para dolarizar pesos. Se usa aquí como control: la rentabilidad calculada con el MEP y con el blue coinciden.",
  },
] as const;

type RateId = (typeof RATES)[number]["id"];

/** The first quarter kept. The sale series starts in 2017Q1 and the rent series
 * in 2018Q1, so anything earlier could never be joined to either. */
const FROM = "2017Q1";

type ApiRow = { casa: string; compra: number; venta: number; fecha: string };

const quarterOf = (isoDate: string): string =>
  `${isoDate.slice(0, 4)}Q${Math.floor((Number(isoDate.slice(5, 7)) - 1) / 3) + 1}`;

/**
 * Daily quotes → one average per quarter, with the number of quotes behind it.
 *
 * `venta` rather than `compra` or the midpoint: the figure is used to turn a
 * peso rent into dollars, and the landlord doing that is *buying* dollars, so
 * the price they pay is what the seller asks. The gap is under a percent and
 * consistent in sign, but it is a real choice and it may as well be the one
 * that matches what the number is for.
 */
function byQuarter(rows: ApiRow[]): Map<string, { sum: number; days: number }> {
  const out = new Map<string, { sum: number; days: number }>();
  // Some days appear twice in the feed. Last write wins, so a quarter's average
  // is over distinct dates rather than over however many rows the API returned.
  const perDay = new Map<string, number>();
  for (const r of rows) {
    if (!r.fecha || !(r.venta > 0)) continue;
    perDay.set(r.fecha, r.venta);
  }
  for (const [date, venta] of perDay) {
    const q = quarterOf(date);
    const acc = out.get(q) ?? { sum: 0, days: 0 };
    acc.sum += venta;
    acc.days += 1;
    out.set(q, acc);
  }
  return out;
}

/** Arrays on one line, like the IDECBA datasets — a 40-quarter series is
 * reviewable as a row and unreadable as 40 lines. */
function format(data: unknown): string {
  const json = JSON.stringify(data, null, 2);
  return `${json.replace(
    /\[\n\s+((?:[^[\]{}]|\n)*?)\n\s+\]/g,
    (_, body: string) => `[${body.trim().replace(/\s*\n\s*/g, " ")}]`,
  )}\n`;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  const fetched = new Map<RateId, Map<string, { sum: number; days: number }>>();
  for (const rate of RATES) {
    const res = await fetch(`${API}/${rate.path}`);
    if (!res.ok) {
      throw new Error(`${API}/${rate.path} returned ${res.status}`);
    }
    const rows = (await res.json()) as ApiRow[];
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(`${rate.id}: the API returned no quotes`);
    }
    fetched.set(rate.id, byQuarter(rows));
    console.log(`  ${rate.id.padEnd(8)} ${rows.length} daily quotes`);
  }

  // The axis runs to the last quarter the *blue* covers completely. A quarter
  // still in progress would enter the file as an average of however many days
  // have happened so far, and then change under the next refresh without
  // anything in the diff saying why.
  const nowQ = quarterOf(new Date().toISOString().slice(0, 10));
  const last = fromOrdinal(ordinal(nowQ) - 1);
  const periods: string[] = [];
  for (let n = ordinal(FROM); n <= ordinal(last); n++) {
    periods.push(fromOrdinal(n));
  }

  // A quarter with too few quotes is a hole in the source, and averaging it
  // anyway would hide that. 40 is well under a real quarter (~90) and well over
  // anything that could survive a partial outage.
  const MIN_DAYS = 40;
  const series: Record<string, (number | null)[]> = {};
  const days: Record<string, number[]> = {};
  for (const rate of RATES) {
    const q = fetched.get(rate.id)!;
    series[rate.id] = periods.map((p) => {
      const acc = q.get(p);
      if (!acc || acc.days < MIN_DAYS) {
        // The MEP series starts in late 2018 and legitimately has no earlier
        // quarters. `null` for those, never 0 — a zero rate would divide a peso
        // rent into an infinite dollar one rather than fail. Anything else
        // missing is a fault worth stopping the refresh for.
        if (rate.id === "mep" && ordinal(p) < ordinal("2019Q1")) return null;
        throw new Error(
          `${rate.id}: ${p} has ${acc?.days ?? 0} quotes, expected at least ${MIN_DAYS}`,
        );
      }
      return Math.round((acc.sum / acc.days) * 100) / 100;
    });
    days[rate.id] = periods.map((p) => q.get(p)?.days ?? 0);
  }

  const out = {
    id: "dolar",
    title: "Tipo de cambio peso/dólar, promedio trimestral",
    source: "ArgentinaDatos",
    sourceUrl: "https://argentinadatos.com/",
    sourceNote:
      "Promedio simple de las cotizaciones diarias de venta de cada trimestre. Se usa para convertir a dólares los alquileres que IDECBA publica en pesos.",
    unit: "ARS por USD",
    rates: RATES.map((r) => ({ id: r.id, label: r.label, note: r.note })),
    generatedBy: "scripts/fetch-dolar.ts",
    periods,
    /** Quotes behind each average — the file's own honesty column. */
    days,
    series,
  };

  const text = format(out);

  console.log(
    `\n  ${periods[0]} → ${periods.at(-1)}  (${periods.length} quarters)`,
  );
  const li = periods.length - 1;
  for (const rate of RATES) {
    console.log(
      `  ${rate.id.padEnd(8)} último ${String(series[rate.id][li]).padStart(9)}  ` +
        `(${days[rate.id][li]} días)`,
    );
  }
  const gap = series.blue[li]! / series.oficial[li]! - 1;
  console.log(
    `  brecha blue/oficial en ${periods[li]}: ${(gap * 100).toFixed(1)} %`,
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

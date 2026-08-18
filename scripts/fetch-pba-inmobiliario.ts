#!/usr/bin/env bun
/**
 * Rebuilds the asking-price dataset behind
 * /estadisticas/precio-m2-provincia-buenos-aires:
 *
 *   src/content/estadisticas/data/venta-pba.json
 *
 * Run: `bun scripts/fetch-pba-inmobiliario.ts`   (or `npm run data:pba`)
 *      `--dry-run`   parse and report without writing
 *      `--months=N`  how far back to look (default 14)
 *
 * ── THIS SCRIPT ACCUMULATES. NEVER MAKE IT OVERWRITE. ─────────────────────
 * Every other data script in this directory is a *rebuild*: the agency keeps
 * the whole series on its site, so the JSON can be thrown away and regenerated
 * from scratch. Not this one. Zonaprop publishes one PDF a month and **deletes
 * it after about eleven**, so the source can never be asked for a period older
 * than last spring.
 *
 * That makes `venta-pba.json` the only file in this directory that is a
 * *record* rather than a cache: the months in it that have fallen off
 * Zonaprop's site exist nowhere else. So this script reads the existing JSON,
 * merges what it can still download into it, and writes the union. A rewrite
 * that starts from an empty object silently truncates the series to whatever
 * is online today, and the loss is unrecoverable.
 *
 * Corollary: run it every month. A gap of a year is a permanent hole.
 *
 * ── The source ────────────────────────────────────────────────────────────
 * Zonaprop's "Index" reports — monthly PDFs of asking prices computed over
 * every listing on the site. Not an official statistic and there is no official
 * alternative: no agency publishes a price per m² for the province, which is
 * the whole reason the page has to explain what it is quoting. The blog's HTML
 * is behind a Cloudflare challenge (403), but `wp-content/uploads` serves
 * normally, and the URLs are fully predictable — which is why this discovers
 * files by constructing URLs rather than by scraping an index page.
 *
 * ── The report families, and the break in 2026-02 ─────────────────────────
 * The reports were restructured, and it is the one thing here that cannot be
 * inferred from the data:
 *
 *   until 2026-01   two reports — "GBA Norte" and "GBA Oeste y Sur"
 *   2026-02         nothing published, or published and already deleted
 *   from 2026-03    three reports — Norte, Oeste, Sur; Sur adds La Plata
 *
 * Each report publishes its own aggregate index, so "GBA OESTE" means *oeste
 * and sur together* before the split and *oeste alone* after. Those are two
 * different series with one name — 1.642 in January against 1.576 in March is a
 * change of definition, not a fall in prices. They are stored under separate
 * keys (`oeste-sur` and `oeste`) for exactly that reason, and nothing should
 * ever join them into one line.
 *
 * Per-partido figures are unaffected: a partido's own number means the same
 * thing on both sides of the split.
 *
 * ── Refreshing ────────────────────────────────────────────────────────────
 * Run it, read the summary it prints — it names every period it added and every
 * one it could not reach — and commit the diff. Zonaprop publishes about three
 * weeks after a month closes.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument, resolvePDFJS } from "pdfjs-serverless";
import {
  findPartido,
  partidosOfReport,
  PRICED,
  type ReportId,
} from "../src/content/shared/pba";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "../src/content/estadisticas/data/venta-pba.json");

const BASE = "https://www.zonaprop.com.ar/blog/wp-content/uploads";
const SOURCE_PAGE = "https://www.zonaprop.com.ar/blog/zpindex/gba-venta/";

/** A report family, and the aggregate key its own index is stored under. The
 * `from`/`until` bounds are the restructure described in the header. */
const FAMILIES = [
  { slug: "NORTE", key: "norte" as const, reports: ["norte"] as ReportId[] },
  {
    // Before the split this file was "GBA Oeste y Sur" and carried both.
    slug: "OESTE",
    key: "oeste-sur" as const,
    reports: ["oeste", "sur"] as ReportId[],
    until: "2026-02",
    // La Plata was not in it. Zonaprop started pricing the partido with the new
    // Sur report, so it has no figure before 2026-03 and never will.
    excludes: ["la-plata"],
  },
  {
    slug: "OESTE",
    key: "oeste" as const,
    reports: ["oeste"] as ReportId[],
    from: "2026-03",
  },
  {
    slug: "SUR",
    key: "sur" as const,
    reports: ["sur"] as ReportId[],
    from: "2026-03",
  },
];

type AggKey = (typeof FAMILIES)[number]["key"];

/** A row of the "Precio según municipio" table. */
type Row = { name: string; usd: number; mes: number; anual: number };

type Item = { x: number; y: number; s: string };

/** Series-major, like `venta-caba.json`: one array per partido, aligned to
 * `periods`, `null` where that month was never captured. */
type Series = {
  usd: (number | null)[];
  mes: (number | null)[];
  anual: (number | null)[];
};
type ZonaSeries = Series & { amb2: (number | null)[]; amb3: (number | null)[] };

type File = {
  periods: string[];
  partidos: Record<string, Series>;
  zonas: Record<string, ZonaSeries>;
  [k: string]: unknown;
};

// ── PDF reading ───────────────────────────────────────────────────────────

async function pagesOf(data: Uint8Array): Promise<Item[][]> {
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const out: Item[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const c = await (await doc.getPage(p)).getTextContent();
    out.push(
      (c.items as { str?: string; transform: number[] }[])
        .filter((i) => i.str?.trim())
        .map((i) => ({
          x: i.transform[4],
          y: i.transform[5],
          s: i.str!.trim(),
        })),
    );
  }
  return out;
}

const NUM = /^-?[\d.,]+$/;
const PCT = /^-?[\d.,]+%$/;

/** Zonaprop mixes separators *within one PDF* — the municipio table writes
 * `2,368` and the unit page writes `2.385`. Both are thousands separators and
 * neither file ever prints a decimal on these figures, so strip both. */
const num = (s: string): number => Number(s.replace(/[.,%\s]/g, ""));

/** Percentages do carry one decimal: `-0.4%`. */
const pct = (s: string): number => Number(s.replace(/[%,]/g, ""));

/**
 * The per-municipio table, read by column position rather than by reading
 * order.
 *
 * Reading order does not work here and the failure is silent. The page draws a
 * map on the left with the municipio names labelled on it, and those labels
 * interleave with the table's own rows in the text stream. In the January
 * Norte report the stream runs `SAN / MIGUEL / 1,599 / MALVINAS ARGENTINAS /
 * 2.2%` — the 1.599 is Malvinas Argentinas's, sitting between the two halves of
 * a map label. Pairing each number with the nearest preceding name gives San
 * Miguel a figure that is not its own, and nothing about the output looks wrong.
 *
 * Geometry has no such ambiguity: the table occupies the right-hand third of
 * the page in four right-aligned columns, and every cell of a row shares a
 * baseline. So: keep items right of the map, group by y, and split by x.
 */
function municipios(items: Item[]): Row[] {
  const rows = new Map<number, Item[]>();
  for (const it of items) {
    if (it.x < 395) continue; // the map and its labels
    if (it.y > 290) continue; // the column headers
    const key = [...rows.keys()].find((k) => Math.abs(k - it.y) <= 3);
    const y = key ?? Math.round(it.y);
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y)!.push(it);
  }
  const out: Row[] = [];
  for (const y of [...rows.keys()].sort((a, b) => b - a)) {
    const cells = rows.get(y)!.sort((a, b) => a.x - b.x);
    const name = cells
      .filter((c) => c.x < 505)
      .map((c) => c.s)
      .join(" ")
      .trim();
    const usd = cells.filter((c) => c.x >= 505 && c.x < 628 && NUM.test(c.s));
    const pcts = cells.filter((c) => c.x >= 628 && PCT.test(c.s));
    // A row that isn't name + one figure + two percentages is not a data row.
    if (!name || usd.length !== 1 || pcts.length !== 2) continue;
    out.push({
      name,
      usd: num(usd[0].s),
      mes: pct(pcts[0].s),
      anual: pct(pcts[1].s),
    });
  }
  return out;
}

/**
 * The "Unidad media" page: price per m² for the report's typical 2- and
 * 3-ambiente unit. Two panels side by side, the 2-ambiente one on the left.
 *
 * Read from the *joined line* rather than from individual items, because the
 * PDF is inconsistent about where it breaks them: some issues emit `Precio
 * 2.289 USD m2` as one string, others as three (`Precio` · `2.385` · `USD m2`).
 * Both join to the same line, and the regex does not care which it was. Reading
 * the item after a bare "Precio" label — the obvious approach — silently
 * returns nothing on every issue that does not split, which is most of them.
 */
function unidadMedia(items: Item[]): {
  amb2: number | null;
  amb3: number | null;
} {
  const lines = new Map<number, Item[]>();
  for (const it of items) {
    const key = [...lines.keys()].find((k) => Math.abs(k - it.y) <= 2);
    const y = key ?? Math.round(it.y);
    if (!lines.has(y)) lines.set(y, []);
    lines.get(y)!.push(it);
  }
  const found: { x: number; v: number }[] = [];
  for (const cells of lines.values()) {
    // Both panels sit on the same baseline, so a line holds *two* "Precio"
    // labels and matching once per line finds only the 2-ambiente one. Tokenise
    // instead — each word keeps its item's x, which is enough to order two
    // panels 230 units apart — and take every number that follows a "Precio".
    const tokens = cells
      .sort((a, b) => a.x - b.x)
      .flatMap((c) => c.s.split(/\s+/).map((w) => ({ x: c.x, w })));
    for (let i = 0; i < tokens.length - 1; i++) {
      if (!/^Precio$/i.test(tokens[i].w)) continue;
      const next = tokens[i + 1];
      if (NUM.test(next.w)) found.push({ x: tokens[i].x, v: num(next.w) });
    }
  }
  found.sort((a, b) => a.x - b.x);
  return { amb2: found[0]?.v ?? null, amb3: found[1]?.v ?? null };
}

// ── Periods ───────────────────────────────────────────────────────────────

const addMonths = (p: string, n: number): string => {
  const [y, m] = p.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};

/** Zonaprop files a report under the month it was *published*, which is the
 * month after the data — except when it slips, which it does. Both are tried. */
const urlsFor = (slug: string, period: string): string[] =>
  [1, 2].map(
    (off) =>
      `${BASE}/${addMonths(period, off).replace("-", "/")}/INDEX_GBA_${slug}_REPORTE_${period}.pdf`,
  );

async function download(urls: string[]): Promise<Uint8Array | null> {
  for (const url of urls) {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
  }
  return null;
}

// ── Merge ─────────────────────────────────────────────────────────────────

const blank = (n: number): (number | null)[] => Array(n).fill(null);

/** Read what is already on disk. Missing is fine — the first run has nothing to
 * preserve — but a *malformed* file is not, because writing over it would
 * destroy the only copy of the old periods. */
function existing(): File {
  if (!existsSync(OUT)) return { periods: [], partidos: {}, zonas: {} };
  const raw = JSON.parse(readFileSync(OUT, "utf8")) as Partial<File>;
  if (!Array.isArray(raw.periods) || !raw.partidos || !raw.zonas) {
    throw new Error(
      `${path.relative(process.cwd(), OUT)} exists but is not the expected shape. Refusing to overwrite — the periods in it may be the only copy.`,
    );
  }
  return raw as File;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const back = Number(
    process.argv.find((a) => a.startsWith("--months="))?.slice(9) ?? 14,
  );

  const prev = existing();
  console.log(
    `on disk: ${prev.periods.length} periods${prev.periods.length ? ` (${prev.periods[0]} … ${prev.periods[prev.periods.length - 1]})` : ""}`,
  );

  const now = new Date();
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const wanted = Array.from({ length: back }, (_, i) =>
    addMonths(thisMonth, -i - 1),
  ).reverse();

  await resolvePDFJS();

  /** period → aggregate key → what that report said. */
  const fetched = new Map<
    string,
    Map<AggKey, { rows: Row[]; amb2: number | null; amb3: number | null }>
  >();
  const misses: string[] = [];

  for (const period of wanted) {
    for (const fam of FAMILIES) {
      if (fam.from && period < fam.from) continue;
      if (fam.until && period >= fam.until) continue;
      const data = await download(urlsFor(fam.slug, period));
      if (!data) {
        misses.push(`${period} ${fam.key}`);
        continue;
      }
      const pages = await pagesOf(data);
      const table = pages.find((p) =>
        p.some((i) => /Precio seg[úu]n municipio/i.test(i.s)),
      );
      const unit = pages.find((p) => p.some((i) => /Unidad media/i.test(i.s)));
      if (!table) {
        throw new Error(
          `${period} ${fam.key}: no "Precio según municipio" page. The report layout changed — re-read the parser before trusting anything it returns.`,
        );
      }
      const rows = municipios(table);
      // Every partido the family covers must be present. A silently shorter
      // table is how a restructure like 2026-03 would slip through unnoticed.
      const excluded = new Set<string>(fam.excludes ?? []);
      const expect = fam.reports
        .flatMap((r) => partidosOfReport(r))
        .filter((p) => !excluded.has(p.id));
      const got = new Set(
        rows.map((r) => findPartido(r.name)?.id).filter(Boolean),
      );
      const absent = expect.filter((p) => !got.has(p.id));
      if (absent.length) {
        throw new Error(
          `${period} ${fam.key}: report is missing ${absent.map((p) => p.label).join(", ")}. Zonaprop restructured the reports — update FAMILIES and src/content/shared/pba.ts.`,
        );
      }
      if (!fetched.has(period)) fetched.set(period, new Map());
      fetched.get(period)!.set(fam.key, {
        rows,
        ...(unit ? unidadMedia(unit) : { amb2: null, amb3: null }),
      });
    }
  }

  // ── Union of what was on disk and what came down ────────────────────────
  const periods = [...new Set([...prev.periods, ...fetched.keys()])].sort();
  const added = periods.filter((p) => !prev.periods.includes(p));

  const partidos: Record<string, Series> = {};
  for (const p of PRICED) {
    const old = prev.partidos[p.id];
    partidos[p.id] = {
      usd: blank(periods.length),
      mes: blank(periods.length),
      anual: blank(periods.length),
    };
    // Carry the old values across, matched by period rather than by index —
    // `periods` has grown and the indices have shifted.
    if (old) {
      for (let i = 0; i < prev.periods.length; i++) {
        const at = periods.indexOf(prev.periods[i]);
        partidos[p.id].usd[at] = old.usd?.[i] ?? null;
        partidos[p.id].mes[at] = old.mes?.[i] ?? null;
        partidos[p.id].anual[at] = old.anual?.[i] ?? null;
      }
    }
  }

  const zonas: Record<string, ZonaSeries> = {};
  const zonaKeys = [...new Set(FAMILIES.map((f) => f.key))];
  for (const key of zonaKeys) {
    const old = prev.zonas[key];
    zonas[key] = {
      usd: blank(periods.length),
      mes: blank(periods.length),
      anual: blank(periods.length),
      amb2: blank(periods.length),
      amb3: blank(periods.length),
    };
    if (old) {
      for (let i = 0; i < prev.periods.length; i++) {
        const at = periods.indexOf(prev.periods[i]);
        for (const f of ["usd", "mes", "anual", "amb2", "amb3"] as const) {
          zonas[key][f][at] = old[f]?.[i] ?? null;
        }
      }
    }
  }

  // Freshly parsed values win: Zonaprop revises a month in the issue after it.
  let cells = 0;
  for (const [period, byFamily] of fetched) {
    const at = periods.indexOf(period);
    for (const [key, { rows, amb2, amb3 }] of byFamily) {
      for (const row of rows) {
        const partido = findPartido(row.name);
        if (partido) {
          partidos[partido.id].usd[at] = row.usd;
          partidos[partido.id].mes[at] = row.mes;
          partidos[partido.id].anual[at] = row.anual;
          cells++;
          continue;
        }
        // Not a partido: the aggregate row ("GBA NORTE", "GBA OESTE", …).
        if (/^GBA\b/i.test(row.name)) {
          zonas[key].usd[at] = row.usd;
          zonas[key].mes[at] = row.mes;
          zonas[key].anual[at] = row.anual;
          continue;
        }
        throw new Error(
          `${period} ${key}: unrecognised table row ${JSON.stringify(row.name)}. Either a new partido was added — put it in src/content/shared/pba.ts — or the parser is reading the wrong column.`,
        );
      }
      zonas[key].amb2[at] = amb2;
      zonas[key].amb3[at] = amb3;
    }
  }

  const out = {
    id: "venta-pba",
    title:
      "Precio de publicación del m² de departamentos en venta, por partido",
    source: "Zonaprop — Index",
    sourceUrl: SOURCE_PAGE,
    sourceNote:
      "Precios de publicación calculados sobre los avisos del portal, no precios de escrituración. No existe una serie oficial equivalente para la provincia.",
    unit: "USD por m²",
    generatedBy: "scripts/fetch-pba-inmobiliario.ts",
    accumulates: true,
    periods,
    partidos,
    zonas,
  };

  console.log(
    `periods ${periods.length} (${periods[0]} … ${periods[periods.length - 1]})   added ${added.length ? added.join(", ") : "none"}   partido-months written ${cells}`,
  );
  const holes = periods.filter((p) =>
    PRICED.every((x) => partidos[x.id].usd[periods.indexOf(p)] === null),
  );
  if (holes.length)
    console.log(`periods with no data at all: ${holes.join(", ")}`);
  if (misses.length) console.log(`not downloadable: ${misses.join(" · ")}`);

  const text = `${JSON.stringify(out, null, 2)}\n`;
  if (dryRun) {
    console.log(
      `--dry-run: not writing (${(text.length / 1024).toFixed(0)} KB)`,
    );
    return;
  }
  writeFileSync(OUT, text);
  console.log(
    `wrote ${path.relative(process.cwd(), OUT)} (${(text.length / 1024).toFixed(0)} KB)`,
  );
}

await main();

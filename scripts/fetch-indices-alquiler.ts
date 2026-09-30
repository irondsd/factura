#!/usr/bin/env bun
/**
 * Rebuilds the two index series behind <CalculadoraAlquiler />:
 *
 *   src/content/guias/data/indices-alquiler.json
 *
 * Run: `bun scripts/fetch-indices-alquiler.ts`   (or `bun run data:alquiler`)
 *      `--dry-run`   fetch, validate and report without writing
 *
 * ── Sources ────────────────────────────────────────────────────────────────
 * ICL  BCRA "Principales variables", idVariable 40, "Índice para Contratos de
 *      Locación (base 30.6.20=1)": one value per calendar day, two decimals.
 *      The BCRA publishes each day's value a few weeks ahead, so a refresh
 *      extends the series past today.
 * IPC  INDEC `serie_ipc_divisiones.csv`: Codigo 0 (nivel general), Region
 *      Nacional, `Indice_IPC` (base diciembre 2016 = 100). Published around
 *      the 13th of the following month.
 *
 * Refresh after INDEC's monthly release; the ICL comes along for free. Every
 * value already in the file must come back unchanged: neither organism
 * revises these series, so a difference means the source changed shape and a
 * person should look before the calculator starts quoting it. `--force`
 * accepts the new values anyway.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertIndices,
  lastDay,
  lastMonth,
  type Indices,
} from "../src/lib/indicesAlquiler";

const here = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.join(
  here,
  "../src/content/guias/data/indices-alquiler.json",
);

const ICL_API = "https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/40";
const ICL_START = "2020-07-01";
const IPC_CSV =
  "https://www.indec.gob.ar/ftp/cuadros/economia/serie_ipc_divisiones.csv";
const IPC_START = "2016-12";

type File = {
  icl: { source: string; start: string; values: number[] };
  ipc: { source: string; start: string; values: number[] };
};

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;

async function fetchIcl(): Promise<number[]> {
  // Far enough ahead to catch every value already published.
  const hasta = new Date(Date.now() + 120 * DAY_MS).toISOString().slice(0, 10);
  const rows: { fecha: string; valor: number }[] = [];
  const limit = 1000;
  for (let offset = 0; ; offset += limit) {
    const url = `${ICL_API}?desde=${ICL_START}&hasta=${hasta}&limit=${limit}&offset=${offset}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    const body = (await response.json()) as {
      metadata: { resultset: { count: number } };
      results: { idVariable: number; detalle: typeof rows }[];
    };
    const page = body.results[0];
    if (page?.idVariable !== 40) throw new Error("BCRA: unexpected variable");
    rows.push(...page.detalle);
    if (offset + limit >= body.metadata.resultset.count) break;
  }

  rows.sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (rows[0]?.fecha !== ICL_START) {
    throw new Error(`BCRA: ICL starts on ${rows[0]?.fecha}, expected ${ICL_START}`);
  }
  rows.forEach((row, i) => {
    if (dayNumber(row.fecha) !== dayNumber(ICL_START) + i) {
      throw new Error(`BCRA: ICL is missing a day before ${row.fecha}`);
    }
  });
  // The API serialises the two-decimal index as a float; round the noise off.
  return rows.map((row) => Math.round(row.valor * 100) / 100);
}

async function fetchIpc(): Promise<number[]> {
  const response = await fetch(IPC_CSV);
  if (!response.ok) throw new Error(`${IPC_CSV} returned ${response.status}`);
  const csv = new TextDecoder("windows-1252").decode(
    new Uint8Array(await response.arrayBuffer()),
  );
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(";");
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`INDEC: missing column ${name}`);
    return i;
  };
  const [codigo, periodo, indice, region] = [
    col("Codigo"),
    col("Periodo"),
    col("Indice_IPC"),
    col("Region"),
  ];

  const byPeriod = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const cells = line.split(";");
    if (cells[codigo]?.trim() !== "0" || cells[region]?.trim() !== "Nacional") {
      continue;
    }
    const period = cells[periodo].trim();
    const raw = cells[indice].trim();
    if (!/^\d+(,\d+)?$/.test(raw)) {
      throw new Error(`INDEC: ${period} Indice_IPC ${JSON.stringify(raw)}`);
    }
    if (byPeriod.has(period)) throw new Error(`INDEC: duplicate ${period}`);
    byPeriod.set(period, Number(raw.replace(",", ".")));
  }

  const values: number[] = [];
  let [y, m] = IPC_START.split("-").map(Number);
  for (;;) {
    const value = byPeriod.get(`${y}${String(m).padStart(2, "0")}`);
    if (value === undefined) break;
    values.push(value);
    m += 1;
    if (m > 12) [y, m] = [y + 1, 1];
  }
  if (values[0] !== 100) {
    throw new Error(`INDEC: ${IPC_START} should be the base (100), got ${values[0]}`);
  }
  if (values.length < byPeriod.size - 1) {
    // Anything after the first gap was dropped; only fine if nothing follows.
    throw new Error("INDEC: the national series has a gap");
  }
  return values;
}

function changedPrefix(
  name: string,
  before: readonly number[],
  after: readonly number[],
): string[] {
  const problems: string[] = [];
  if (after.length < before.length) {
    problems.push(`${name}: ${before.length} values before, ${after.length} now`);
  }
  before.forEach((value, i) => {
    if (i < after.length && after[i] !== value) {
      problems.push(`${name}[${i}]: ${value} → ${after[i]}`);
    }
  });
  return problems;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");

  const [icl, ipc] = await Promise.all([fetchIcl(), fetchIpc()]);
  const next: File = {
    icl: { source: ICL_API, start: ICL_START, values: icl },
    ipc: { source: IPC_CSV, start: IPC_START, values: ipc },
  };
  assertIndices(next as Indices, "fetched");

  const current = existsSync(TARGET)
    ? (JSON.parse(readFileSync(TARGET, "utf8")) as File)
    : null;
  if (current) {
    const problems = [
      ...changedPrefix("icl", current.icl.values, icl),
      ...changedPrefix("ipc", current.ipc.values, ipc),
    ];
    if (problems.length) {
      console.error(problems.slice(0, 20).join("\n"));
      if (!force) {
        throw new Error(
          `${problems.length} stored values changed at the source; rerun with --force after checking them.`,
        );
      }
    }
  }

  const added = (before: number | undefined, after: number) =>
    before === undefined ? "new" : `+${after - before}`;
  console.log(
    `  ICL ${ICL_START} → ${lastDay(next.icl)} (${added(current?.icl.values.length, icl.length)} days)`,
  );
  console.log(
    `  IPC ${IPC_START} → ${lastMonth(next.ipc)} (${added(current?.ipc.values.length, ipc.length)} months)`,
  );

  if (dryRun) {
    console.log("Dry run: nothing written.");
    return;
  }
  writeFileSync(TARGET, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Wrote ${path.relative(process.cwd(), TARGET)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

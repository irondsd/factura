#!/usr/bin/env bun
/**
 * Extends the monthly IPC dataset behind the seven housing-inflation pages:
 *
 *   src/content/estadisticas/data/ipc-vivienda.json
 *
 * Run: `bun scripts/fetch-ipc-vivienda.ts`   (or `bun run data:ipc`)
 *      `--dry-run`   fetch, validate and report without writing
 *
 * INDEC's divisions CSV contains division 04 for the national total and all
 * six statistical regions. The updater checks every existing point against the
 * current official file, refuses historical changes, and only appends complete
 * consecutive months. All charts, summaries, rankings and footnotes derive
 * from the JSON, so no chart component needs a separate edit.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  IPC_REGION_IDS,
  mergeIpcPoints,
  parseIpcDivisionsCsv,
  type IpcPoint,
} from "./lib/ipc-vivienda";

const SOURCE =
  "https://www.indec.gob.ar/ftp/cuadros/economia/serie_ipc_divisiones.csv";
const here = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.join(
  here,
  "../src/content/estadisticas/data/ipc-vivienda.json",
);

type Dataset = {
  id: string;
  division: string;
  regions: string[];
  points: IpcPoint[];
  [key: string]: unknown;
};

const coverage = (points: readonly IpcPoint[]): string => {
  const first = points[0].period;
  const last = points.at(-1)!.period;
  return (
    `${first.slice(0, 4)}-${first.slice(4, 6)}/` +
    `${last.slice(0, 4)}-${last.slice(4, 6)}`
  );
};

const row = (point: IpcPoint): string =>
  `${point.period}  ` +
  IPC_REGION_IDS.map(
    (region) => `${region}=${String(point[region]).replace(".", ",")}`,
  ).join("  ");

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const current = JSON.parse(readFileSync(TARGET, "utf8")) as Dataset;

  if (current.id !== "ipc-vivienda" || current.division !== "04") {
    throw new Error(
      `unexpected target dataset: id=${current.id}, division=${current.division}`,
    );
  }
  if (current.regions.join(",") !== IPC_REGION_IDS.join(",")) {
    throw new Error(
      `target regions changed: expected ${IPC_REGION_IDS.join(", ")}, got ${current.regions.join(", ")}`,
    );
  }

  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error(`${SOURCE} returned ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const csv = new TextDecoder("windows-1252").decode(bytes);
  const fetched = parseIpcDivisionsCsv(csv, current.points[0].period);
  const { points, added } = mergeIpcPoints(current.points, fetched);

  console.log(
    `  official ${fetched[0].period} → ${fetched.at(-1)!.period} ` +
      `(${fetched.length} months)`,
  );
  console.log(
    `  current  ${current.points[0].period} → ${current.points.at(-1)!.period} ` +
      `(${current.points.length} months)`,
  );

  if (added.length === 0) {
    console.log("\n  already current; nothing to write");
    return;
  }

  console.log(`\n  ${added.length} new month${added.length === 1 ? "" : "s"}:`);
  for (const point of added) console.log(`  ${row(point)}`);
  console.log(`\n  CMS dataset temporalCoverage: ${coverage(points)}`);

  if (dryRun) {
    console.log("\n  --dry-run: not writing");
    return;
  }

  const output = { ...current, points };
  const text = `${JSON.stringify(output, null, 2)}\n`;
  writeFileSync(TARGET, text);
  console.log(
    `\n  wrote ${path.relative(process.cwd(), TARGET)} (${points.length} months)`,
  );
}

await main();

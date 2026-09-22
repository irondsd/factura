#!/usr/bin/env bun
/**
 * Render the shared 16:9 preview template for the commercial-premises guide
 * series. The frame and storefront stay fixed; title, category and motif vary.
 *
 * Examples:
 *   bun run preview:commercial-guide --title "Qué gastos tiene un local comercial" --category "Gastos" --motif gastos --out /tmp/gastos.jpg
 *   bun run preview:commercial-guide --manifest /tmp/commercial-guides.json
 *   bun run preview:commercial-guide --motifs
 */
import { readFileSync } from "node:fs";
import {
  commercialMotifNames,
  isCommercialMotif,
  renderCommercialGuidePreview,
  type CommercialMotif,
} from "./lib/commercialGuidePreview";

type Job = {
  title: string;
  category: string;
  motif: CommercialMotif;
  out: string;
};

function usage(): never {
  console.log(`
Usage
  bun run preview:commercial-guide --title <title> --category <label> --motif <${commercialMotifNames().join("|")}> --out <path>
  bun run preview:commercial-guide --manifest <path.json>
  bun run preview:commercial-guide --motifs
`);
  process.exit(1);
}

function parseArgs(argv: string[]): Record<string, string | true> {
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

function checkJob(job: Job, where: string): void {
  if (!job.title || !job.category || !job.motif || !job.out) {
    throw new Error(`${where}: needs title, category, motif and out.`);
  }
  if (!isCommercialMotif(job.motif)) {
    throw new Error(
      `${where}: unknown motif "${job.motif}". Known: ${commercialMotifNames().join(", ")}.`,
    );
  }
}

const flags = parseArgs(process.argv.slice(2));

if (flags.motifs) {
  console.log(commercialMotifNames().join("\n"));
  process.exit(0);
}

let jobs: Job[];
if (typeof flags.manifest === "string") {
  const manifest = JSON.parse(readFileSync(flags.manifest, "utf8")) as unknown;
  if (!Array.isArray(manifest)) throw new Error("A manifest must be an array.");
  jobs = manifest as Job[];
  jobs.forEach((job, index) => checkJob(job, `${flags.manifest}[${index}]`));
} else if (
  typeof flags.title === "string" &&
  typeof flags.category === "string" &&
  typeof flags.motif === "string" &&
  typeof flags.out === "string"
) {
  jobs = [
    {
      title: flags.title,
      category: flags.category,
      motif: flags.motif as CommercialMotif,
      out: flags.out,
    },
  ];
  checkJob(jobs[0]!, "arguments");
} else {
  usage();
}

for (const job of jobs) {
  await renderCommercialGuidePreview(
    job.title,
    job.category,
    job.motif,
    job.out,
  );
  console.log(`✓ ${job.out}  ${job.motif} · ${job.title}`);
}

console.log(`\n${jobs.length} preview${jobs.length === 1 ? "" : "s"} at 960x540.`);

#!/usr/bin/env bun
/**
 * Builds preview images for the vendor guides that carry a picture of the bill
 * they explain — "Cómo leer la factura de X", "Cómo pagar la factura de X" and
 * the tarifa social pages.
 *
 * The template puts the guide's own bill inside a tilted, ink-stroked card on
 * the site's cream ground, with one motif beside it saying what the guide does
 * with that bill. Every output is exactly 960×540, which is what the listing
 * thumbnail and the article header expect.
 *
 * ── The workflow, end to end ────────────────────────────────────────────────
 * 1. Get the bill image. It is already in the CMS media library (it is the
 *    picture inside the guide), so download it from its `src` URL — the one
 *    `list_media` returns. Do not re-crop or re-touch it first; this script
 *    does the cropping, and it needs the whole page.
 * 2. Run this script to render the preview.
 * 3. Look at the output before uploading. The one thing that goes wrong is the
 *    crop: see `--inset` below.
 * 4. Upload it to the media library and set the page's `metadata.previewMediaId`
 *    — both through the `factura-cms` MCP, which is the only way in. Uploading
 *    is `create_media_upload` → HTTP PUT to the URL it returns →
 *    `complete_media_upload`; put it in the guías collection so it files
 *    alongside the previews already there.
 * 5. `update_content` with the new `previewMediaId`. **`metadata` replaces
 *    wholesale**, so send the page's existing blob back with the one field
 *    added — dropping `faq` or `sources` here is silent and permanent.
 * 6. `set_content_status` to `published`. Ask the person first, every time.
 *
 * Steps 4–6 are not scripted on purpose: they change what the public sees, and
 * the MCP is where that decision is made out loud.
 *
 * ── Run it ──────────────────────────────────────────────────────────────────
 * `bun run preview:guide --bill bill.jpg --motif leer --out edea.jpg`
 * `bun run preview:guide --bill bill.jpg --motif leer --out epec.jpg --inset 6`
 * `bun run preview:guide --manifest batch.json`
 * `bun run preview:guide --motifs`
 *
 * A batch manifest is a JSON array, and is working material rather than
 * something to commit — keep it wherever you are working:
 *
 *     [
 *       { "bill": "bills/edea.jpg",   "motif": "leer",  "out": "out/edea.jpg" },
 *       { "bill": "bills/epec.jpg",   "motif": "pagar", "out": "out/epec-pagar.jpg", "inset": 6 }
 *     ]
 *
 * Guides that share a vendor share a bill: the same source image renders once
 * per motif, which is exactly how the leer/pagar pair ends up distinguishable.
 *
 * ── `--inset`, the only knob you will reach for ──────────────────────────────
 * A percentage trimmed off every side before cropping, for the sample bills
 * that were photographed on a desk instead of scanned. Without it the card
 * frames a strip of wood along one edge. Flat scans want 0 (the default);
 * a page shot on a table usually wants 5 or 6. Render it, look at it, adjust.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  buildPreview,
  findHeadlessShell,
  isMotif,
  MOTIF_NAMES,
  type Motif,
} from "./lib/guidePreview";
import { bold, dim, green, red } from "./lib/content";

type Job = { bill: string; motif: Motif; out: string; inset?: number };

function usage(): never {
  console.log(`
${bold("Usage")}
  bun run preview:guide --bill <path> --motif <${MOTIF_NAMES.join("|")}> --out <path> [--inset N]
  bun run preview:guide --manifest <path.json>
  bun run preview:guide --motifs

${bold("Options")}
  --bill      Source bill image, uncropped. Download it from the media library.
  --motif     Which object goes beside the card. --motifs lists them.
  --out       Where to write the 960x540 JPEG.
  --inset     Percent trimmed off each side before cropping (default 0).
              Use 5-6 for a bill photographed on a desk, 0 for a flat scan.
  --manifest  JSON array of { bill, motif, out, inset? } to build in one pass.
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

/** Validates one job before anything renders, so a typo in a twelve-item
 * manifest fails on the manifest rather than eleven images in. */
function checkJob(job: Job, where: string): void {
  if (!job.bill || !job.motif || !job.out) {
    throw new Error(`${where}: needs \`bill\`, \`motif\` and \`out\`.`);
  }
  if (!isMotif(job.motif)) {
    throw new Error(
      `${where}: unknown motif "${job.motif}". Known: ${MOTIF_NAMES.join(", ")}.`,
    );
  }
  if (!existsSync(job.bill)) {
    throw new Error(`${where}: bill image not found at ${job.bill}`);
  }
}

function main(): void {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.motifs) {
    console.log(
      `\n${bold("Motifs")} — the object beside the bill carries the action:\n`,
    );
    console.log(
      `  ${bold("leer")}    magnifier          "Cómo leer la factura de X"`,
    );
    console.log(
      `  ${bold("pagar")}   phone + pay button "Cómo pagar la factura de X"`,
    );
    console.log(
      `  ${bold("tarifa")}  discount tag       tarifa social, subsidios, descuentos\n`,
    );
    console.log(
      dim(
        "  A leer/pagar pair shares one bill image, so the motif is the only\n" +
          "  thing telling the two rows apart in a listing.\n",
      ),
    );
    return;
  }

  let jobs: Job[];
  if (typeof flags.manifest === "string") {
    const parsed: unknown = JSON.parse(readFileSync(flags.manifest, "utf8"));
    if (!Array.isArray(parsed))
      throw new Error("A manifest must be a JSON array.");
    jobs = parsed as Job[];
    jobs.forEach((job, i) =>
      checkJob(job, `${flags.manifest as string}[${i}]`),
    );
  } else if (typeof flags.bill === "string") {
    const job = {
      bill: flags.bill,
      motif: flags.motif as Motif,
      out: typeof flags.out === "string" ? flags.out : "",
      inset: flags.inset ? Number(flags.inset) : 0,
    };
    checkJob(job, "arguments");
    jobs = [job];
  } else {
    usage();
  }

  // Resolved once and passed down: the scan walks the Playwright cache, and
  // doing that per image in a batch of a dozen is pointless work.
  const shell = findHeadlessShell();

  for (const job of jobs) {
    const dir = path.dirname(job.out);
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    buildPreview(job.bill, job.motif, job.out, job.inset ?? 0, shell);
    console.log(
      `${green("✓")} ${job.out}  ${dim(`${job.motif} · ${job.bill}`)}`,
    );
  }

  console.log(
    `\n${bold(`${jobs.length} preview${jobs.length === 1 ? "" : "s"}`)} at 960x540.\n` +
      dim(
        "Look at them, then upload with the factura-cms MCP — see the header of this file.\n",
      ),
  );
}

try {
  main();
} catch (error) {
  console.error(
    `${red("✗")} ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

import { existsSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, eq, not } from "drizzle-orm";
import { db as database, type Database } from "../src/db/index";
import { billSubmissions } from "../src/db/schema";
import {
  owesAnEmail,
  parserMaterialDue,
  PARSER_MATERIAL,
} from "../src/server/submissions/retention";
import {
  deleteObject,
  getObjectBytes,
  isStorageConfigured,
} from "../src/server/storage";

/** Maintainer tool: take the bills nobody could parse off the platform and onto
 * disk, where you can actually write the parsers they're waiting for.
 *
 * Targets PARSER_MATERIAL — `unrecognized` (no parser matched) and
 * `parse_failed` (one matched but couldn't extract). Everything else expires
 * with the claim window and belongs to cleanupSubmissionFiles instead.
 *
 * Each submission produces up to two files in `samples/`:
 *
 *   <name>.txt   ALWAYS. The extracted text plus a header of everything the row
 *                knows. This is the durable artifact — it's what the parser is
 *                written against, and it survives even when there is no PDF.
 *   <name>.pdf   ONLY when the visitor left "keep my file" checked. Unchecking
 *                it is a promise the original goes away, and copying it to a
 *                laptop is not that. Those rows still yield their .txt, which
 *                is what the checkbox copy says we retain.
 *
 * Once both are on disk the platform has nothing left to hold, so the S3 object
 * is deleted and the ROW IS DELETED — samples/ is the archive now. The one
 * exception is a visitor who left an address and hasn't been emailed yet: that
 * row survives (its PDF does not), because the address exists nowhere else and
 * is the only way to tell them their bill is supported.
 *
 * Usage (the `--` matters: without it dotenv-cli eats the --flags):
 *   npx dotenv -e .env.local -- tsx scripts/pullUnrecognizedSubmissions.ts [flags]
 *   npx dotenv -e .env.prod  -- tsx scripts/pullUnrecognizedSubmissions.ts [flags]
 *
 * Flags:
 *   --keep        download only. Nothing is deleted: not the object, not the row.
 *   --dry-run     list what would be pulled; touch nothing
 *   --out=<dir>   destination directory (default `samples`)
 *   --limit=<n>   cap rows per run (default 200)
 *
 * Idempotent: files already on disk are not re-fetched (the submission id is in
 * the name), and the object is always deleted BEFORE the row that names it, so
 * a failure leaves a row the next run simply retries rather than an orphan in
 * the bucket nothing points at.
 */

type Args = { keep: boolean; dryRun: boolean; outDir: string; limit: number };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const flagValue = (k: string) =>
    argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);

  const rawLimit = flagValue("limit");
  let limit = 200;
  if (rawLimit !== undefined) {
    const n = Number(rawLimit);
    if (!Number.isInteger(n) || n <= 0) {
      console.error("--limit must be a positive integer.");
      process.exit(1);
    }
    limit = n;
  }

  return {
    keep: argv.includes("--keep"),
    dryRun: argv.includes("--dry-run"),
    outDir: flagValue("out") ?? "samples",
    limit,
  };
}

type Row = {
  id: string;
  fileName: string;
  fileBytes: number;
  pageCount: number | null;
  storageKey: string | null;
  keepFile: boolean;
  vendorGuess: string | null;
  outcome: string;
  matchedSlug: string | null;
  matchedVendorName: string | null;
  parseError: string | null;
  rawText: string;
  createdAt: Date;
  heldForEmail: boolean;
};

/** `Edesur (SUR)` → `edesur-sur`; empty guess → `sin-vendor`. */
function slugifyGuess(guess: string | null): string {
  const slug = (guess ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "sin-vendor";
}

/** Stable, readable, collision-free. The short id is what makes reruns skip
 * what we already have, so it has to stay in the name. Returned without an
 * extension — .txt and .pdf are siblings and must sort together. */
function localStem(row: Row): string {
  const day = row.createdAt.toISOString().slice(0, 10);
  const base = path
    .basename(row.fileName, ".pdf")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-60);
  return `${row.outcome}-${slugifyGuess(row.vendorGuess)}-${day}-${row.id.slice(0, 8)}-${base}`;
}

/** The header is what turns a wall of text into something you can write a
 * parser against six months from now: which vendor the visitor said it was,
 * which parser (if any) matched, and how it failed. `notify_email` is
 * deliberately absent — an address belongs in the DB, not in a file on a
 * laptop. */
function textFileBody(row: Row): string {
  const lines = [
    `submission: ${row.id}`,
    `created:    ${row.createdAt.toISOString()}`,
    `outcome:    ${row.outcome}`,
    `file:       ${row.fileName} (${row.fileBytes} bytes` +
      (row.pageCount ? `, ${row.pageCount} pages` : "") +
      `)`,
    `pdf saved:  ${row.keepFile ? "yes" : "no — visitor unchecked “keep my file”"}`,
    `vendor guess: ${row.vendorGuess ?? "(none given)"}`,
  ];
  if (row.matchedSlug)
    lines.push(
      `matched:    ${row.matchedSlug}` +
        (row.matchedVendorName ? ` (${row.matchedVendorName})` : ""),
    );
  if (row.parseError) lines.push(`parse error: ${row.parseError}`);
  return `${lines.join("\n")}\n${"-".repeat(72)}\n${row.rawText}\n`;
}

async function findDue(db: Database, limit: number): Promise<Row[]> {
  const rows = await db
    .select({
      id: billSubmissions.id,
      fileName: billSubmissions.fileName,
      fileBytes: billSubmissions.fileBytes,
      pageCount: billSubmissions.pageCount,
      storageKey: billSubmissions.storageKey,
      keepFile: billSubmissions.keepFile,
      vendorGuess: billSubmissions.vendorGuess,
      outcome: billSubmissions.outcome,
      matchedSlug: billSubmissions.matchedSlug,
      matchedVendorName: billSubmissions.matchedVendorName,
      parseError: billSubmissions.parseError,
      rawText: billSubmissions.rawText,
      createdAt: billSubmissions.createdAt,
      heldForEmail: owesAnEmail(),
    })
    .from(billSubmissions)
    .where(parserMaterialDue())
    .orderBy(asc(billSubmissions.createdAt))
    .limit(limit);
  return rows as Row[];
}

async function main() {
  const args = parseArgs();
  const outDir = path.resolve(args.outDir);
  const due = await findDue(database, args.limit);

  const withPdf = due.filter((r) => r.keepFile && r.storageKey).length;
  const held = due.filter((r) => r.heldForEmail).length;

  console.log(
    `${due.length} submission(s) of ${PARSER_MATERIAL.join("/")}; ` +
      `${withPdf} with a PDF to download` +
      (due.length ? `; writing to ${outDir}` : "") +
      ".",
  );
  if (held)
    console.log(
      `  ${held} row(s) owe the visitor an email — their PDF goes, the row stays.`,
    );

  if (args.dryRun) {
    for (const row of due) {
      const stem = localStem(row);
      const pdf = row.storageKey
        ? row.keepFile
          ? " + .pdf"
          : " (PDF dropped unread, opted out)"
        : "";
      console.log(
        `  ${stem}.txt${pdf}` +
          (args.keep
            ? ""
            : row.heldForEmail
              ? " → row kept (owes email)"
              : " → row deleted"),
      );
    }
    process.exit(0);
  }

  if (due.length === 0) process.exit(0);

  if (withPdf > 0 && !isStorageConfigured())
    console.warn(
      "S3 is not configured — text will be saved but no PDF can be downloaded.",
    );

  await mkdir(outDir, { recursive: true });

  const stats = {
    text: 0,
    pdf: 0,
    skipped: 0,
    objects: 0,
    rows: 0,
    held: 0,
    failed: 0,
  };

  for (const row of due) {
    const stem = path.join(outDir, localStem(row));
    try {
      // 1. Text first, always — it's the artifact that justifies the row's
      //    deletion, so it must be on disk before anything is destroyed.
      if (existsSync(`${stem}.txt`)) {
        stats.skipped++;
      } else {
        await writeAtomic(
          `${stem}.txt`,
          Buffer.from(textFileBody(row), "utf8"),
        );
        stats.text++;
      }

      // 2. The PDF, only if the visitor let us keep it.
      const canFetch = row.storageKey && isStorageConfigured();
      if (row.keepFile && canFetch && !existsSync(`${stem}.pdf`)) {
        const bytes = await getObjectBytes(row.storageKey!);
        if (bytes.byteLength !== row.fileBytes)
          console.warn(
            `[pull] ${row.id}: object is ${bytes.byteLength} B, row says ${row.fileBytes} B`,
          );
        await writeAtomic(`${stem}.pdf`, bytes);
        stats.pdf++;
      }

      if (args.keep) continue;

      // 3. Object before row — the orphan-free invariant. An opted-out PDF is
      //    deleted here too; we simply never read it.
      if (canFetch) {
        await deleteObject(row.storageKey!);
        stats.objects++;
      }

      if (row.heldForEmail) {
        // Keep the row, forget the file. Same shape the retention sweep leaves.
        await database
          .update(billSubmissions)
          .set({ storageKey: null, fileDeletedAt: new Date() })
          .where(eq(billSubmissions.id, row.id));
        stats.held++;
      } else {
        // Re-check the email condition in the WHERE clause: a visitor can leave
        // an address between the SELECT above and now, and losing it to a race
        // is exactly the failure this rule exists to prevent.
        const gone = await database
          .delete(billSubmissions)
          .where(and(eq(billSubmissions.id, row.id), not(owesAnEmail())))
          .returning({ id: billSubmissions.id });
        if (gone.length) {
          stats.rows++;
        } else {
          await database
            .update(billSubmissions)
            .set({ storageKey: null, fileDeletedAt: new Date() })
            .where(eq(billSubmissions.id, row.id));
          stats.held++;
        }
      }
    } catch (err) {
      console.error(`[pull] ${row.id}: ${String(err)}`);
      stats.failed++;
    }
  }

  console.log(
    `Wrote ${stats.text} text file(s) and ${stats.pdf} PDF(s) to ${outDir}` +
      (stats.skipped ? `, ${stats.skipped} already on disk` : "") +
      "." +
      (args.keep
        ? " --keep, so nothing was deleted."
        : ` Deleted ${stats.objects} object(s) and ${stats.rows} row(s)` +
          (stats.held ? `, kept ${stats.held} row(s) owing an email` : "") +
          ".") +
      (stats.failed
        ? ` ${stats.failed} failed and will be retried next run.`
        : ""),
  );
  process.exit(stats.failed > 0 ? 1 : 0);
}

/** Write via a temp name so an interrupted run never leaves a truncated file
 * that the next run then mistakes for one it already has. */
async function writeAtomic(dest: string, bytes: Uint8Array): Promise<void> {
  const tmp = `${dest}.partial`;
  await writeFile(tmp, bytes);
  await rename(tmp, dest);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

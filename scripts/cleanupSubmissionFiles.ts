import { and, asc, isNotNull, isNull, lt, eq, sql } from "drizzle-orm";
import { db as database, type Database } from "../src/db/index";
import { billSubmissions } from "../src/db/schema";
import { SUBMISSION_FILE_GRACE_DAYS } from "../src/lib/limits";
import { deleteObject, isStorageConfigured } from "../src/server/storage";

/** Retention sweep for the public /probar page.
 *
 * Visitors who UNCHECK "keep my file" are promised the stored PDF goes away.
 * This is what keeps that promise. It deletes the S3 object and forgets the key;
 * the extracted text is never touched, in any branch — that's the part that
 * makes a bill worth writing a parser for, and it's what the checkbox copy says
 * we retain.
 *
 * A submission is swept when ALL of:
 *   - keep_file = false          (they opted out)
 *   - claimed_by_user_id is null (nobody saved it to an account; claiming keeps
 *                                 the file regardless, because saving a bill IS
 *                                 asking us to hold it)
 *   - storage_key is not null    (there's still an object to delete)
 *   - older than the grace window
 *
 * Note that keep_file wins unconditionally, including over "unrecognized bills
 * are kept indefinitely". A checkbox that doesn't delete the file is a lie.
 *
 * Usage (the `--` matters: without it dotenv-cli eats the --flags):
 *   npx dotenv -e .env.local -- tsx scripts/cleanupSubmissionFiles.ts [flags]
 *   npx dotenv -e .env.prod  -- tsx scripts/cleanupSubmissionFiles.ts [flags]
 *
 * Flags:
 *   --dry-run       report what would be deleted, touch nothing
 *   --days=<n>      override the grace window (default SUBMISSION_FILE_GRACE_DAYS)
 *   --limit=<n>     cap rows per run (default 500)
 *
 * Idempotent and safe to re-run: deleteObject succeeds on a missing key, and a
 * row whose delete failed keeps its key so the next run retries it.
 */

type Args = { dryRun: boolean; days: number; limit: number };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const flagValue = (k: string) =>
    argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const num = (k: string, fallback: number) => {
    const raw = flagValue(k);
    if (raw === undefined) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      console.error(`--${k} must be a non-negative number.`);
      process.exit(1);
    }
    return n;
  };
  return {
    dryRun: argv.includes("--dry-run"),
    days: num("days", SUBMISSION_FILE_GRACE_DAYS),
    limit: num("limit", 500),
  };
}

export type SweepStats = { found: number; deleted: number; failed: number };

/** The sweep itself, as a plain function so a cron route can be a thin caller
 * over the same logic when you want one. */
export async function sweepSubmissionFiles(
  db: Database,
  opts: { days: number; limit: number; dryRun?: boolean },
): Promise<SweepStats> {
  const cutoff = new Date(Date.now() - opts.days * 24 * 60 * 60 * 1000);

  // Matches bill_submission_sweep_idx exactly.
  const due = await db
    .select({ id: billSubmissions.id, storageKey: billSubmissions.storageKey })
    .from(billSubmissions)
    .where(
      and(
        eq(billSubmissions.keepFile, false),
        isNull(billSubmissions.claimedByUserId),
        isNotNull(billSubmissions.storageKey),
        lt(billSubmissions.createdAt, cutoff),
      ),
    )
    .orderBy(asc(billSubmissions.createdAt))
    .limit(opts.limit);

  const stats: SweepStats = { found: due.length, deleted: 0, failed: 0 };
  if (opts.dryRun) return stats;

  for (const row of due) {
    try {
      // Delete the object BEFORE forgetting the key. The other order turns a
      // storage outage into an orphan we can never find again; this order leaves
      // a row the next run simply retries.
      await deleteObject(row.storageKey!);
      await db
        .update(billSubmissions)
        .set({ storageKey: null, fileDeletedAt: new Date() })
        .where(eq(billSubmissions.id, row.id));
      stats.deleted++;
    } catch (err) {
      console.error(`[sweep] ${row.id}: ${String(err)}`);
      stats.failed++;
    }
  }
  return stats;
}

async function main() {
  const { dryRun, days, limit } = parseArgs();

  if (!isStorageConfigured()) {
    console.error(
      "S3 is not configured, so there are no stored objects to sweep.",
    );
    process.exit(1);
  }

  if (dryRun) {
    const [range] = await database
      .select({
        oldest: sql<Date | null>`min(${billSubmissions.createdAt})`,
        newest: sql<Date | null>`max(${billSubmissions.createdAt})`,
      })
      .from(billSubmissions)
      .where(
        and(
          eq(billSubmissions.keepFile, false),
          isNull(billSubmissions.claimedByUserId),
          isNotNull(billSubmissions.storageKey),
          lt(
            billSubmissions.createdAt,
            new Date(Date.now() - days * 24 * 60 * 60 * 1000),
          ),
        ),
      );
    const { found } = await sweepSubmissionFiles(database, {
      days,
      limit,
      dryRun: true,
    });
    console.log(
      `Dry run: ${found} object(s) past the ${days}-day window would be deleted.`,
    );
    if (range?.oldest)
      console.log(`  oldest ${range.oldest}, newest ${range.newest}`);
    process.exit(0);
  }

  const { found, deleted, failed } = await sweepSubmissionFiles(database, {
    days,
    limit,
  });
  console.log(
    `Swept ${deleted}/${found} object(s) past the ${days}-day window` +
      (failed ? `; ${failed} failed and will be retried next run.` : "."),
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

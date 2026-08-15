import { and, asc, eq, isNotNull, not, sql } from "drizzle-orm";
import { db as database, type Database } from "../src/db/index";
import { billSubmissions } from "../src/db/schema";
import { SUBMISSION_FILE_GRACE_DAYS } from "../src/lib/limits";
import {
  expiredIgnoringEmailHold,
  expiredSubmissionDue,
  optedOutFileDue,
  owesAnEmail,
} from "../src/server/submissions/retention";
import { deleteObject, isStorageConfigured } from "../src/server/storage";

/** Retention broom for the public /probar page. Run it every so often; there is
 * no cron, and that is deliberate — everything here is destructive and the
 * grace window makes running it late harmless.
 *
 * TWO RULES, and they do different things:
 *
 * A · THE PROMISE — `keep_file = false`, unclaimed, past the grace window.
 *   The visitor unchecked "keep my file", so the stored PDF goes. The ROW and
 *   its `raw_text` SURVIVE: that's what the checkbox copy says we retain, and
 *   it's the part worth writing a parser for. Applies to every outcome,
 *   including parser material — a checkbox that doesn't delete the file is a
 *   lie, and pull can still take that bill to disk as a .txt afterwards.
 *
 * B · THE EXPIRY — NOT parser material, unclaimed, past the grace window.
 *   A recognized bill is held for exactly one reason: so the visitor can sign
 *   in and claim it. Past the window nobody is coming and we have no use for a
 *   stranger's electricity bill, so the object AND the row both go, whatever
 *   `keep_file` says. `unrecognized` and `parse_failed` are exempt — those are
 *   pullUnrecognizedSubmissions' job and it archives them to disk first.
 *
 * A row that owes its visitor an email (address left, never written to) is
 * never row-deleted by rule B. Its file still goes; the address is the only way
 * to keep that promise and it exists nowhere else.
 *
 * ORPHAN-FREE: every path deletes the S3 object BEFORE the row that names it.
 * A failed delete leaves the row intact so the next run retries it — the
 * reverse order would strand bytes in the bucket with nothing pointing at them.
 *
 * Usage (the `--` matters: without it dotenv-cli eats the --flags):
 *   npx dotenv -e .env.local -- tsx scripts/cleanupSubmissionFiles.ts [flags]
 *   npx dotenv -e .env.prod  -- tsx scripts/cleanupSubmissionFiles.ts [flags]
 *
 * Flags:
 *   --dry-run       report what would go, touch nothing
 *   --days=<n>      override the grace window (default SUBMISSION_FILE_GRACE_DAYS)
 *   --limit=<n>     cap rows per rule per run (default 500)
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

export type SweepStats = {
  /** Rule A: objects deleted, rows kept. */
  filesSwept: number;
  /** Rule B: rows deleted (with their objects, if any). */
  rowsExpired: number;
  /** Rule B skipped these — they owe the visitor an email. */
  heldForEmail: number;
  failed: number;
};

/** Rule A · honour the unchecked box. Object goes, row stays. */
async function sweepOptedOutFiles(
  db: Database,
  opts: { days: number; limit: number },
): Promise<{ swept: number; failed: number }> {
  const due = await db
    .select({ id: billSubmissions.id, storageKey: billSubmissions.storageKey })
    .from(billSubmissions)
    .where(optedOutFileDue(opts.days))
    .orderBy(asc(billSubmissions.createdAt))
    .limit(opts.limit);

  let swept = 0;
  let failed = 0;
  for (const row of due) {
    try {
      await deleteObject(row.storageKey!);
      await db
        .update(billSubmissions)
        .set({ storageKey: null, fileDeletedAt: new Date() })
        .where(eq(billSubmissions.id, row.id));
      swept++;
    } catch (err) {
      console.error(`[sweep A] ${row.id}: ${String(err)}`);
      failed++;
    }
  }
  return { swept, failed };
}

/** Rule B · expire the unclaimed recognized ones. Object AND row go. */
async function expireUnclaimed(
  db: Database,
  opts: { days: number; limit: number },
): Promise<{ expired: number; held: number; failed: number }> {
  // Selected WITHOUT the email exemption on purpose: an expired submission's
  // FILE goes either way. The exemption protects the address, not the PDF —
  // holding the file too would leave objects nothing will ever collect.
  const due = await db
    .select({ id: billSubmissions.id, storageKey: billSubmissions.storageKey })
    .from(billSubmissions)
    .where(expiredIgnoringEmailHold(opts.days))
    .orderBy(asc(billSubmissions.createdAt))
    .limit(opts.limit);

  let expired = 0;
  let held = 0;
  let failed = 0;
  for (const row of due) {
    try {
      // Object first — see ORPHAN-FREE above.
      if (row.storageKey) await deleteObject(row.storageKey);
      // The email exemption lives in this WHERE clause rather than in the
      // SELECT, so it is also the race guard: a visitor can leave an address
      // between the two, and losing it is exactly what the rule prevents.
      const gone = await db
        .delete(billSubmissions)
        .where(and(eq(billSubmissions.id, row.id), not(owesAnEmail())))
        .returning({ id: billSubmissions.id });
      if (gone.length) {
        expired++;
      } else {
        // Kept for the address. Forget the file we just deleted.
        await db
          .update(billSubmissions)
          .set({ storageKey: null, fileDeletedAt: new Date() })
          .where(eq(billSubmissions.id, row.id));
        held++;
      }
    } catch (err) {
      console.error(`[sweep B] ${row.id}: ${String(err)}`);
      failed++;
    }
  }
  return { expired, held, failed };
}

export async function sweepSubmissions(
  db: Database,
  opts: { days: number; limit: number },
): Promise<SweepStats> {
  const a = await sweepOptedOutFiles(db, opts);
  const b = await expireUnclaimed(db, opts);
  return {
    filesSwept: a.swept,
    rowsExpired: b.expired,
    heldForEmail: b.held,
    failed: a.failed + b.failed,
  };
}

async function report(db: Database, days: number) {
  const [counts] = await db
    .select({
      optedOut: sql<number>`count(*) filter (where ${optedOutFileDue(days)})::int`,
      expiring: sql<number>`count(*) filter (where ${expiredSubmissionDue(days)})::int`,
      expiringWithFile: sql<number>`count(*) filter (where ${expiredIgnoringEmailHold(days)} and ${isNotNull(billSubmissions.storageKey)})::int`,
      held: sql<number>`count(*) filter (where ${expiredIgnoringEmailHold(days)} and ${owesAnEmail()})::int`,
    })
    .from(billSubmissions);
  return counts;
}

async function main() {
  const { dryRun, days, limit } = parseArgs();

  if (!isStorageConfigured())
    console.warn(
      "S3 is not configured — rows will still expire, but no object can be deleted.",
    );

  if (dryRun) {
    const c = await report(database, days);
    console.log(`Dry run, ${days}-day window:`);
    console.log(
      `  A · opted-out files to delete (row kept): ${c?.optedOut ?? 0}`,
    );
    console.log(
      `  B · unclaimed submissions to expire (row deleted): ${c?.expiring ?? 0}`,
    );
    console.log(`      files deleted under B: ${c?.expiringWithFile ?? 0}`);
    console.log(
      `  rows kept because they owe an email (file still deleted): ${c?.held ?? 0}`,
    );
    process.exit(0);
  }

  const stats = await sweepSubmissions(database, { days, limit });
  console.log(
    `Swept ${stats.filesSwept} opted-out file(s); expired ${stats.rowsExpired} unclaimed submission(s)` +
      (stats.heldForEmail
        ? `; held ${stats.heldForEmail} owing an email`
        : "") +
      (stats.failed
        ? `. ${stats.failed} failed and will be retried next run.`
        : "."),
  );
  process.exit(stats.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

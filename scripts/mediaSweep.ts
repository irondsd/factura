/**
 * The media library's housekeeping (cms.md §9.9, §9.10). Safe to run
 * repeatedly; safe to run never, in the sense that nothing breaks — it just
 * means the trash keeps its bytes and abandoned uploads keep their staged
 * objects.
 *
 * Three jobs:
 *
 *   reservations  uploads that were reserved and never finished
 *   replacements expired uploads and superseded masters awaiting deletion
 *   trash         assets past the grace period, plus anything a storage failure
 *                 left mid-purge
 *   reconcile     re-derive usage from every page, then diff the bucket against
 *                 the catalog
 *
 * Reporting only by default; `--apply` lets it delete. The reconciliation runs
 * either way, because it changes nothing an editor can see and its findings are
 * the whole point of running this.
 *
 * The trash sweep is the only thing in the system that deletes bytes without a
 * person present, and it re-checks usage in the same transaction that claims
 * each row — an asset that gained a reference while it sat in the trash is
 * restored instead of emptied.
 *
 *   bun run scripts/mediaSweep.ts
 *   bun run scripts/mediaSweep.ts --apply
 */
import { reconcileBucket, sweep } from "@/cms/media/server/purge";
import { isMediaStorageConfigured } from "@/cms/media/server/storage";
import { reconcileMediaUsage } from "@/cms/media/server/usage";
import { TRASH_GRACE_DAYS } from "@/cms/media/validation/upload";

const APPLY = process.argv.includes("--apply");

async function main() {
  if (!isMediaStorageConfigured()) {
    throw new Error("Media storage is not configured; nothing to sweep.");
  }

  const usage = await reconcileMediaUsage();
  console.log(
    `usage: ${usage.revisionsScanned} revisions, ${usage.referencesFound} references, ${usage.unresolved.length} unresolved`,
  );
  for (const orphan of usage.unresolved) {
    console.warn(
      `  ! revision ${orphan.revisionId} references unknown media ${orphan.mediaId}`,
    );
  }

  const bucket = await reconcileBucket();
  console.log(
    `bucket: ${bucket.objects} objects, ${(bucket.bytes / 1024 / 1024).toFixed(1)} MB`,
  );
  // Every orphan is a bug in a write path: the `pending` row is committed
  // before the presigned URL is issued precisely so this stays empty.
  for (const orphan of bucket.orphanedObjects) {
    console.warn(`  ! object with no database row: ${orphan.key}`);
  }
  for (const missing of bucket.missingObjects) {
    console.warn(`  ! ${missing.status} row with no object: ${missing.key}`);
  }

  if (!APPLY) {
    console.log(
      `Reporting only. Re-run with --apply to collect abandoned uploads and purge trash older than ${TRASH_GRACE_DAYS} days.`,
    );
    return;
  }

  const result = await sweep();
  console.log(
    `reservations swept: ${result.reservations.swept}\n` +
      `replacements: ${result.replacements.abandoned} abandoned, ${result.replacements.oldObjectsDeleted} old objects deleted\n` +
      `trash purged: ${result.trash.purged}, restored: ${result.trash.restored}, skipped: ${result.trash.skipped}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

import "server-only";
import { db as defaultDb, type Database } from "@/db";
import {
  MAX_UPLOAD_BYTES,
  RESERVATION_TTL_MINUTES,
  TRASH_GRACE_DAYS,
} from "../validation/upload";
import { CmsMediaStore, cmsMediaStore } from "./store";
import {
  deleteObject,
  INCOMING_PREFIX,
  isMediaStorageConfigured,
  listAllKeys,
  MEDIA_PREFIX,
} from "./storage";
import { reconcileMediaUsage } from "./usage";

// Everything that removes bytes, and the audit that proves it worked.
//
// Three jobs, deliberately separate:
//
//   sweepReservations   staged uploads that were never finalized
//   sweepTrash          trashed assets past the grace period
//   reconcileBucket     what the bucket holds vs. what the database believes
//
// The design property that matters (cms.md): the final usage
// re-check happens *immediately before* the object is deleted, and by then the
// asset has been unreferenced for the whole grace period. The dangerous
// interleaving — one editor trashes an unused image while another inserts it
// into a page — resolves thirty days later by finding the new reference and
// restoring the asset. Nothing on the page-save path needs to take a lock for
// that to hold.

export type PurgeOutcome = "purged" | "restored" | "skipped";

/** Purge one asset: re-check, mark, delete, tombstone.
 *
 * Returns `restored` when a reference appeared while it sat in the trash — the
 * asset goes back to `ready` and keeps its bytes. That is not an error case; it
 * is the safety net doing its job. */
export async function purgeAsset(input: {
  id: string;
  actorId: string | null;
  store?: CmsMediaStore;
  now?: Date;
}): Promise<PurgeOutcome> {
  const store = input.store ?? cmsMediaStore;
  const now = input.now ?? new Date();

  const claimed = await store.markPurging({
    id: input.id,
    actorId: input.actorId,
    now,
  });
  if (!claimed) {
    // Either it is not in the trash any more, or — the case this exists for —
    // a page started referencing it. Restoring is right for both: an asset
    // something points at must keep its bytes, and one already restored by
    // hand is unaffected.
    if (await store.isReferenced(input.id)) {
      await store.restore({ id: input.id, actorId: input.actorId, now });
      return "restored";
    }
    return "skipped";
  }

  const keys = await store.objectKeysOf(input.id);
  // Idempotent by contract, so a retry after a storage outage is safe. A row
  // left in `purging` is picked up by the next sweep.
  for (const key of [keys?.objectKey, keys?.stagingKey]) {
    if (key) await deleteObject(key);
  }

  await store.markPurged({ id: input.id, actorId: input.actorId, now });
  return "purged";
}

export type SweepReport = {
  reservations: { swept: number };
  trash: { purged: number; restored: number; skipped: number };
};

/** Reservations whose upload never finished: delete the staged bytes and
 * tombstone the row.
 *
 * The bucket lifecycle rule on `_incoming/` does this too, on a longer clock.
 * Both exist on purpose — the rule is the backstop for a sweep that never runs,
 * and the sweep is what keeps the catalog honest when the rule is missing from
 * a freshly created bucket. */
export async function sweepReservations(
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - RESERVATION_TTL_MINUTES * 60_000);
  const stale = await cmsMediaStore.pendingBefore(cutoff);
  for (const asset of stale) {
    const keys = await cmsMediaStore.objectKeysOf(asset.id);
    if (keys?.stagingKey) await deleteObject(keys.stagingKey);
    await cmsMediaStore.markPurged({ id: asset.id, actorId: null, now });
  }
  return stale.length;
}

/** Trashed assets past the grace period, plus anything a storage failure left
 * mid-purge.
 *
 * Usage is reconciled first, deliberately: the sweep is about to delete bytes,
 * and it should decide from a table it has just re-derived rather than one it
 * assumes is current. */
export async function sweepTrash(
  now: Date = new Date(),
  db: Database = defaultDb,
): Promise<SweepReport["trash"]> {
  await reconcileMediaUsage(db, now);

  const cutoff = new Date(now.getTime() - TRASH_GRACE_DAYS * 86_400_000);
  const candidates = await cmsMediaStore.purgeCandidates(cutoff);

  const tally = { purged: 0, restored: 0, skipped: 0 };
  for (const asset of candidates) {
    const outcome = await purgeAsset({ id: asset.id, actorId: null, now });
    tally[outcome] += 1;
  }
  return tally;
}

export async function sweep(now: Date = new Date()): Promise<SweepReport> {
  const reservations = await sweepReservations(now);
  const trash = await sweepTrash(now);
  return { reservations: { swept: reservations }, trash };
}

export type BucketReconciliation = {
  objects: number;
  bytes: number;
  /** In the bucket, unknown to the database. Every one of these is a bug in a
   * write path — the `pending` row is committed before the presigned URL is
   * issued precisely so this list stays empty. */
  orphanedObjects: { key: string; size: number; lastModified: string | null }[];
  /** In the database, missing from the bucket. A `ready` row here renders a
   * broken image. */
  missingObjects: { id: string; key: string; status: string }[];
  /** Staged bytes past their reservation lifetime that the sweep has not yet
   * collected. */
  staleStaging: number;
};

/** List the bucket and diff it against the catalog.
 *
 * This is the one thing the library grid must *not* do — PostgreSQL is the
 * catalog and the bucket is bytes — and it is also the only check that can
 * catch a bug in the purge path rather than assuming it worked. At a few
 * hundred objects it is a single request. */
export async function reconcileBucket(
  now: Date = new Date(),
): Promise<BucketReconciliation> {
  if (!isMediaStorageConfigured()) {
    throw new Error("Media storage is not configured");
  }

  const [objects, known] = await Promise.all([
    listAllKeys(MEDIA_PREFIX),
    cmsMediaStore.allKnownKeys(),
  ]);

  const knownByKey = new Map(known.map((entry) => [entry.key, entry]));
  const presentKeys = new Set(objects.map((object) => object.key));
  const staleAfter = new Date(now.getTime() - RESERVATION_TTL_MINUTES * 60_000);

  return {
    objects: objects.length,
    bytes: objects.reduce((total, object) => total + object.size, 0),
    orphanedObjects: objects
      .filter((object) => !knownByKey.has(object.key))
      .map((object) => ({
        key: object.key,
        size: object.size,
        lastModified: object.lastModified?.toISOString() ?? null,
      })),
    missingObjects: known
      .filter((entry) => !presentKeys.has(entry.key))
      // A `pending` row whose upload has not landed yet is not missing, it is
      // in flight. Only rows that should have bytes count.
      .filter((entry) => entry.status === "ready" || entry.status === "purging")
      .map((entry) => ({ id: entry.id, key: entry.key, status: entry.status })),
    staleStaging: objects.filter(
      (object) =>
        object.key.startsWith(INCOMING_PREFIX) &&
        object.lastModified !== null &&
        object.lastModified < staleAfter,
    ).length,
  };
}

/** Exported for the library's storage panel: what the guardrails currently
 * are, so the UI states them rather than restating them. */
export const STORAGE_LIMITS = {
  maxBytes: MAX_UPLOAD_BYTES,
  reservationMinutes: RESERVATION_TTL_MINUTES,
  trashGraceDays: TRASH_GRACE_DAYS,
};

import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { billSubmissions, bills } from "@/db/schema";
import { type IngestResult, ingestBill } from "./ingest";
import { adoptPackage } from "./registry";
import { deleteObject, isStorageConfigured } from "./storage";
import { loadOwnedSubmission, type Ticket } from "./submissions";

export type ClaimStatus = "claimed" | "already" | "invalid";

export type ClaimResult = {
  submissionId: string;
  status: ClaimStatus;
  /** How ingest resolved the bill — absent for `invalid`, and for a `no_text`
   * submission, which never reaches ingest. */
  outcome?: IngestResult["outcome"];
  billId?: string;
};

/** Turn anonymous /probar submissions into real bills for `userId`.
 *
 * Idempotent per submission: a row that already carries `claimedByUserId`
 * returns its existing bill instead of ingesting twice. That's required, not
 * defensive — `events.createUser` can claim but cannot clear the visitor's
 * cookie, so `/app?claim=1` will attempt the same rows immediately afterward.
 *
 * Deliberately NOT an UPDATE of the submission into a bill. Re-running
 * `ingestBill` parses under the CLAIMER'S own parser set (`loadUserConfigs`,
 * the app's security boundary), which is the only way the stored bill agrees
 * with what the user's next reparse would produce. It also gets duplicate
 * handling, vendor/account materialization and the single-property auto-file
 * path for free, none of which an UPDATE would have. */
export async function claimSubmissions(
  db: Database,
  userId: string,
  tickets: Ticket[],
): Promise<ClaimResult[]> {
  const results: ClaimResult[] = [];
  for (const ticket of tickets) {
    results.push(await claimOne(db, userId, ticket));
  }
  return results;
}

async function claimOne(
  db: Database,
  userId: string,
  ticket: Ticket,
): Promise<ClaimResult> {
  const row = await loadOwnedSubmission(db, ticket.id, ticket.secret);
  // Unknown id, wrong secret, expired row — all the same answer, so a forged
  // cookie learns nothing about which submissions exist.
  if (!row) return { submissionId: ticket.id, status: "invalid" };

  if (row.claimedByUserId) {
    return {
      submissionId: row.id,
      status: "already",
      billId: row.claimedBillId ?? undefined,
    };
  }

  // Nothing to ingest from a scanned PDF, but the claim still counts: the file
  // is now attached to an account and the retention sweep must leave it alone.
  if (row.outcome === "no_text") {
    await db
      .update(billSubmissions)
      .set({ claimedByUserId: userId, claimedAt: new Date() })
      .where(eq(billSubmissions.id, row.id));
    return { submissionId: row.id, status: "claimed" };
  }

  // The visitor watched this parser read their bill and then pressed save, so
  // adopting it is their decision, not ours. Without this the feature is broken
  // for two of its three tiers: a fresh account auto-adopts official parsers
  // only, so a bill that parsed perfectly under a verified or community parser
  // would land in the inbox blank. A slug CONFLICT (registry.adoptPackage) means
  // they already run a different parser by that name — ingest then falls through
  // to `unrecognized`, which is the pre-existing behavior for that situation.
  if (row.matchedConfigId && row.matchedVersionId && row.matchedTier !== "official") {
    try {
      await adoptPackage(db, userId, row.matchedConfigId, row.matchedVersionId);
    } catch {
      // Non-fatal by design — see above.
    }
  }

  // Ingest and the ownership handover commit together. Without that, an ingest
  // that succeeds followed by a failed update leaves a bill pointing at an
  // object the row still claims — and since the sweep keys off
  // `claimed_by_user_id is null and storage_key is not null`, it would then
  // delete the new bill's PDF out from under it.
  const { result, orphanedKey } = await db.transaction(async (tx) => {
    const result = await ingestBill(tx, userId, {
      fileName: row.fileName,
      rawText: row.rawText,
      storageKey: row.storageKey ?? undefined,
    });

    // Hand the stored object to whichever row keeps it, so exactly one ever
    // points at it — `bills.delete` calls deleteObject, and a shared key would
    // leave a dangling pointer behind.
    let orphanedKey: string | null = null;
    if (row.storageKey && result.outcome === "duplicate") {
      const existing = await tx.query.bills.findFirst({
        where: eq(bills.id, result.billId),
      });
      if (existing && !existing.storageKey) {
        // They have this bill text-only (uploaded before storage was wired up,
        // or via a path that didn't keep the original). Fill in the missing PDF.
        await tx
          .update(bills)
          .set({ storageKey: row.storageKey })
          .where(eq(bills.id, result.billId));
      } else {
        // They already have both the bill and its file; ours is redundant.
        orphanedKey = row.storageKey;
      }
    }

    await tx
      .update(billSubmissions)
      .set({
        claimedByUserId: userId,
        claimedAt: new Date(),
        claimedBillId: result.billId,
        // Ownership of the object moved to the bill (or it's being deleted).
        storageKey: null,
      })
      .where(eq(billSubmissions.id, row.id));

    return { result, orphanedKey };
  });

  // After the row is settled, and never fatal: a failed delete leaves a harmless
  // orphan in the bucket, whereas failing here would undo a successful claim.
  if (orphanedKey && isStorageConfigured()) {
    try {
      await deleteObject(orphanedKey);
    } catch (err) {
      console.warn(`[claim] could not delete redundant object:`, err);
    }
  }

  return {
    submissionId: row.id,
    status: "claimed",
    outcome: result.outcome,
    billId: result.billId,
  };
}

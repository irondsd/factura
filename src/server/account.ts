import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@/db";
import {
  billSubmissions,
  bills,
  parserAdoptions,
  parserConfigs,
  parserSamples,
  parserVersions,
  parserVotes,
  properties,
  propertyInvites,
  propertyMembers,
  users,
  vendorAccounts,
  vendors,
  verificationTokens,
} from "@/db/schema";
import { deleteObject, isStorageConfigured } from "./storage";

/** Permanent account deletion, run as a sequence of steps the UI drives one at
 * a time so the user watches their data actually go:
 *
 *   handOver → deleteFiles → deleteBills → deleteProperties → deleteParsers
 *   → finalize
 *
 * No step carries a plan forward. Each one re-derives its own scope from the
 * live membership rows, so the sequence is resumable (reload mid-run and it
 * picks up where it stopped) and a replayed or reordered call can't widen what
 * gets deleted. `handOver` is what makes that work: once it has run, the only
 * properties the user still belongs to are the ones marked for destruction, and
 * every later step can simply say "everything still mine".
 *
 * Two things deliberately SURVIVE the deletion:
 *   • Published parser packages, which other people may have adopted and are
 *     running against their own bills. They are orphaned (`ownerId` null), not
 *     deleted — see `deleteParsers`.
 *   • Properties with another owner, and properties handed to a member. The
 *     bills the leaving user uploaded there are re-attributed to the surviving
 *     owner rather than deleted, so a shared history doesn't develop holes.
 */

// ── Pure decision (unit-tested in account.test.ts) ───────────────────────────

/** What happens to one property the leaving user belongs to.
 *
 *   destroy  they are alone in it — it goes with them.
 *   choose   they are its only owner but other people are inside, so the choice
 *            is theirs: destroy it, or hand it to one of those members.
 *   leave    someone else already owns it; they just drop their membership.
 *
 * Owners are counted rather than the caller's own role, because "is there
 * anyone left who can own this?" is the only question that matters. A member of
 * an ownerless property (shouldn't happen) is treated as its last person, which
 * keeps it resolvable instead of wedging the run. */
export function disposition(counts: {
  otherOwners: number;
  otherMembers: number;
}): "destroy" | "choose" | "leave" {
  if (counts.otherOwners > 0) return "leave";
  return counts.otherMembers > 0 ? "choose" : "destroy";
}

// ── Scope helpers ────────────────────────────────────────────────────────────

type MemberRow = typeof propertyMembers.$inferSelect;

async function myMemberships(
  db: Database,
  userId: string,
): Promise<MemberRow[]> {
  return db.query.propertyMembers.findMany({
    where: eq(propertyMembers.userId, userId),
  });
}

/** Everyone in each of `propertyIds`, grouped by property. */
async function membersByProperty(
  db: Database,
  propertyIds: string[],
): Promise<Map<string, MemberRow[]>> {
  const grouped = new Map<string, MemberRow[]>();
  if (propertyIds.length === 0) return grouped;
  const rows = await db.query.propertyMembers.findMany({
    where: inArray(propertyMembers.propertyId, propertyIds),
  });
  for (const r of rows) {
    const list = grouped.get(r.propertyId) ?? [];
    list.push(r);
    grouped.set(r.propertyId, list);
  }
  return grouped;
}

/** The properties this deletion will destroy: the ones the user belongs to
 * where nobody else is an owner. This is the single definition of "doomed" —
 * every destructive step below scopes itself with it, which is why `handOver`
 * (which either promotes someone or leaves the property alone) is enough to
 * settle the whole run's blast radius up front. */
export async function doomedPropertyIds(
  db: Database,
  userId: string,
): Promise<string[]> {
  const mine = await myMemberships(db, userId);
  const ids = mine.map((m) => m.propertyId);
  const members = await membersByProperty(db, ids);
  return ids.filter(
    (id) =>
      !(members.get(id) ?? []).some(
        (m) => m.userId !== userId && m.role === "owner",
      ),
  );
}

/** Refuse to delete anything while the user still belongs to a property that
 * will survive — its contents are not theirs to take down. Guards every step
 * after `handOver` so a client that skips or reorders calls can't destroy a
 * co-owned property's bills. */
async function assertHandedOver(db: Database, userId: string): Promise<void> {
  const mine = await myMemberships(db, userId);
  const doomed = new Set(await doomedPropertyIds(db, userId));
  if (mine.some((m) => !doomed.has(m.propertyId)))
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Hand over or leave your shared properties first",
    });
}

/** Bills this deletion removes: their unfiled inbox, plus everything filed in a
 * doomed property — whoever uploaded it.
 *
 * Deliberately NOT "every bill they created": a filed bill belongs to its
 * property, not to whoever dropped the PDF in. Scoping by uploader would delete
 * bills out of a property that survives — including one the user was removed
 * from months ago, which no membership row would warn us about. `handOver`
 * re-attributes those instead. */
function doomedBillsWhere(userId: string, doomed: string[]) {
  const inbox = and(isNull(bills.propertyId), eq(bills.createdBy, userId))!;
  if (doomed.length === 0) return inbox;
  return or(inbox, inArray(bills.propertyId, doomed))!;
}

/** Hand every record a property holds in the leaving user's name to `toUserId`:
 * the creator column, the bills they uploaded, the invitations they sent. All
 * three FKs are NOT NULL with no cascade, so this is both what keeps a shared
 * history whole and what lets the user row be deleted at the end. */
async function reassignWithin(
  db: Database,
  propertyId: string,
  fromUserId: string,
  toUserId: string,
): Promise<void> {
  await db
    .update(properties)
    .set({ userId: toUserId })
    .where(
      and(eq(properties.id, propertyId), eq(properties.userId, fromUserId)),
    );
  await db
    .update(bills)
    .set({ createdBy: toUserId })
    .where(
      and(eq(bills.propertyId, propertyId), eq(bills.createdBy, fromUserId)),
    );
  await db
    .update(propertyInvites)
    .set({ invitedBy: toUserId })
    .where(
      and(
        eq(propertyInvites.propertyId, propertyId),
        eq(propertyInvites.invitedBy, fromUserId),
      ),
    );
}

/** The oldest owner of a property other than `exceptUserId`, falling back to
 * its creator. Null only if nobody is left who could inherit — which can't
 * happen through the app (every property keeps at least one owner), so callers
 * skip rather than invent a successor. */
async function successorFor(
  db: Database,
  propertyId: string,
  exceptUserId: string,
): Promise<string | null> {
  const members = await db.query.propertyMembers.findMany({
    where: eq(propertyMembers.propertyId, propertyId),
  });
  const owners = members
    .filter((m) => m.userId !== exceptUserId && m.role === "owner")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  if (owners.length > 0) return owners[0].userId;
  const property = await db.query.properties.findFirst({
    where: eq(properties.id, propertyId),
    columns: { userId: true },
  });
  return property && property.userId !== exceptUserId ? property.userId : null;
}

// ── Step 1 · hand over what survives ─────────────────────────────────────────

export type PropertyDecision =
  | { propertyId: string; action: "delete" }
  | { propertyId: string; action: "handover"; toUserId: string };

/** Settle every property the user belongs to that is NOT theirs alone.
 *
 * For each survivor: promote the chosen member when handing over, re-point the
 * property's creator column and any invitations they sent at the surviving
 * owner, re-attribute the bills they uploaded there to that owner, and drop
 * their membership. Properties they chose to delete are simply left alone —
 * they stay doomed and the later steps take them down.
 *
 * Idempotent: a second run sees no remaining non-doomed membership and does
 * nothing. */
export async function handOverProperties(
  db: Database,
  userId: string,
  decisions: PropertyDecision[],
): Promise<{ handedOver: number; left: number }> {
  const byProperty = new Map(decisions.map((d) => [d.propertyId, d]));
  const mine = await myMemberships(db, userId);
  const members = await membersByProperty(
    db,
    mine.map((m) => m.propertyId),
  );

  let handedOver = 0;
  let left = 0;

  for (const membership of mine) {
    const propertyId = membership.propertyId;
    const others = (members.get(propertyId) ?? []).filter(
      (m) => m.userId !== userId,
    );
    const otherOwners = others.filter((m) => m.role === "owner");
    const kind = disposition({
      otherOwners: otherOwners.length,
      otherMembers: others.length,
    });
    if (kind === "destroy") continue;

    let successorId: string;
    if (kind === "choose") {
      const decision = byProperty.get(propertyId);
      if (!decision) {
        const property = await db.query.properties.findFirst({
          where: eq(properties.id, propertyId),
          columns: { nickname: true },
        });
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Decide what happens to "${property?.nickname ?? "a shared property"}" first`,
        });
      }
      if (decision.action === "delete") continue; // stays doomed
      const successor = others.find((m) => m.userId === decision.toUserId);
      if (!successor)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That person isn't in this property",
        });
      successorId = successor.userId;
      handedOver++;
    } else {
      // Oldest remaining owner, so the handover target is deterministic.
      successorId = otherOwners.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      )[0].userId;
      left++;
    }

    await db.transaction(async (tx) => {
      if (kind === "choose")
        await tx
          .update(propertyMembers)
          .set({ role: "owner" })
          .where(
            and(
              eq(propertyMembers.propertyId, propertyId),
              eq(propertyMembers.userId, successorId),
            ),
          );
      await reassignWithin(tx, propertyId, userId, successorId);
      await tx
        .delete(propertyMembers)
        .where(
          and(
            eq(propertyMembers.propertyId, propertyId),
            eq(propertyMembers.userId, userId),
          ),
        );
    });
  }

  await reassignStranded(db, userId);
  return { handedOver, left };
}

/** Properties the user is no longer in but is still recorded against — they
 * uploaded bills or created the property, then an owner removed them. No
 * membership row points at these, so nothing above would find them, and the
 * user record can't be deleted while the columns still name them. */
async function reassignStranded(db: Database, userId: string): Promise<void> {
  const doomed = new Set(await doomedPropertyIds(db, userId));
  const mine = new Set(
    (await myMemberships(db, userId)).map((m) => m.propertyId),
  );

  const created = await db
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.userId, userId));
  const uploaded = await db
    .selectDistinct({ id: bills.propertyId })
    .from(bills)
    .where(and(eq(bills.createdBy, userId), isNotNull(bills.propertyId)));
  const invited = await db
    .selectDistinct({ id: propertyInvites.propertyId })
    .from(propertyInvites)
    .where(eq(propertyInvites.invitedBy, userId));

  const candidates = new Set(
    [...created, ...uploaded, ...invited]
      .map((r) => r.id)
      .filter((id): id is string => !!id),
  );
  for (const propertyId of candidates) {
    if (doomed.has(propertyId) || mine.has(propertyId)) continue;
    const successorId = await successorFor(db, propertyId, userId);
    // Nobody to inherit: an ownerless property the app can't produce. Left
    // alone rather than guessed at — finalize will surface it loudly.
    if (!successorId) continue;
    await db.transaction((tx) =>
      reassignWithin(tx, propertyId, userId, successorId),
    );
  }
}

// ── Step 2 · the stored PDFs ─────────────────────────────────────────────────

/** Remove the original PDFs from object storage, before the rows that point at
 * them. Each key that goes is cleared from its row as it succeeds, so an
 * interrupted run never leaves a bill advertising a file that isn't there.
 * A key we fail to delete is left on the row and retried on the next run. */
export async function deleteStoredFiles(
  db: Database,
  userId: string,
): Promise<{ deleted: number; failed: number }> {
  await assertHandedOver(db, userId);
  if (!isStorageConfigured()) return { deleted: 0, failed: 0 };

  const doomed = await doomedPropertyIds(db, userId);
  const billRows = await db
    .select({ id: bills.id, storageKey: bills.storageKey })
    .from(bills)
    .where(and(doomedBillsWhere(userId, doomed), isNotNull(bills.storageKey)));
  // A claimed submission normally hands its object to the bill, but sweep any
  // that still hold one so nothing of theirs is left in the bucket.
  const submissionRows = await db
    .select({ id: billSubmissions.id, storageKey: billSubmissions.storageKey })
    .from(billSubmissions)
    .where(
      and(
        eq(billSubmissions.claimedByUserId, userId),
        isNotNull(billSubmissions.storageKey),
      ),
    );

  const clearedBills: string[] = [];
  const clearedSubmissions: string[] = [];
  let failed = 0;
  for (const row of billRows) {
    try {
      await deleteObject(row.storageKey!);
      clearedBills.push(row.id);
    } catch {
      failed++;
    }
  }
  for (const row of submissionRows) {
    try {
      await deleteObject(row.storageKey!);
      clearedSubmissions.push(row.id);
    } catch {
      failed++;
    }
  }

  if (clearedBills.length > 0)
    await db
      .update(bills)
      .set({ storageKey: null })
      .where(inArray(bills.id, clearedBills));
  if (clearedSubmissions.length > 0)
    await db
      .update(billSubmissions)
      .set({ storageKey: null, fileDeletedAt: new Date() })
      .where(inArray(billSubmissions.id, clearedSubmissions));

  return { deleted: clearedBills.length + clearedSubmissions.length, failed };
}

// ── Step 3 · the bills ───────────────────────────────────────────────────────

/** Delete the bill rows, and the /probar submissions this user claimed — those
 * hold a second copy of the same bill text. */
export async function deleteBills(
  db: Database,
  userId: string,
): Promise<{ bills: number; submissions: number }> {
  await assertHandedOver(db, userId);
  const doomed = await doomedPropertyIds(db, userId);
  return db.transaction(async (tx) => {
    const submissions = await tx
      .delete(billSubmissions)
      .where(eq(billSubmissions.claimedByUserId, userId))
      .returning({ id: billSubmissions.id });
    const removed = await tx
      .delete(bills)
      .where(doomedBillsWhere(userId, doomed))
      .returning({ id: bills.id });
    return { bills: removed.length, submissions: submissions.length };
  });
}

// ── Step 4 · the properties ──────────────────────────────────────────────────

/** Tear down the doomed properties. Nothing cascades from `properties` except
 * members, invites and monthly reports, so vendors and accounts come down by
 * hand in FK-safe order (forecasts cascade from the accounts). */
export async function deleteProperties(
  db: Database,
  userId: string,
): Promise<{ properties: number }> {
  await assertHandedOver(db, userId);
  const doomed = await doomedPropertyIds(db, userId);
  if (doomed.length === 0) return { properties: 0 };
  return db.transaction(async (tx) => {
    // Defensive: deleteBills already emptied these, but the FK is what would
    // otherwise abort the whole transaction.
    await tx.delete(bills).where(inArray(bills.propertyId, doomed));
    await tx
      .delete(vendorAccounts)
      .where(inArray(vendorAccounts.propertyId, doomed));
    await tx.delete(vendors).where(inArray(vendors.propertyId, doomed));
    const removed = await tx
      .delete(properties)
      .where(inArray(properties.id, doomed))
      .returning({ id: properties.id });
    return { properties: removed.length };
  });
}

// ── Step 5 · the parsers ─────────────────────────────────────────────────────

/** A published parser package is something other people adopted and are running
 * against their own bills, so it outlives its author: publishing is a promise
 * we keep on the adopter's behalf. Those packages are orphaned — `ownerId` set
 * to null, exactly like the platform's official rows — which leaves them
 * readable, adoptable and un-editable by anyone. Never-published drafts are
 * private to the author and go, taking their votes and adoptions with them.
 *
 * The user's own parser-side data (adoptions, votes, and the bill samples they
 * attached in the builder, which contain bill text) is deleted here rather than
 * left to the final cascade, so this step really is "the parsers are gone". */
export async function deleteParsers(
  db: Database,
  userId: string,
): Promise<{ kept: number; removed: number }> {
  const own = await db.query.parserConfigs.findMany({
    where: eq(parserConfigs.ownerId, userId),
    columns: { id: true },
  });
  const ids = own.map((r) => r.id);

  let published = new Set<string>();
  if (ids.length > 0) {
    const rows = await db
      .selectDistinct({ configId: parserVersions.configId })
      .from(parserVersions)
      .where(inArray(parserVersions.configId, ids));
    published = new Set(rows.map((r) => r.configId));
  }
  const keep = ids.filter((id) => published.has(id));
  const drop = ids.filter((id) => !published.has(id));

  await db.transaction(async (tx) => {
    if (keep.length > 0)
      await tx
        .update(parserConfigs)
        .set({ ownerId: null })
        .where(inArray(parserConfigs.id, keep));
    if (drop.length > 0)
      await tx.delete(parserConfigs).where(inArray(parserConfigs.id, drop));
    await tx.delete(parserAdoptions).where(eq(parserAdoptions.userId, userId));
    await tx.delete(parserVotes).where(eq(parserVotes.userId, userId));
    await tx.delete(parserSamples).where(eq(parserSamples.userId, userId));
  });

  return { kept: keep.length, removed: drop.length };
}

// ── Step 6 · the account itself ──────────────────────────────────────────────

/** Delete the user record. Sessions, OAuth identities and anything still keyed
 * to the user cascade from it; what doesn't is their email address sitting in
 * rows owned by other people, which is scrubbed first. */
export async function deleteUserRecord(
  db: Database,
  userId: string,
): Promise<{ ok: true }> {
  await assertHandedOver(db, userId);
  const me = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { email: true },
  });
  const email = me?.email?.toLowerCase() ?? null;

  await db.transaction(async (tx) => {
    if (email) {
      // Invitations addressed to them (their address, held by an inviter) and
      // any unused sign-in code still on file.
      await tx
        .delete(propertyInvites)
        .where(sql`lower(${propertyInvites.email}) = ${email}`);
      await tx
        .delete(verificationTokens)
        .where(sql`lower(${verificationTokens.identifier}) = ${email}`);
      // Anonymous /probar drops are never linked to an account, but one may
      // carry their address as a follow-up contact. Blank it and keep the row:
      // the bill text in it is what tells us which parser to write next, and it
      // was submitted without an account in the first place.
      await tx
        .update(billSubmissions)
        .set({ notifyEmail: null })
        .where(sql`lower(${billSubmissions.notifyEmail}) = ${email}`);
      await tx
        .update(billSubmissions)
        .set({ reportEmail: null })
        .where(sql`lower(${billSubmissions.reportEmail}) = ${email}`);
    }
    // Defensive: invitations they sent are re-pointed by handOver or cascade
    // with a deleted property, but the FK has no ON DELETE and would abort here.
    await tx
      .delete(propertyInvites)
      .where(eq(propertyInvites.invitedBy, userId));
    await tx.delete(users).where(eq(users.id, userId));
  });

  return { ok: true };
}

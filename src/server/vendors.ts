import { and, eq, inArray, notInArray } from "drizzle-orm";
import type { Database } from "@/db";
import {
  bills,
  forecasts,
  vendorAccounts,
  vendorAliases,
  vendors,
} from "@/db/schema";

/** Vendor identity: which vendor row a parser's `vendor.slug` means, inside one
 * property, and how two vendor rows that turned out to be the same biller are
 * folded back together.
 *
 * The rule this module exists to enforce: a parser *proposes* a vendor slug, the
 * property *owns* the mapping from slug to vendor row. Keyed only on the slug
 * (as `ensureVendor` was), every change of winning parser minted a second vendor
 * in the same property, and since bills and insights group by `bills.vendorId`,
 * one biller rendered as two chips and two series with no way back.
 *
 * Deliberately free of tRPC and Next imports — reparse runs from a plain Node
 * script too, and the merge below is called from a router. Authorization is the
 * caller's job; nothing here checks membership. */

type VendorRow = typeof vendors.$inferSelect;

/** The vendor a slug means in this property: the row that owns it as its
 * canonical slug, else the row an alias points at, else undefined.
 *
 * Canonical first, always. An alias is a hint the property accumulated; a
 * canonical slug is the vendor's own identity, and letting a stale alias shadow
 * it would make a live vendor unreachable by its own name. */
export async function resolveVendorBySlug(
  db: Database,
  propertyId: string,
  slug: string,
): Promise<VendorRow | undefined> {
  const canonical = await db.query.vendors.findFirst({
    where: and(eq(vendors.propertyId, propertyId), eq(vendors.slug, slug)),
  });
  if (canonical) return canonical;
  const alias = await db.query.vendorAliases.findFirst({
    where: and(
      eq(vendorAliases.propertyId, propertyId),
      eq(vendorAliases.slug, slug),
    ),
  });
  if (!alias) return undefined;
  return db.query.vendors.findFirst({ where: eq(vendors.id, alias.vendorId) });
}

/** Every vendor id a slug can mean across a set of properties, canonical
 * matches first. Account lookup at ingest spans all the properties the uploader
 * can reach, so it needs the set rather than one property's answer. */
export async function vendorIdsForSlug(
  db: Database,
  propertyIds: string[],
  slug: string,
): Promise<string[]> {
  if (propertyIds.length === 0) return [];
  const [canonical, aliased] = await Promise.all([
    db.query.vendors.findMany({
      where: and(
        inArray(vendors.propertyId, propertyIds),
        eq(vendors.slug, slug),
      ),
      columns: { id: true },
    }),
    db.query.vendorAliases.findMany({
      where: and(
        inArray(vendorAliases.propertyId, propertyIds),
        eq(vendorAliases.slug, slug),
      ),
      columns: { vendorId: true },
    }),
  ]);
  const ids = canonical.map((v) => v.id);
  for (const a of aliased) if (!ids.includes(a.vendorId)) ids.push(a.vendorId);
  return ids;
}

/** Every slug that already resolves to some vendor in this property — canonical
 * names and aliases together. What `shouldLearnAlias` consults before binding a
 * new slug: a slug that already means something here must not be re-pointed. */
export async function knownVendorSlugs(
  db: Database,
  propertyId: string,
): Promise<string[]> {
  const [rows, aliases] = await Promise.all([
    db.query.vendors.findMany({
      where: eq(vendors.propertyId, propertyId),
      columns: { slug: true },
    }),
    db.query.vendorAliases.findMany({
      where: eq(vendorAliases.propertyId, propertyId),
      columns: { slug: true },
    }),
  ]);
  return [...rows.map((r) => r.slug), ...aliases.map((a) => a.slug)];
}

/** Bind `slug` to `vendorId` in its property. `onConflictDoNothing` because the
 * (propertyId, slug) unique index is the real guard: two concurrent reparses
 * learning the same alias must collapse to one row, not fail a bill's write. */
export async function recordVendorAlias(
  db: Database,
  vendor: { id: string; propertyId: string },
  slug: string,
): Promise<void> {
  await db
    .insert(vendorAliases)
    .values({ vendorId: vendor.id, propertyId: vendor.propertyId, slug })
    .onConflictDoNothing();
}

/** Fold `sourceId`'s bills and forecasts into `targetId` and drop the source
 * account row. Both accounts must belong to the same vendor.
 *
 * Forecasts are unique per (account, period), so the twins can't simply move:
 * the ones the target has no row for are re-pointed, the rest are dropped. A
 * forecast is a frozen record of what we predicted for an account in a month —
 * with two rows for the same month, the surviving account's own is the one that
 * was actually shown. */
async function absorbAccount(
  db: Database,
  sourceId: string,
  targetId: string,
): Promise<void> {
  const targetPeriods = (
    await db.query.forecasts.findMany({
      where: eq(forecasts.accountId, targetId),
      columns: { period: true },
    })
  ).map((f) => f.period);
  await db
    .update(forecasts)
    .set({ accountId: targetId })
    .where(
      and(
        eq(forecasts.accountId, sourceId),
        targetPeriods.length
          ? notInArray(forecasts.period, targetPeriods)
          : undefined,
      ),
    );
  // Whatever is left collided on (account, period); the cascade would take
  // these on the delete below, but doing it here keeps the intent explicit.
  await db.delete(forecasts).where(eq(forecasts.accountId, sourceId));
  await db
    .update(bills)
    .set({ accountId: targetId })
    .where(eq(bills.accountId, sourceId));
  await db.delete(vendorAccounts).where(eq(vendorAccounts.id, sourceId));
}

/** Merge two accounts of the same vendor. The caller has already authorized the
 * property and checked both rows belong to it.
 *
 * Same vendor is a hard requirement, not a convenience: bills carry `vendorId`
 * and `accountId` side by side, so moving a bill onto an account of a different
 * vendor would leave those two columns describing different billers — the exact
 * inconsistency the reparse fix exists to remove. Two accounts under different
 * vendors is a vendor split, and `mergeVendors` is what that needs. */
export async function mergeAccounts(
  db: Database,
  source: typeof vendorAccounts.$inferSelect,
  target: typeof vendorAccounts.$inferSelect,
): Promise<void> {
  if (source.id === target.id)
    throw new Error("Cannot merge an account into itself");
  if (source.propertyId !== target.propertyId)
    throw new Error("Accounts belong to different properties");
  if (source.vendorId !== target.vendorId)
    throw new Error("Accounts belong to different vendors");
  await db.transaction((tx) => absorbAccount(tx, source.id, target.id));
}

/** Merge `source` into `target`: every bill, account, and alias moves, then the
 * source vendor row is deleted and its slug becomes an alias of the target.
 *
 * That last step is the whole point. Deleting the row alone is what direct
 * database surgery used to do, and it doesn't hold: the parser that produced the
 * source slug is still adopted, so the next reparse calls `ensureVendor` with it
 * and the vendor comes straight back, taking its bills with it. Recording the
 * slug means the same reparse now lands on `target`.
 *
 * Accounts that collide on `accountNumber` (the same account materialized twice,
 * once under each vendor) are absorbed rather than moved — the unique index on
 * (vendorId, accountNumber) would reject the move, and two rows with one number
 * under one vendor is exactly the split we're undoing.
 *
 * The caller has already authorized the property; the checks here are a
 * backstop against merging across properties, which would move bills into a
 * property their uploader may not be a member of. */
export async function mergeVendors(
  db: Database,
  source: VendorRow,
  target: VendorRow,
): Promise<void> {
  if (source.id === target.id)
    throw new Error("Cannot merge a vendor into itself");
  if (source.propertyId !== target.propertyId)
    throw new Error("Vendors belong to different properties");

  await db.transaction(async (tx) => {
    const [sourceAccounts, targetAccounts] = await Promise.all([
      tx.query.vendorAccounts.findMany({
        where: eq(vendorAccounts.vendorId, source.id),
      }),
      tx.query.vendorAccounts.findMany({
        where: eq(vendorAccounts.vendorId, target.id),
      }),
    ]);
    for (const account of sourceAccounts) {
      const twin = targetAccounts.find(
        (a) => a.accountNumber === account.accountNumber,
      );
      if (twin) await absorbAccount(tx, account.id, twin.id);
      else
        await tx
          .update(vendorAccounts)
          .set({ vendorId: target.id })
          .where(eq(vendorAccounts.id, account.id));
    }

    await tx
      .update(bills)
      .set({ vendorId: target.id })
      .where(eq(bills.vendorId, source.id));

    // The source's own aliases move too, so a chain of renames (slug A → B → C)
    // keeps resolving after the second merge.
    await tx
      .update(vendorAliases)
      .set({ vendorId: target.id })
      .where(eq(vendorAliases.vendorId, source.id));
    await tx
      .insert(vendorAliases)
      .values({
        vendorId: target.id,
        propertyId: target.propertyId,
        slug: source.slug,
      })
      .onConflictDoNothing();

    await tx.delete(vendors).where(eq(vendors.id, source.id));
  });
}

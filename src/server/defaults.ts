import { and, eq } from "drizzle-orm";
import type { db as Db } from "@/db";
import {
  parserConfigs,
  parserVersions,
  properties,
  propertyMembers,
  vendors,
} from "@/db/schema";
import { ENGINE_CONFIGS } from "@/parsers/engine/configs";
import { pickVendorColor } from "@/lib/vendorColors";
import { rowToConfig } from "./parsers";
import { ensureSystemUser } from "./registry";

type VendorRow = typeof vendors.$inferSelect;
type PropertyRow = typeof properties.$inferSelect;

/** Get an property's vendor for a slug, creating it from preset metadata if it
 * doesn't exist yet. Vendors belong to a property, so this is the single point
 * where a bill being *filed* into an property materializes its vendor row.
 * Idempotent per (propertyId, slug). */
export async function ensureVendor(
  db: typeof Db,
  propertyId: string,
  vendor: { slug: string; displayName: string },
): Promise<VendorRow> {
  const existing = await db.query.vendors.findFirst({
    where: and(
      eq(vendors.propertyId, propertyId),
      eq(vendors.slug, vendor.slug),
    ),
  });
  if (existing) return existing;
  // Assign a random color, avoiding ones already used in this property.
  const siblings = await db.query.vendors.findMany({
    where: eq(vendors.propertyId, propertyId),
    columns: { color: true },
  });
  const [created] = await db
    .insert(vendors)
    .values({
      propertyId,
      slug: vendor.slug,
      displayName: vendor.displayName,
      color: pickVendorColor(siblings.map((s) => s.color)),
    })
    .returning();
  return created;
}

/** Seed a freshly-created property with one vendor per distinct verified-preset
 * vendor, so its vendor list and account assignment work immediately. Presets
 * created later are back-filled lazily by ensureVendor on first matching bill.
 * Idempotent. */
export async function seedPropertyVendors(
  db: typeof Db,
  propertyId: string,
): Promise<void> {
  const configs = await db.query.parserConfigs.findMany({
    where: eq(parserConfigs.verified, true),
  });
  const seen = new Set<string>();
  for (const c of configs) {
    if (seen.has(c.vendorSlug)) continue;
    seen.add(c.vendorSlug);
    await ensureVendor(db, propertyId, {
      slug: c.vendorSlug,
      displayName: c.displayName,
    });
  }
}

/** Create an property owned by `userId`: the property row, the owner
 * membership, and its seeded vendors. Shared by sign-up (the default "Home")
 * and the property page. */
export async function createPropertyForUser(
  db: typeof Db,
  userId: string,
  nickname: string,
  addressVariants: string[] = [],
): Promise<PropertyRow> {
  const [property] = await db
    .insert(properties)
    .values({ userId, nickname, addressVariants })
    .returning();
  await db
    .insert(propertyMembers)
    .values({ propertyId: property.id, userId, role: "owner" });
  await seedPropertyVendors(db, property.id);
  return property;
}

/** Seed the official parser set from the built-in engine configs: owned by the
 * system maintainer account, marked verified, and published at v1 so new users
 * can auto-adopt them. Run once at setup (`npm run db:seed`); idempotent by
 * (owner, slug). Returns the number of packages newly inserted. */
export async function seedParserConfigs(db: typeof Db): Promise<number> {
  const ownerId = await ensureSystemUser(db);
  let inserted = 0;
  for (const config of ENGINE_CONFIGS) {
    const existing = await db.query.parserConfigs.findFirst({
      where: and(
        eq(parserConfigs.ownerId, ownerId),
        eq(parserConfigs.slug, config.slug),
      ),
    });
    if (existing) continue;
    const { slug, version, vendor, ...body } = config;
    const [pkg] = await db
      .insert(parserConfigs)
      .values({
        ownerId,
        slug,
        version,
        vendorSlug: vendor.slug,
        displayName: vendor.displayName,
        body,
        verified: true,
      })
      .returning();
    // Publish v1 immediately so the package is adoptable.
    await db.insert(parserVersions).values({
      configId: pkg.id,
      version: pkg.version,
      config: rowToConfig(pkg),
    });
    inserted++;
  }
  return inserted;
}

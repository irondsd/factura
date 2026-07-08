import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db";
import {
  parserConfigs,
  properties,
  propertyMembers,
  vendors,
} from "@/db/schema";
import { ENGINE_CONFIGS } from "@/parsers/engine/configs";
import { OFFICIAL_PARSER_META } from "@/parsers/engine/configs/meta";
import { pickVendorColor } from "@/lib/vendorColors";
import { publishConfig } from "./registry";

type VendorRow = typeof vendors.$inferSelect;
type PropertyRow = typeof properties.$inferSelect;

/** Get an property's vendor for a slug, creating it from preset metadata if it
 * doesn't exist yet. Vendors belong to a property, so this is the single point
 * where a bill being *filed* into an property materializes its vendor row.
 * Idempotent per (propertyId, slug). */
export async function ensureVendor(
  db: Database,
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
  db: Database,
  propertyId: string,
): Promise<void> {
  const configs = await db.query.parserConfigs.findMany({
    where: eq(parserConfigs.tier, "official"),
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
  db: Database,
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

/** Seed the official parser set from the built-in engine configs: ownerless
 * (`ownerId` null), `tier='official'`, tagged with catalog metadata, and
 * published at v1 so new users can auto-adopt them. Run once at setup
 * (`npm run db:seed`); idempotent by (ownerless) slug. Returns the number of
 * packages newly inserted. */
export async function seedParserConfigs(db: Database): Promise<number> {
  let inserted = 0;
  for (const config of ENGINE_CONFIGS) {
    const { slug, version, vendor, ...body } = config;
    const meta = OFFICIAL_PARSER_META[slug];
    const existing = await db.query.parserConfigs.findFirst({
      where: and(
        isNull(parserConfigs.ownerId),
        eq(parserConfigs.slug, config.slug),
      ),
    });
    if (existing) {
      // Never touch the body/version (prod parsers are the source of truth —
      // see resyncOfficialParser to update those deliberately). Only *backfill*
      // missing catalog metadata: `?? existing` keeps any value already set, so
      // a customized prod category/region is preserved.
      if (meta)
        await db
          .update(parserConfigs)
          .set({
            category: existing.category ?? meta.category,
            region: existing.region ?? meta.region,
            provider: existing.provider ?? meta.provider,
            compat: existing.compat ?? meta.compat,
          })
          .where(eq(parserConfigs.id, existing.id));
      continue;
    }
    const [pkg] = await db
      .insert(parserConfigs)
      .values({
        ownerId: null,
        slug,
        version,
        vendorSlug: vendor.slug,
        displayName: vendor.displayName,
        body,
        tier: "official",
        category: meta?.category ?? null,
        region: meta?.region ?? null,
        provider: meta?.provider ?? null,
        compat: meta?.compat ?? null,
      })
      .returning();
    // Publish v1 immediately so the package is adoptable.
    await publishConfig(db, pkg.id);
    inserted++;
  }
  return inserted;
}

import { and, eq } from "drizzle-orm";
import type { db as Db } from "@/db";
import { parserConfigs, parserVersions, vendors } from "@/db/schema";
import { ENGINE_CONFIGS } from "@/parsers/engine/configs";
import { rowToConfig } from "./parsers";
import { ensureSystemUser } from "./registry";

type VendorRow = typeof vendors.$inferSelect;
type Category = (typeof vendors.category.enumValues)[number];

/** Get the user's vendor for a slug, creating it from preset metadata if it
 * doesn't exist yet. Lets new presets attach bills without a separate setup
 * step. Idempotent. */
export async function ensureVendor(
  db: typeof Db,
  userId: string,
  vendor: { slug: string; displayName: string; category: string },
): Promise<VendorRow> {
  const existing = await db.query.vendors.findFirst({
    where: and(eq(vendors.userId, userId), eq(vendors.slug, vendor.slug)),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(vendors)
    .values({
      userId,
      slug: vendor.slug,
      displayName: vendor.displayName,
      category: vendor.category as Category,
    })
    .returning();
  return created;
}

/** Seed a freshly-created user with one vendor per distinct verified-preset
 * vendor, so the Profile page has something to show immediately. Only verified
 * (official) packages are used — these are the ones the user auto-adopts on
 * sign-up. Presets created later are back-filled lazily by ensureVendor on first
 * matching bill. Idempotent. */
export async function seedUserVendors(
  db: typeof Db,
  userId: string,
): Promise<void> {
  const configs = await db.query.parserConfigs.findMany({
    where: eq(parserConfigs.verified, true),
  });
  const seen = new Set<string>();
  for (const c of configs) {
    if (seen.has(c.vendorSlug)) continue;
    seen.add(c.vendorSlug);
    await ensureVendor(db, userId, {
      slug: c.vendorSlug,
      displayName: c.displayName,
      category: c.category,
    });
  }
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
        category: vendor.category as Category,
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

import { eq } from "drizzle-orm";
import { db } from "./index";
import { parserConfigs, users } from "./schema";
import { seedParserConfigs } from "../server/defaults";
import { adoptOfficialDefaults } from "../server/registry";

/** Legacy maintainer account that used to *own* the official parsers. The
 * "official" concept is now an explicit `tier` column on ownerless rows, so this
 * user is retired — migrateOffSystemUser re-points its packages and deletes it. */
const LEGACY_SYSTEM_USER_EMAIL = "system@factura.local";

/** One-time migration for databases seeded under the old model, where official
 * parsers were rows owned by the `system@factura.local` user and flagged with a
 * `verified` boolean. Re-point those rows to the new shape (ownerless,
 * `tier='official'`) and delete the retired user. Idempotent: a no-op once the
 * user is gone. */
async function migrateOffSystemUser(): Promise<void> {
  const legacy = await db.query.users.findFirst({
    where: eq(users.email, LEGACY_SYSTEM_USER_EMAIL),
  });
  if (!legacy) return;
  await db
    .update(parserConfigs)
    .set({ ownerId: null, tier: "official" })
    .where(eq(parserConfigs.ownerId, legacy.id));
  await db.delete(users).where(eq(users.id, legacy.id));
  console.log("Migrated official parsers off the legacy system user.");
}

/** One-time setup: retire the legacy system user, load the built-in official
 * parsers into the DB, and make sure every existing user has adopted them (new
 * users auto-adopt on sign-up). Run with `npm run db:seed` (after
 * `npm run db:push`). Idempotent. */
async function main() {
  await migrateOffSystemUser();

  const inserted = await seedParserConfigs(db);
  console.log(`Seeded parser configs: ${inserted} inserted.`);

  // Backfill: the auto-adopt only fires for new sign-ups, so onboard existing
  // accounts here too, or their detection set would be empty after migration.
  const existing = await db.query.users.findMany({ columns: { id: true } });
  for (const u of existing) await adoptOfficialDefaults(db, u.id);
  console.log(`Adopted official defaults for ${existing.length} user(s).`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

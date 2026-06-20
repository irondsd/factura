import { ne } from "drizzle-orm";
import { db } from "./index";
import { users } from "./schema";
import { seedParserConfigs } from "../server/defaults";
import { adoptVerifiedDefaults, SYSTEM_USER_EMAIL } from "../server/registry";

/** One-time setup: load the built-in official parsers into the DB and make sure
 * every existing user has adopted them (new users auto-adopt on sign-up). Run
 * with `npm run db:seed` (after `npm run db:push`). Idempotent. */
async function main() {
  const inserted = await seedParserConfigs(db);
  console.log(`Seeded parser configs: ${inserted} inserted.`);

  // Backfill: the auto-adopt only fires for new sign-ups, so onboard existing
  // accounts here too, or their detection set would be empty after migration.
  const existing = await db.query.users.findMany({
    where: ne(users.email, SYSTEM_USER_EMAIL),
    columns: { id: true },
  });
  for (const u of existing) await adoptVerifiedDefaults(db, u.id);
  console.log(`Adopted verified defaults for ${existing.length} user(s).`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

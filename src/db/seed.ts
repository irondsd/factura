import { db } from "./index";
import { seedParserConfigs } from "../server/defaults";

/** One-time setup: load the built-in parser presets into the DB.
 * Run with `npm run db:seed` (after `npm run db:push`). Idempotent. */
async function main() {
  const inserted = await seedParserConfigs(db);
  console.log(`Seeded parser configs: ${inserted} inserted.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

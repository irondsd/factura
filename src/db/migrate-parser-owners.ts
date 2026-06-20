import { eq } from "drizzle-orm";
import { db } from "./index";
import { authAccounts, parserConfigs, parserVersions, users } from "./schema";
import { ENGINE_CONFIGS } from "../parsers/engine/configs";
import { rowToConfig } from "../server/parsers";
import {
  adoptVerifiedDefaults,
  ensureSystemUser,
  SYSTEM_USER_EMAIL,
} from "../server/registry";

/**
 * One-time ownership backfill (run once, between the two `db:push`es of the
 * parser-ownership migration — see the comment on parserConfigs in schema.ts).
 *
 * The pre-ownership schema had no `ownerId`, so parsers were global and
 * un-attributed. This assigns each existing parser an owner:
 *   - built-in parsers (slug present in ENGINE_CONFIGS) → the system account,
 *     marked verified and published as v1 so every user adopts them;
 *   - everything else (your custom parsers) → the main Google-linked account.
 * Then it adopts the verified set for every real user so detection works
 * immediately. Idempotent.
 */
async function main() {
  const systemId = await ensureSystemUser(db);

  // The main account is the Google-linked one (the old account isn't Google).
  const google = await db.query.authAccounts.findFirst({
    where: eq(authAccounts.provider, "google"),
  });
  if (!google)
    throw new Error("No Google-linked user found — cannot pick the main account.");
  const mainUserId = google.userId;
  const mainUser = await db.query.users.findFirst({
    where: eq(users.id, mainUserId),
  });
  console.log(`Main (custom-parser owner) account: ${mainUser?.email} (${mainUserId})`);

  const builtinSlugs = new Set(ENGINE_CONFIGS.map((c) => c.slug));
  const rows = await db.query.parserConfigs.findMany();

  let official = 0;
  let custom = 0;
  for (const row of rows) {
    const isBuiltin = builtinSlugs.has(row.slug);
    const ownerId = isBuiltin ? systemId : mainUserId;
    await db
      .update(parserConfigs)
      .set({ ownerId, verified: isBuiltin })
      .where(eq(parserConfigs.id, row.id));

    if (isBuiltin) {
      // Publish v1 — db:seed would skip these (they already exist), so they'd
      // otherwise have no adoptable version.
      await db
        .insert(parserVersions)
        .values({
          configId: row.id,
          version: row.version,
          config: rowToConfig(row),
        })
        .onConflictDoNothing();
      official++;
    } else {
      custom++;
    }
  }
  console.log(
    `Assigned ${official} official parser(s) to system, ${custom} custom parser(s) to ${mainUser?.email}.`,
  );

  const realUsers = (await db.query.users.findMany()).filter(
    (u) => u.email !== SYSTEM_USER_EMAIL,
  );
  for (const u of realUsers) await adoptVerifiedDefaults(db, u.id);
  console.log(`Adopted verified defaults for ${realUsers.length} user(s).`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

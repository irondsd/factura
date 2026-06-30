import { eq } from "drizzle-orm";
import { db } from "../src/db/index";
import { parserConfigs, users } from "../src/db/schema";
import {
  adoptPackage,
  ensureSystemUser,
  publishPackage,
} from "../src/server/registry";

/** Maintainer tool: promote a dev-built parser to the official set.
 *
 * "Official" means: owned by the system maintainer account, marked `verified`
 * (so new sign-ups auto-adopt it), and published as an immutable version (so it
 * is adoptable). This copies a chosen draft into a system-owned package — the
 * original author keeps their own draft untouched.
 *
 * Slugs are namespaced per owner, so several users may have an "edesur". If more
 * than one non-system parser shares the slug, pass --owner=<email> to pick one.
 *
 * Usage:
 *   npx dotenv -e .env.local tsx scripts/makeParserOfficial.ts <slug> [flags]
 *   npx dotenv -e .env.prod  tsx scripts/makeParserOfficial.ts <slug> [flags]
 *
 * Flags:
 *   --owner=<email>     disambiguate when several users have this slug
 *   --no-publish        promote + verify but don't cut a published version
 *   --adopt-existing    also adopt it for every existing user (not just new
 *                       sign-ups); skips users who'd hit a slug collision
 *
 * Idempotent: re-running with no changes is a no-op (no version churn).
 */

type Args = {
  slug: string;
  owner?: string;
  publish: boolean;
  adoptExisting: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const slug = argv.find((a) => !a.startsWith("--"));
  if (!slug) {
    console.error(
      "Usage: tsx scripts/makeParserOfficial.ts <slug> [--owner=email] [--no-publish] [--adopt-existing]",
    );
    process.exit(1);
  }
  const flagValue = (k: string) =>
    argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  return {
    slug,
    owner: flagValue("owner"),
    publish: !argv.includes("--no-publish"),
    adoptExisting: argv.includes("--adopt-existing"),
  };
}

async function main() {
  const { slug, owner, publish, adoptExisting } = parseArgs();
  const systemId = await ensureSystemUser(db);

  const configs = await db.query.parserConfigs.findMany({
    where: eq(parserConfigs.slug, slug),
  });
  if (configs.length === 0) {
    console.error(`No parser with slug "${slug}" in this database.`);
    process.exit(1);
  }

  const systemConfig = configs.find((c) => c.ownerId === systemId) ?? null;
  const candidates = configs.filter((c) => c.ownerId !== systemId);

  // Choose the draft to promote: a user-owned one (preferred), else the existing
  // system-owned package (just (re)verify + publish it).
  let source = systemConfig;
  if (candidates.length > 0) {
    if (owner) {
      const u = await db.query.users.findFirst({
        where: eq(users.email, owner),
      });
      source = (u && candidates.find((c) => c.ownerId === u.id)) || null;
      if (!source) {
        console.error(`No "${slug}" parser owned by ${owner}.`);
        process.exit(1);
      }
    } else if (candidates.length === 1) {
      source = candidates[0];
    } else {
      const owners = await db.query.users.findMany();
      const emailOf = (id: string) =>
        owners.find((u) => u.id === id)?.email ?? id;
      console.error(
        `Several parsers share slug "${slug}". Re-run with --owner=<email>:`,
      );
      for (const c of candidates) {
        console.error(
          `  - ${emailOf(c.ownerId)}  (${c.displayName}, updated ${c.updatedAt.toISOString()})`,
        );
      }
      process.exit(1);
    }
  }
  if (!source) {
    console.error(`No promotable parser with slug "${slug}".`);
    process.exit(1);
  }

  // Upsert the source draft into a system-owned, verified package.
  let officialId: string;
  if (!systemConfig) {
    const [created] = await db
      .insert(parserConfigs)
      .values({
        ownerId: systemId,
        slug,
        version: source.version,
        vendorSlug: source.vendorSlug,
        displayName: source.displayName,
        body: source.body,
        verified: true,
      })
      .returning();
    officialId = created.id;
    console.log(`Created official "${slug}" (config ${officialId}).`);
  } else if (source.id === systemConfig.id) {
    await db
      .update(parserConfigs)
      .set({ verified: true })
      .where(eq(parserConfigs.id, systemConfig.id));
    officialId = systemConfig.id;
    console.log(`Marked existing system "${slug}" verified.`);
  } else {
    const changed =
      JSON.stringify(systemConfig.body) !== JSON.stringify(source.body) ||
      systemConfig.vendorSlug !== source.vendorSlug ||
      systemConfig.displayName !== source.displayName;
    await db
      .update(parserConfigs)
      .set({
        vendorSlug: source.vendorSlug,
        displayName: source.displayName,
        body: source.body,
        verified: true,
        // Bump so the new publish is strictly newer — that's what makes adopters
        // see "Update to vN" and reparse. Unchanged content keeps the version.
        version: changed ? systemConfig.version + 1 : systemConfig.version,
        updatedAt: new Date(),
      })
      .where(eq(parserConfigs.id, systemConfig.id));
    officialId = systemConfig.id;
    console.log(
      changed
        ? `Updated official "${slug}" to v${systemConfig.version + 1}.`
        : `Official "${slug}" already up to date.`,
    );
  }

  if (publish) {
    // publishPackage re-checks for PII literals (account numbers etc.) and
    // throws before anything enters the public registry.
    const version = await publishPackage(db, systemId, officialId);
    console.log(`Published "${slug}" v${version.version}.`);
  } else {
    console.log("Skipped publish (--no-publish).");
  }

  if (adoptExisting) {
    if (!publish) {
      console.error("--adopt-existing requires a published version.");
      process.exit(1);
    }
    const all = await db.query.users.findMany();
    let adopted = 0;
    let skipped = 0;
    for (const u of all) {
      if (u.id === systemId) continue;
      try {
        await adoptPackage(db, u.id, officialId);
        adopted++;
      } catch {
        // Already runs a different parser with this slug, or owns it — leave it.
        skipped++;
      }
    }
    console.log(`Adopted for ${adopted} user(s), skipped ${skipped}.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

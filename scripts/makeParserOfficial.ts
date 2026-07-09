import { eq } from "drizzle-orm";
import { db } from "../src/db/index";
import { parserAdoptions, parserConfigs, users } from "../src/db/schema";
import { OFFICIAL_PARSER_META } from "../src/parsers/engine/configs/meta";
import { adoptPackage, publishConfig } from "../src/server/registry";

/** Maintainer tool: promote a parser's trust tier.
 *
 * Two modes:
 *
 *   default (official) — MOVE a user-owned parser into the OFFICIAL set. The
 *     author's row is flipped ownerless (`ownerId=null`, `tier='official'`) in
 *     place, so it keeps its id: every existing adopter and published version
 *     stays attached and follows it into the official tier, and new sign-ups
 *     auto-adopt it. The author is handed back a fresh private draft under the
 *     same slug — they keep detecting with their own copy (own packages shadow
 *     adopted ones) but no longer steer what adopters run. We don't steal their
 *     parser; we take over stewardship of the public one.
 *
 *   --onlyVerified — grant the VERIFIED badge to an existing user-owned parser
 *     in place: sets `tier='verified'` on that row (keeps its owner), publishes
 *     it, and does NOT auto-adopt it for anyone (verified is opt-in in the
 *     marketplace, unlike official). Use this for a vetted community parser whose
 *     author keeps maintaining it.
 *
 * Slugs are namespaced per owner, so several users may have an "edesur". When
 * more than one user-owned parser shares the slug, pass --owner=<email> to pick.
 *
 * Usage:
 *   npx dotenv -e .env.local tsx scripts/makeParserOfficial.ts <slug> [flags]
 *   npx dotenv -e .env.prod  tsx scripts/makeParserOfficial.ts <slug> [flags]
 *
 * Flags:
 *   --onlyVerified      grant tier='verified' in place instead of promoting to
 *                       the ownerless official set
 *   --owner=<email>     disambiguate when several users have this slug
 *   --no-publish        set the tier but don't cut a published version
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
  onlyVerified: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const slug = argv.find((a) => !a.startsWith("--"));
  if (!slug) {
    console.error(
      "Usage: tsx scripts/makeParserOfficial.ts <slug> [--onlyVerified] [--owner=email] [--no-publish] [--adopt-existing]",
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
    onlyVerified: argv.includes("--onlyVerified"),
  };
}

type ConfigRow = typeof parserConfigs.$inferSelect;

/** Adopt `configId` for every existing user; tolerate slug clashes / ownership. */
async function adoptForAll(configId: string): Promise<void> {
  const all = await db.query.users.findMany();
  let adopted = 0;
  let skipped = 0;
  for (const u of all) {
    try {
      await adoptPackage(db, u.id, configId);
      adopted++;
    } catch {
      // Already runs a different parser with this slug, or owns it — leave it.
      skipped++;
    }
  }
  console.log(`Adopted for ${adopted} user(s), skipped ${skipped}.`);
}

async function main() {
  const { slug, owner, publish, adoptExisting, onlyVerified } = parseArgs();

  const configs = await db.query.parserConfigs.findMany({
    where: eq(parserConfigs.slug, slug),
  });
  if (configs.length === 0) {
    console.error(`No parser with slug "${slug}" in this database.`);
    process.exit(1);
  }

  // The official package is the ownerless row; candidates are user-owned drafts.
  const officialConfig = configs.find((c) => c.ownerId === null) ?? null;
  const candidates = configs.filter((c) => c.ownerId !== null);

  /** Pick the user-owned parser to act on (by --owner, or the sole candidate;
   * bails with a list when ambiguous). Returns null when there are none. */
  const pickCandidate = async (): Promise<ConfigRow | null> => {
    if (candidates.length === 0) return null;
    if (owner) {
      const u = await db.query.users.findFirst({
        where: eq(users.email, owner),
      });
      const c = (u && candidates.find((x) => x.ownerId === u.id)) || null;
      if (!c) {
        console.error(`No "${slug}" parser owned by ${owner}.`);
        process.exit(1);
      }
      return c;
    }
    if (candidates.length === 1) return candidates[0];
    const owners = await db.query.users.findMany();
    const emailOf = (id: string | null) =>
      owners.find((u) => u.id === id)?.email ?? id ?? "(ownerless)";
    console.error(
      `Several parsers share slug "${slug}". Re-run with --owner=<email>:`,
    );
    for (const c of candidates) {
      console.error(
        `  - ${emailOf(c.ownerId)}  (${c.displayName}, updated ${c.updatedAt.toISOString()})`,
      );
    }
    process.exit(1);
  };

  // ── Verified-only: tag an existing owned parser in place ────────────────────
  if (onlyVerified) {
    const source = await pickCandidate();
    if (!source) {
      console.error(
        `--onlyVerified grants the badge to a user-owned parser, but no user owns "${slug}". (Official parsers are already the top tier.)`,
      );
      process.exit(1);
    }
    await db
      .update(parserConfigs)
      .set({ tier: "verified", updatedAt: new Date() })
      .where(eq(parserConfigs.id, source.id));
    console.log(`Marked "${slug}" verified (owner kept).`);

    if (publish) {
      const version = await publishConfig(db, source.id);
      console.log(`Published "${slug}" v${version.version}.`);
    } else {
      console.log("Skipped publish (--no-publish).");
    }
    if (adoptExisting) {
      if (!publish) {
        console.error("--adopt-existing requires a published version.");
        process.exit(1);
      }
      await adoptForAll(source.id);
    }
    process.exit(0);
  }

  // ── Official: flip a user-owned parser into the ownerless official set ───────
  const source = await pickCandidate();
  const meta = OFFICIAL_PARSER_META[slug];

  // No user-owned row to promote: it's either already official (re-publish
  // idempotently) or there's nothing here to act on.
  if (!source) {
    if (!officialConfig) {
      console.error(
        `No user-owned parser with slug "${slug}" to make official.`,
      );
      process.exit(1);
    }
    console.log(`"${slug}" is already official (owner-less).`);
    if (publish) {
      const version = await publishConfig(db, officialConfig.id);
      console.log(`Published "${slug}" v${version.version}.`);
    }
    if (adoptExisting) {
      if (!publish) {
        console.error("--adopt-existing requires a published version.");
        process.exit(1);
      }
      await adoptForAll(officialConfig.id);
    }
    process.exit(0);
  }

  if (source.ownerId === null) {
    // Unreachable (pickCandidate only returns owned rows) — narrows the type.
    console.error(`"${slug}" is already owner-less.`);
    process.exit(1);
  }
  const authorId = source.ownerId;

  // Postgres treats NULL owner ids as distinct in the (owner, slug) unique index,
  // so an earlier run (or the old copy-based script) can leave a stray ownerless
  // official row for this slug. Migrate its adopters onto the row we're promoting,
  // then drop it, so exactly one official row survives per slug.
  let strayAdopterIds: string[] = [];
  await db.transaction(async (tx) => {
    if (officialConfig && officialConfig.id !== source.id) {
      const adoptions = await tx.query.parserAdoptions.findMany({
        where: eq(parserAdoptions.configId, officialConfig.id),
      });
      strayAdopterIds = adoptions.map((a) => a.userId);
      // Cascade drops the stray's versions, adoptions and votes.
      await tx
        .delete(parserConfigs)
        .where(eq(parserConfigs.id, officialConfig.id));
      console.log(
        `Removed a stray official "${slug}" (${officialConfig.id}); migrating ${strayAdopterIds.length} adopter(s).`,
      );
    }

    // Flip the author's row into the official set FIRST, freeing the
    // (owner, slug) unique index for the replacement copy below.
    await tx
      .update(parserConfigs)
      .set({
        ownerId: null,
        tier: "official",
        category: meta?.category ?? source.category,
        region: meta?.region ?? source.region,
        provider: meta?.provider ?? source.provider,
        compat: meta?.compat ?? source.compat,
        updatedAt: new Date(),
      })
      .where(eq(parserConfigs.id, source.id));

    // Hand the author back a private, unpublished copy under the same slug so
    // they keep detecting with their own parser. Not published → invisible in the
    // marketplace; own packages shadow the adopted official one during detection.
    await tx.insert(parserConfigs).values({
      ownerId: authorId,
      slug: source.slug,
      version: source.version,
      vendorSlug: source.vendorSlug,
      displayName: source.displayName,
      body: source.body,
      tier: "community",
      category: source.category,
      region: source.region,
      provider: source.provider,
      compat: source.compat,
      forkedFrom: source.forkedFrom,
    });
  });

  const officialId = source.id;
  const authorEmail =
    (await db.query.users.findFirst({ where: eq(users.id, authorId) }))?.email ??
    authorId;
  console.log(
    `Made "${slug}" official (config ${officialId}); left ${authorEmail} a private copy.`,
  );

  if (publish) {
    // publishConfig re-checks for PII literals (account numbers etc.) and
    // throws before anything enters the public registry. Idempotent when the
    // author already published this version.
    const version = await publishConfig(db, officialId);
    console.log(`Published "${slug}" v${version.version}.`);
  } else {
    console.log("Skipped publish (--no-publish).");
  }

  // Re-point adopters migrated off the stray official row onto the promoted one.
  let migrated = 0;
  for (const uid of strayAdopterIds) {
    try {
      await adoptPackage(db, uid, officialId);
      migrated++;
    } catch {
      // The author, a slug clash, or no published version — leave them.
    }
  }
  if (strayAdopterIds.length > 0) {
    console.log(`Re-pointed ${migrated}/${strayAdopterIds.length} adopter(s).`);
  }

  if (adoptExisting) {
    if (!publish) {
      console.error("--adopt-existing requires a published version.");
      process.exit(1);
    }
    await adoptForAll(officialId);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

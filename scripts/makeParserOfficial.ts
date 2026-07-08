import { eq } from "drizzle-orm";
import { db } from "../src/db/index";
import { parserConfigs, users } from "../src/db/schema";
import { OFFICIAL_PARSER_META } from "../src/parsers/engine/configs/meta";
import { adoptPackage, publishConfig } from "../src/server/registry";

/** Maintainer tool: promote a parser's trust tier.
 *
 * Two modes:
 *
 *   default (official) — promote a dev-built draft into the OFFICIAL set: an
 *     ownerless row tagged `tier='official'` (so new sign-ups auto-adopt it),
 *     published as an immutable version. Copies the chosen draft's body into the
 *     ownerless package; the original author keeps their own draft untouched.
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

  // ── Official: promote a draft into the ownerless official package ───────────
  // Source is a user-owned draft (preferred), else the existing official row.
  const source = (await pickCandidate()) ?? officialConfig;
  if (!source) {
    console.error(`No promotable parser with slug "${slug}".`);
    process.exit(1);
  }

  const meta = OFFICIAL_PARSER_META[slug];

  let officialId: string;
  if (!officialConfig) {
    const [created] = await db
      .insert(parserConfigs)
      .values({
        ownerId: null,
        slug,
        version: source.version,
        vendorSlug: source.vendorSlug,
        displayName: source.displayName,
        body: source.body,
        tier: "official",
        category: meta?.category ?? source.category,
        region: meta?.region ?? source.region,
        provider: meta?.provider ?? source.provider,
        compat: meta?.compat ?? source.compat,
      })
      .returning();
    officialId = created.id;
    console.log(`Created official "${slug}" (config ${officialId}).`);
  } else if (source.id === officialConfig.id) {
    await db
      .update(parserConfigs)
      .set({ tier: "official" })
      .where(eq(parserConfigs.id, officialConfig.id));
    officialId = officialConfig.id;
    console.log(`Marked existing "${slug}" official.`);
  } else {
    const changed =
      JSON.stringify(officialConfig.body) !== JSON.stringify(source.body) ||
      officialConfig.vendorSlug !== source.vendorSlug ||
      officialConfig.displayName !== source.displayName;
    await db
      .update(parserConfigs)
      .set({
        vendorSlug: source.vendorSlug,
        displayName: source.displayName,
        body: source.body,
        tier: "official",
        // Bump so the new publish is strictly newer — that's what makes adopters
        // see "Update to vN" and reparse. Unchanged content keeps the version.
        version: changed ? officialConfig.version + 1 : officialConfig.version,
        updatedAt: new Date(),
      })
      .where(eq(parserConfigs.id, officialConfig.id));
    officialId = officialConfig.id;
    console.log(
      changed
        ? `Updated official "${slug}" to v${officialConfig.version + 1}.`
        : `Official "${slug}" already up to date.`,
    );
  }

  if (publish) {
    // publishConfig re-checks for PII literals (account numbers etc.) and
    // throws before anything enters the public registry.
    const version = await publishConfig(db, officialId);
    console.log(`Published "${slug}" v${version.version}.`);
  } else {
    console.log("Skipped publish (--no-publish).");
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

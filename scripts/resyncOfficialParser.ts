import { eq } from "drizzle-orm";
import { db } from "../src/db/index";
import { parserConfigs, parserVersions } from "../src/db/schema";
import { ENGINE_CONFIGS } from "../src/parsers/engine/configs";
import { reparseUserBills } from "../src/server/reparse";
import {
  adoptPackage,
  ensureSystemUser,
  publishPackage,
} from "../src/server/registry";

/** Maintainer tool: push an edited built-in parser (an `ENGINE_CONFIGS` entry)
 * into an already-seeded database and publish it as a new immutable version.
 *
 * The engine configs under `src/parsers/engine/configs/` are the source of truth
 * for the OFFICIAL parser set, but `db:seed` (seedParserConfigs) is insert-only:
 * it never overwrites a package that already exists. So once a database has been
 * seeded, editing a config file has no effect on it. This script closes that gap
 * — it resyncs the system-owned package's body + version from the file, then
 * publishes, so adopters see "Update to vN".
 *
 * Versioning is file-driven: bump `version` in the config file when you change
 * its body. This refuses to publish a changed body whose file version isn't
 * strictly newer than what's already published (that would collide with an
 * immutable snapshot), telling you to bump it.
 *
 * Usage:
 *   npx dotenv -e .env.local tsx scripts/resyncOfficialParser.ts <slug> [flags]
 *   npx dotenv -e .env.prod  tsx scripts/resyncOfficialParser.ts <slug> [flags]
 *
 * Flags:
 *   --adopt-existing   adopt for every existing user (re-pointing current
 *                      adopters to the new version) and reparse their bills, so
 *                      new fields backfill now. Users running a different parser
 *                      under this slug are skipped. Default: only new sign-ups
 *                      get it, via auto-adopt of the verified set.
 *   --no-publish       update the draft body/version but don't cut a version
 *
 * Idempotent: re-running with no file change is a no-op (no version churn).
 */

type Args = { slug: string; publish: boolean; adoptExisting: boolean };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const slug = argv.find((a) => !a.startsWith("--"));
  if (!slug) {
    console.error(
      "Usage: tsx scripts/resyncOfficialParser.ts <slug> [--adopt-existing] [--no-publish]",
    );
    process.exit(1);
  }
  return {
    slug,
    publish: !argv.includes("--no-publish"),
    adoptExisting: argv.includes("--adopt-existing"),
  };
}

/** Order-insensitive JSON. Postgres `jsonb` does not preserve object key order,
 * so a round-tripped body compared with a plain `JSON.stringify` would look
 * different even when it is byte-for-byte the same content. Sort keys first. */
function canonical(v: unknown): string {
  const sort = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(sort);
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(o)
          .sort()
          .map((k) => [k, sort(o[k])]),
      );
    }
    return x;
  };
  return JSON.stringify(sort(v));
}

async function main() {
  const { slug, publish, adoptExisting } = parseArgs();

  const fileConfig = ENGINE_CONFIGS.find((c) => c.slug === slug);
  if (!fileConfig) {
    console.error(
      `No built-in config with slug "${slug}" in ENGINE_CONFIGS. This script only resyncs official (file-backed) parsers.`,
    );
    process.exit(1);
  }

  const systemId = await ensureSystemUser(db);
  const existing = await db.query.parserConfigs.findFirst({
    where: eq(parserConfigs.slug, slug),
  });
  const systemConfig =
    existing && existing.ownerId === systemId ? existing : null;
  if (!systemConfig) {
    console.error(
      `No system-owned "${slug}" package in this database. Run \`npm run db:seed\` (fresh DB) or \`npm run parser:official ${slug}\` first.`,
    );
    process.exit(1);
  }

  // The file config is source of truth. Split it the way seedParserConfigs does:
  // metadata into columns, the rest into `body`.
  const { version: fileVersion, vendor } = fileConfig;
  const body: Record<string, unknown> = { ...fileConfig };
  delete body.slug;
  delete body.version;
  delete body.vendor;

  // ── Safety guard: never reuse a published version number for new content ──
  // parser_versions snapshots are immutable and publishPackage is idempotent per
  // (config, version): re-publishing an existing version number silently keeps
  // the OLD snapshot, so adopters would never receive the change. Stop instead.
  const published = await db.query.parserVersions.findMany({
    where: eq(parserVersions.configId, systemConfig.id),
  });
  const maxPublished = published.reduce((m, r) => Math.max(m, r.version), 0);
  const atFileVersion = published.find((r) => r.version === fileVersion);
  const matchesPublished =
    atFileVersion !== undefined &&
    canonical(atFileVersion.config) === canonical(fileConfig);

  if (atFileVersion && !matchesPublished) {
    console.error(
      `"${slug}" v${fileVersion} is already published with DIFFERENT content, and published versions are immutable — re-publishing v${fileVersion} would silently keep the old snapshot. Bump \`version\` in the config file to v${maxPublished + 1} and resync.`,
    );
    process.exit(1);
  }
  if (fileVersion < maxPublished) {
    console.error(
      `"${slug}" file version (v${fileVersion}) is behind the latest published version (v${maxPublished}). Bump \`version\` in the config file.`,
    );
    process.exit(1);
  }
  if (matchesPublished) {
    console.log(
      `Official "${slug}" v${fileVersion} is already published and in sync with the file.`,
    );
  }

  // Sync the draft row (body + version) from the file so publishPackage cuts the
  // right snapshot. Cheap and idempotent; safe to run even when already in sync.
  const draftChanged =
    canonical(systemConfig.body) !== canonical(body) ||
    systemConfig.vendorSlug !== vendor.slug ||
    systemConfig.displayName !== vendor.displayName ||
    systemConfig.version !== fileVersion;
  if (draftChanged) {
    await db
      .update(parserConfigs)
      .set({
        vendorSlug: vendor.slug,
        displayName: vendor.displayName,
        body,
        version: fileVersion,
        updatedAt: new Date(),
      })
      .where(eq(parserConfigs.id, systemConfig.id));
    console.log(`Resynced draft "${slug}" to v${fileVersion}.`);
  }

  if (publish) {
    // publishPackage re-checks for PII literals (account numbers etc.) and
    // throws before anything enters the public registry. Idempotent per version.
    const version = await publishPackage(db, systemId, systemConfig.id);
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
    let billsUpdated = 0;
    for (const u of all) {
      if (u.id === systemId) continue;
      try {
        // Re-point the adoption to the latest published version, then reparse so
        // the new field backfills onto existing bills right away.
        await adoptPackage(db, u.id, systemConfig.id);
        const { updated } = await reparseUserBills(db, u.id);
        billsUpdated += updated;
        adopted++;
      } catch {
        // Runs a different parser under this slug, or owns it — leave it.
        skipped++;
      }
    }
    console.log(
      `Adopted for ${adopted} user(s), skipped ${skipped}; reparsed ${billsUpdated} bill(s).`,
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

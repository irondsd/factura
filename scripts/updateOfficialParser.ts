import { existsSync } from "node:fs";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../src/db/index";
import { parserAdoptions, parserConfigs, users } from "../src/db/schema";
import { ENGINE_CONFIGS } from "../src/parsers/engine/configs";
import { rowToConfig } from "../src/server/parsers";
import { configBodySchema } from "../src/server/parserSchema";
import { findUnsafeRegexes } from "../src/server/redos";
import {
  adoptPackage,
  findLikelyPii,
  publishConfig,
} from "../src/server/registry";

/** Maintainer tool: advance the OFFICIAL parser for a slug to a new body and
 * publish it as the next version.
 *
 * Two sources, same job:
 *
 *   --from-preset   the built-in config in src/parsers/engine/configs. This is
 *                   how a parser edited in the repo (and covered by the engine
 *                   tests) reaches a database. `seedParserConfigs` deliberately
 *                   never overwrites an existing official row, so without this
 *                   a repo edit only ever reaches a freshly seeded database.
 *
 *   a copy in the DB (default) — someone refined their own copy in the builder
 *                   against a real bill and it's now ahead of the platform's.
 *                   Read the diff before taking it: builder-generated parsers
 *                   tend to encode the author's own bill (their unit number as
 *                   the identity, their consorcio in a signature), which is fine
 *                   for them and wrong for everyone else.
 *
 * Deliberately NOT `makeParserOfficial.ts`: that script *moves* a user's row
 * into the official set, which means the current official row (and its whole
 * published history) is deleted and adopters are migrated onto a different
 * config id. This one keeps the official package's identity — same id, same
 * version history, same adoptions — and only advances its body. That's what you
 * want when the official parser already exists and just needs to catch up.
 *
 * A source copy is left untouched: the author keeps their own parser, and their
 * own copy keeps shadowing the official one for their own bills.
 *
 * Usage (the `--` matters: without it dotenv-cli eats the --flags):
 *   npx dotenv -e .env.local -- tsx scripts/updateOfficialParser.ts <slug> [flags]
 *   npx dotenv -e .env.prod  -- tsx scripts/updateOfficialParser.ts <slug> [flags]
 *
 * Flags:
 *   --from-preset         take the built-in config for this slug
 *   --from=<email>        whose copy to take, when several users have this slug
 *   --from-id=<uuid>      take a specific config row instead (any slug/owner)
 *   --dry-run             print the diff and exit without writing
 *   --no-publish          update the official draft but don't cut a version
 *   --upgrade-adopters    re-point existing adopters at the new version (they
 *                         stay pinned to their old one otherwise)
 *   --allow-vendor-change also take the source's vendorSlug/displayName
 *
 * Publishing runs the same gates as the app: a config with a hardcoded account
 * number or a catastrophically backtracking regex is refused. Those run BEFORE
 * anything is written, so a rejected source leaves the official row untouched.
 */

type Args = {
  slug: string;
  fromPreset: boolean;
  from?: string;
  fromId?: string;
  dryRun: boolean;
  publish: boolean;
  upgradeAdopters: boolean;
  allowVendorChange: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const slug = argv.find((a) => !a.startsWith("--"));
  if (!slug) {
    console.error(
      "Usage: tsx scripts/updateOfficialParser.ts <slug> [--from-preset] [--from=email] [--from-id=uuid] [--dry-run] [--no-publish] [--upgrade-adopters] [--allow-vendor-change]",
    );
    process.exit(1);
  }
  const flagValue = (k: string) =>
    argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  return {
    slug,
    fromPreset: argv.includes("--from-preset"),
    from: flagValue("from"),
    fromId: flagValue("from-id"),
    dryRun: argv.includes("--dry-run"),
    publish: !argv.includes("--no-publish"),
    upgradeAdopters: argv.includes("--upgrade-adopters"),
    allowVendorChange: argv.includes("--allow-vendor-change"),
  };
}

type ConfigRow = typeof parserConfigs.$inferSelect;

/** The new body, flattened: a built-in preset and a config row differ in
 * everything except the three things this script needs from them. */
type Source = {
  body: Record<string, unknown>;
  label: string;
  vendorSlug: string;
  displayName: string;
};

/** Postgres stores jsonb with its own key order, so the body that comes back out
 * is rarely byte-identical to the one that went in. Compare canonically — keys
 * sorted, arrays left alone because their order is meaningful (captures run in
 * sequence) — or every section reads as "changed" and the no-op check below can
 * never fire, cutting a pointless new version on every run. */
function canon(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canon(v)]),
    );
  return value;
}

const stable = (value: unknown) => JSON.stringify(canon(value));

const short = (value: unknown, max = 140) => {
  const s = stable(value);
  if (s === undefined) return "(none)";
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

/** Which top-level sections of the engine body actually change, plus the custom
 * field names spelled out — that's the part a maintainer is usually here for. */
function printDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const names = (body: Record<string, unknown>) => {
    const custom = body.custom as { name: string }[] | undefined;
    return custom?.length ? custom.map((f) => f.name).join(", ") : "(none)";
  };
  console.log(`  custom fields: ${names(before)} → ${names(after)}`);

  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const changed = keys
    .filter((k) => stable(before[k]) !== stable(after[k]))
    .sort();
  if (changed.length === 0) {
    console.log("  (bodies are identical)");
    return;
  }
  console.log(`  sections changed: ${changed.join(", ")}`);
  for (const k of changed) {
    console.log(`    ${k}:`);
    console.log(`      before ${short(before[k])}`);
    console.log(`      after  ${short(after[k])}`);
  }
}

/** The built-in config for this slug, split the way seedParserConfigs splits it:
 * slug/version/vendor live in columns, everything else is the engine body. */
function presetSource(slug: string): Source {
  const preset = ENGINE_CONFIGS.find((c) => c.slug === slug);
  if (!preset) {
    console.error(
      `No built-in preset with slug "${slug}" (see src/parsers/engine/configs/index.ts).`,
    );
    process.exit(1);
  }
  const body: Record<string, unknown> = { ...preset };
  delete body.slug;
  delete body.version;
  delete body.vendor;
  return {
    body,
    label: `built-in preset src/parsers/engine/configs/${slug}.ts`,
    vendorSlug: preset.vendor.slug,
    displayName: preset.vendor.displayName,
  };
}

/** A copy living in this database: --from-id, --from=<email>, or the only other
 * row sharing the slug. */
async function copySource(args: Args, official: ConfigRow): Promise<Source> {
  const { slug, from, fromId } = args;
  let row: ConfigRow | undefined;

  if (fromId) {
    row = await db.query.parserConfigs.findFirst({
      where: eq(parserConfigs.id, fromId),
    });
    if (!row) {
      console.error(`No parser config with id ${fromId}.`);
      process.exit(1);
    }
    if (row.id === official.id) {
      console.error(
        "--from-id points at the official row itself; there's nothing to copy.",
      );
      process.exit(1);
    }
  } else {
    const candidates = (
      await db.query.parserConfigs.findMany({
        where: eq(parserConfigs.slug, slug),
      })
    ).filter((c) => c.id !== official.id);
    if (candidates.length === 0) {
      console.error(
        `No other parser with slug "${slug}" to copy from. Pass --from-preset to take the built-in config, or --from-id=<uuid> for a copy filed under a different slug.`,
      );
      process.exit(1);
    }
    if (from) {
      const user = await db.query.users.findFirst({
        where: eq(users.email, from),
      });
      row = user ? candidates.find((c) => c.ownerId === user.id) : undefined;
      if (!row) {
        console.error(`No "${slug}" parser owned by ${from}.`);
        process.exit(1);
      }
    } else if (candidates.length === 1) {
      row = candidates[0];
    } else {
      const owners = await db.query.users.findMany();
      const emailOf = (id: string | null) =>
        owners.find((u) => u.id === id)?.email ?? id ?? "(ownerless)";
      console.error(
        `Several copies of "${slug}" exist. Re-run with --from=<email>:`,
      );
      for (const c of candidates) {
        console.error(
          `  - ${emailOf(c.ownerId)}  (${c.displayName}, tier ${c.tier}, updated ${c.updatedAt.toISOString()})`,
        );
      }
      process.exit(1);
    }
  }

  const owner = row.ownerId
    ? ((await db.query.users.findFirst({ where: eq(users.id, row.ownerId) }))
        ?.email ?? row.ownerId)
    : "(ownerless)";
  return {
    body: row.body as Record<string, unknown>,
    label: `copy ${row.id} (${row.tier}) owned by ${owner}`,
    vendorSlug: row.vendorSlug,
    displayName: row.displayName,
  };
}

async function main() {
  const args = parseArgs();
  const {
    slug,
    fromPreset,
    from,
    fromId,
    dryRun,
    publish,
    upgradeAdopters,
    allowVendorChange,
  } = args;

  if (fromPreset && (from || fromId)) {
    console.error("--from-preset can't be combined with --from / --from-id.");
    process.exit(1);
  }

  const official = await db.query.parserConfigs.findFirst({
    where: and(
      isNull(parserConfigs.ownerId),
      eq(parserConfigs.tier, "official"),
      eq(parserConfigs.slug, slug),
    ),
  });
  if (!official) {
    console.error(
      `No official parser with slug "${slug}" in this database. (To promote a user's parser into the official set for the first time, use scripts/makeParserOfficial.ts.)`,
    );
    process.exit(1);
  }

  const source = fromPreset
    ? presetSource(slug)
    : await copySource(args, official);

  // ── Validate before touching anything ───────────────────────────────────────
  const parsed = configBodySchema.safeParse(source.body);
  if (!parsed.success) {
    console.error("The source body isn't a valid parser definition:");
    for (const issue of parsed.error.issues)
      console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    process.exit(1);
  }
  const body = source.body;
  const currentBody = official.body as Record<string, unknown>;

  // A source authored under a different vendor identity is normal — people name
  // their parser after their own consorcio, not after the administrator. Only
  // the engine body travels by default, so bills keep filing under the official
  // vendor; say so rather than refusing, and check `detect` in the diff below
  // (a signature specific to the author's own bill would narrow the official
  // parser to bills like theirs).
  if (source.vendorSlug !== official.vendorSlug) {
    console.log(
      allowVendorChange
        ? `△ Re-filing vendor: "${official.vendorSlug}" → "${source.vendorSlug}" (--allow-vendor-change). Existing bills point at the old vendor until they're reparsed.`
        : `△ The source is authored under vendor "${source.vendorSlug}"; keeping the official "${official.vendorSlug}". Only the engine body is copied.`,
    );
  }

  console.log(
    `Official "${slug}" (${official.id}) v${official.version} ← ${source.label}`,
  );
  printDiff(currentBody, body);

  if (stable(currentBody) === stable(body)) {
    console.log(
      "Official parser already runs this exact body — nothing to do.",
    );
    process.exit(0);
  }

  // The publish gates, run up front so a rejected source leaves the official row
  // exactly as it was (publishConfig re-checks; these are the same checks).
  const prospective = rowToConfig({
    ...official,
    body,
    version: official.version + 1,
    ...(allowVendorChange
      ? { vendorSlug: source.vendorSlug, displayName: source.displayName }
      : {}),
  });
  const pii = findLikelyPii(body);
  if (pii.length > 0) {
    console.error(
      `Blocked: "${pii[0]}" in the source looks like personal data (an account number?). Replace the literal with a pattern before promoting it.`,
    );
    process.exit(1);
  }
  const unsafe = await findUnsafeRegexes(prospective);
  if (unsafe.length > 0) {
    console.error(
      `Blocked: the pattern at ${unsafe[0].path} ${unsafe[0].reason}. Rewrite it without nested or overlapping quantifiers.`,
    );
    process.exit(1);
  }

  if (dryRun) {
    console.log("Dry run — nothing written.");
    process.exit(0);
  }

  // ── Advance the official row in place ───────────────────────────────────────
  const nextVersion = official.version + 1;
  await db
    .update(parserConfigs)
    .set({
      body,
      version: nextVersion,
      ...(allowVendorChange
        ? { vendorSlug: source.vendorSlug, displayName: source.displayName }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(parserConfigs.id, official.id));
  console.log(`Updated official "${slug}" draft to v${nextVersion}.`);

  if (!publish) {
    console.log("Skipped publish (--no-publish). Nobody runs it until you do.");
    process.exit(0);
  }

  const version = await publishConfig(db, official.id);
  console.log(`Published "${slug}" v${version.version} (${version.id}).`);

  if (upgradeAdopters) {
    const adoptions = await db.query.parserAdoptions.findMany({
      where: eq(parserAdoptions.configId, official.id),
    });
    let moved = 0;
    for (const a of adoptions) {
      try {
        await adoptPackage(db, a.userId, official.id);
        moved++;
      } catch {
        // Slug clash or a copy of their own in the way — leave them pinned.
      }
    }
    console.log(
      `Re-pointed ${moved}/${adoptions.length} adopter(s) at v${version.version}. They pick it up on their next reparse.`,
    );
  } else {
    console.log(
      "Existing adopters stay pinned to their current version — pass --upgrade-adopters to move them.",
    );
  }

  const preset = `src/parsers/engine/configs/${slug}.ts`;
  if (!fromPreset && existsSync(preset)) {
    console.log(
      `Note: "${slug}" is also a built-in preset. Update ${preset} to match, or a freshly seeded database will start from the old definition.`,
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

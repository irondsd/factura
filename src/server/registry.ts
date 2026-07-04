import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db";
import {
  parserAdoptions,
  parserConfigs,
  parserVersions,
  users,
} from "@/db/schema";
import type { ParserConfig } from "@/parsers/engine/types";
import { rowToConfig } from "./parsers";

type PackageRow = typeof parserConfigs.$inferSelect;
type VersionRow = typeof parserVersions.$inferSelect;

/** The maintainer account that owns the built-in "official" parsers. Seeded
 * once (see seedParserConfigs); every new user auto-adopts its verified
 * packages so common vendors work on day one. */
export const SYSTEM_USER_EMAIL = "system@factura.local";

// ── Pure helpers (unit-tested in registry.test.ts) ───────────────────────────

/** Combine a user's own draft configs with the published configs they've
 * adopted into the single set detection runs against. On a slug clash the user's
 * OWN package wins — editing your own "edesur" shadows an adopted one. */
export function mergeConfigSets(
  own: ParserConfig[],
  adopted: ParserConfig[],
): ParserConfig[] {
  const bySlug = new Map<string, ParserConfig>();
  for (const c of adopted) bySlug.set(c.slug, c);
  for (const c of own) bySlug.set(c.slug, c);
  return [...bySlug.values()];
}

/** Would adopting `slug` clash with a slug the user already runs? Keeps
 * `bills.parserKey` (a bare slug) unambiguous within one user's set. */
export function hasSlugCollision(
  existing: ParserConfig[],
  slug: string,
): boolean {
  return existing.some((c) => c.slug === slug);
}

/** String literals in a parser body that look like personal data — a run of 7+
 * digits, e.g. a hardcoded account number. Published bodies are world-readable,
 * so publish is blocked when this is non-empty. Heuristic: regex parsers
 * legitimately contain short digit groups (`\d{4}`, years), but a 7+ digit
 * literal is almost always a real account number that belongs in a `\d{7,}`
 * pattern instead. Pure (unit-tested). */
export function findLikelyPii(body: unknown): string[] {
  const hits: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === "string") {
      for (const m of v.matchAll(/\d{7,}/g)) hits.push(m[0]);
    } else if (Array.isArray(v)) {
      for (const item of v) walk(item);
    } else if (v && typeof v === "object") {
      for (const item of Object.values(v)) walk(item);
    }
  };
  walk(body);
  return [...new Set(hits)];
}

// ── DB helpers ───────────────────────────────────────────────────────────────

/** The configs a user is allowed to parse with: their own packages (draft body)
 * plus every published version they've adopted. This is the security boundary —
 * nothing global, nothing un-adopted. Replaces the old loadParserConfigs(db),
 * which loaded every preset in the database. */
export function loadUserConfigs(
  db: Database,
  userId: string,
): Promise<ParserConfig[]> {
  return runConfigsExcept(db, userId, null);
}

/** loadUserConfigs, optionally skipping one package id (both as an owned
 * package and as an adoption). Used by the adopt collision check, which must
 * compare a candidate against everything the user runs *except* the package
 * being adopted/upgraded. */
async function runConfigsExcept(
  db: Database,
  userId: string,
  exceptConfigId: string | null,
): Promise<ParserConfig[]> {
  const ownRows = await db.query.parserConfigs.findMany({
    where: eq(parserConfigs.ownerId, userId),
  });
  const own = ownRows.filter((r) => r.id !== exceptConfigId).map(rowToConfig);

  const adoptions = await db.query.parserAdoptions.findMany({
    where: eq(parserAdoptions.userId, userId),
  });
  const versionIds = adoptions
    .filter((a) => a.configId !== exceptConfigId)
    .map((a) => a.versionId);
  let adopted: ParserConfig[] = [];
  if (versionIds.length > 0) {
    const versionRows = await db.query.parserVersions.findMany({
      where: inArray(parserVersions.id, versionIds),
    });
    adopted = versionRows.map((v) => v.config as ParserConfig);
  }
  return mergeConfigSets(own, adopted);
}

/** Throw unless `id` names a package owned by `userId`. NOT_FOUND (not
 * FORBIDDEN) so a caller can't probe which package ids exist. */
export async function assertOwnsPackage(
  db: Database,
  userId: string,
  id: string,
): Promise<PackageRow> {
  const row = await db.query.parserConfigs.findFirst({
    where: and(eq(parserConfigs.id, id), eq(parserConfigs.ownerId, userId)),
  });
  if (!row)
    throw new TRPCError({ code: "NOT_FOUND", message: "Parser not found" });
  return row;
}

/** Freeze the owner's current draft into an immutable published version. The
 * draft's `version` (bumped on every edit) becomes the version number, so each
 * publish after an edit is strictly newer. Publishing twice without editing is
 * idempotent. Owner-only. */
export async function publishPackage(
  db: Database,
  userId: string,
  id: string,
): Promise<VersionRow> {
  const pkg = await assertOwnsPackage(db, userId, id);
  // Don't let a hardcoded account number into the public registry.
  const pii = findLikelyPii(pkg.body);
  if (pii.length > 0)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Publishing is blocked: "${pii[0]}" looks like personal data (an account number?). Replace the literal with a pattern like \\d{7,} before publishing.`,
    });
  const existing = await db.query.parserVersions.findFirst({
    where: and(
      eq(parserVersions.configId, id),
      eq(parserVersions.version, pkg.version),
    ),
  });
  if (existing) return existing;
  const [row] = await db
    .insert(parserVersions)
    .values({ configId: id, version: pkg.version, config: rowToConfig(pkg) })
    .returning();
  return row;
}

/** Adopt a published package at a specific version (default: its latest). The
 * package must be published; you can't adopt your own (you already run its
 * draft); and the adopted slug must not clash with one you already run.
 * Re-adopting the same package with a newer version is how an upgrade happens —
 * the caller should reparse afterward to apply it to existing bills. */
export async function adoptPackage(
  db: Database,
  userId: string,
  configId: string,
  versionId?: string,
): Promise<{ configId: string; versionId: string }> {
  const pkg = await db.query.parserConfigs.findFirst({
    where: eq(parserConfigs.id, configId),
  });
  if (!pkg)
    throw new TRPCError({ code: "NOT_FOUND", message: "Parser not found" });
  if (pkg.ownerId === userId)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "You already own this parser",
    });

  const version = versionId
    ? await db.query.parserVersions.findFirst({
        where: and(
          eq(parserVersions.id, versionId),
          eq(parserVersions.configId, configId),
        ),
      })
    : await db.query.parserVersions.findFirst({
        where: eq(parserVersions.configId, configId),
        orderBy: [desc(parserVersions.version)],
      });
  if (!version)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This parser has no published version to adopt",
    });

  // A clash from a *different* package would make `bills.parserKey` ambiguous.
  // Re-adopting this same package (an upgrade) keeps its own slug, so exclude it.
  const slug = (version.config as ParserConfig).slug;
  const otherRun = await runConfigsExcept(db, userId, configId);
  if (hasSlugCollision(otherRun, slug))
    throw new TRPCError({
      code: "CONFLICT",
      message: `You already run a different parser named "${slug}"`,
    });

  await db
    .insert(parserAdoptions)
    .values({ userId, configId, versionId: version.id })
    .onConflictDoUpdate({
      target: [parserAdoptions.userId, parserAdoptions.configId],
      set: { versionId: version.id, adoptedAt: new Date() },
    });
  return { configId, versionId: version.id };
}

/** Stop running an adopted package. The user's bills keep their last parse until
 * they reparse. */
export async function unadoptPackage(
  db: Database,
  userId: string,
  configId: string,
): Promise<void> {
  await db
    .delete(parserAdoptions)
    .where(
      and(
        eq(parserAdoptions.userId, userId),
        eq(parserAdoptions.configId, configId),
      ),
    );
}

/** Adopt every verified package at its latest published version. Called on
 * sign-up so a new account immediately detects the common vendors. Idempotent. */
export async function adoptVerifiedDefaults(
  db: Database,
  userId: string,
): Promise<void> {
  const verified = await db.query.parserConfigs.findMany({
    where: eq(parserConfigs.verified, true),
  });
  for (const pkg of verified) {
    if (pkg.ownerId === userId) continue;
    const version = await db.query.parserVersions.findFirst({
      where: eq(parserVersions.configId, pkg.id),
      orderBy: [desc(parserVersions.version)],
    });
    if (!version) continue;
    await db
      .insert(parserAdoptions)
      .values({ userId, configId: pkg.id, versionId: version.id })
      .onConflictDoNothing();
  }
}

/** Get (creating if needed) the maintainer account that owns the official
 * parsers. Has no auth credentials — it exists only to own verified packages. */
export async function ensureSystemUser(db: Database): Promise<string> {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, SYSTEM_USER_EMAIL),
  });
  if (existing) return existing.id;
  const [created] = await db
    .insert(users)
    .values({ name: "Factura (official)", email: SYSTEM_USER_EMAIL })
    .returning();
  return created.id;
}

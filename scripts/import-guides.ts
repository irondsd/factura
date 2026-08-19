import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { cmsMembers, cmsPages, users } from "@/db/schema";
import {
  declaredImports,
  documentsFromFilesystem,
} from "@/content-system/adapters/filesystem";
import { validateContentCollection } from "@/content-system/validation";
import { db } from "@/db";
import type { ContentDocument } from "@/content-system/types";
import { rowToDocument } from "@/content-system/repository/mapping";

const EXPECTED_IMPORTS = new Set(["@/components/guides/InflacionChart"]);
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const production = args.has("--production");

function databaseTarget(): { host: string; local: boolean } {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required for guide import");
  const host = new URL(value).hostname;
  return {
    host,
    local: new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "db"]).has(
      host,
    ),
  };
}

function assertExpectedImports(): void {
  const dir = path.join(process.cwd(), "src/content/guias");
  for (const file of fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".mdx"))) {
    const imports = declaredImports(
      fs.readFileSync(path.join(dir, file), "utf8"),
    );
    for (const specifier of imports) {
      if (!EXPECTED_IMPORTS.has(specifier)) {
        throw new Error(
          `${file}: refusing unexpected import ${JSON.stringify(specifier)}`,
        );
      }
    }
  }
}

/** JSONB preserves values, not an author's object-key order. Normalizing keys
 * makes the importer compare data rather than harmless serialization order. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function sameSource(source: ContentDocument, stored: ContentDocument): boolean {
  return (
    JSON.stringify({
      section: source.section,
      slug: source.slug,
      status: source.status,
      body: source.body,
      title: source.title,
      titleTag: source.titleTag,
      description: source.description,
      summary: source.summary,
      cta: source.cta,
      canonicalSlug: source.canonicalSlug,
      metadata: stableJson(source.metadata),
      parentId: source.parentId,
      sortOrder: source.sortOrder,
      crumb: source.crumb,
      // PostgreSQL normalizes a timestamptz to UTC; source MDX retains its
      // authored offset.  Compare instants, not their textual spellings, so a
      // no-op import remains a no-op after the first round trip.
      publishedAt: source.publishedAt ? Date.parse(source.publishedAt) : null,
      contentUpdatedAt: Date.parse(source.contentUpdatedAt),
    }) ===
    JSON.stringify({
      section: stored.section,
      slug: stored.slug,
      status: stored.status,
      body: stored.body,
      title: stored.title,
      titleTag: stored.titleTag,
      description: stored.description,
      summary: stored.summary,
      cta: stored.cta,
      canonicalSlug: stored.canonicalSlug,
      metadata: stableJson(stored.metadata),
      parentId: stored.parentId,
      sortOrder: stored.sortOrder,
      crumb: stored.crumb,
      publishedAt: stored.publishedAt ? Date.parse(stored.publishedAt) : null,
      contentUpdatedAt: Date.parse(stored.contentUpdatedAt),
    })
  );
}

async function main() {
  const target = databaseTarget();
  if (!target.local) {
    if (
      !production ||
      process.env.CMS_IMPORT_PRODUCTION_CONFIRM !== "IMPORT_GUIDES"
    ) {
      throw new Error(
        `Refusing non-local database host ${JSON.stringify(target.host)}. ` +
          "Production requires --production and CMS_IMPORT_PRODUCTION_CONFIRM=IMPORT_GUIDES.",
      );
    }
  } else if (production) {
    throw new Error("--production cannot target a local database");
  }

  const actorEmail = process.env.CMS_IMPORT_ACTOR_EMAIL;
  if (!actorEmail) {
    throw new Error("CMS_IMPORT_ACTOR_EMAIL must name an existing CMS member");
  }
  const [actor] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(cmsMembers, eq(cmsMembers.userId, users.id))
    .where(and(eq(users.email, actorEmail)));
  if (!actor) throw new Error(`${actorEmail} is not an active CMS member`);

  assertExpectedImports();
  const source = documentsFromFilesystem("guias");
  const stored = (
    await db.query.cmsPages.findMany({
      where: eq(cmsPages.section, "guias"),
    })
  ).map(rowToDocument);
  const bySlug = new Map(stored.map((document) => [document.slug, document]));
  const changed = source.filter((document) => {
    const current = bySlug.get(document.slug);
    return !current || !sameSource(document, current);
  });

  console.log(
    `Guide import target: ${target.local ? "local" : "production"} (${target.host})`,
  );
  console.log(
    `${source.length} source guides; ${changed.length} insert/update; ${source.length - changed.length} unchanged.`,
  );
  if (args.has("--explain")) {
    for (const document of changed) {
      const current = bySlug.get(document.slug);
      if (!current) {
        console.log(`${document.slug}: missing`);
        continue;
      }
      const pairs: [string, unknown, unknown][] = [
        ["status", document.status, current.status],
        ["body", document.body, current.body],
        ["title", document.title, current.title],
        ["titleTag", document.titleTag, current.titleTag],
        ["description", document.description, current.description],
        ["summary", document.summary, current.summary],
        ["cta", document.cta, current.cta],
        ["canonicalSlug", document.canonicalSlug, current.canonicalSlug],
        ["metadata", document.metadata, current.metadata],
        ["parentId", document.parentId, current.parentId],
        ["sortOrder", document.sortOrder, current.sortOrder],
        ["crumb", document.crumb, current.crumb],
        [
          "publishedAt",
          document.publishedAt ? Date.parse(document.publishedAt) : null,
          current.publishedAt ? Date.parse(current.publishedAt) : null,
        ],
        [
          "contentUpdatedAt",
          Date.parse(document.contentUpdatedAt),
          Date.parse(current.contentUpdatedAt),
        ],
      ];
      console.log(
        `${document.slug}: ${pairs
          .filter(
            ([, sourceValue, storedValue]) =>
              JSON.stringify(sourceValue) !== JSON.stringify(storedValue),
          )
          .map(([field]) => field)
          .join(", ")}`,
      );
      if (
        JSON.stringify(document.metadata) !== JSON.stringify(current.metadata)
      ) {
        const keys = new Set([
          ...Object.keys(document.metadata),
          ...Object.keys(current.metadata),
        ]);
        console.log(
          `  metadata: ${[...keys]
            .filter(
              (key) =>
                JSON.stringify(
                  document.metadata[key as keyof typeof document.metadata],
                ) !==
                JSON.stringify(
                  current.metadata[key as keyof typeof current.metadata],
                ),
            )
            .join(", ")}`,
        );
      }
    }
  }
  if (dryRun) return;

  for (const document of changed) {
    const publishedAt = document.publishedAt
      ? new Date(document.publishedAt)
      : null;
    const contentUpdatedAt = new Date(document.contentUpdatedAt);
    const createdAt = new Date(document.createdAt || document.contentUpdatedAt);
    const updatedAt = new Date(document.updatedAt || document.contentUpdatedAt);
    // This is migration-only SQL. Request-path reads and browser/MCP mutations
    // remain confined to the repository and CmsPageStore; the importer needs
    // an upsert that preserves source timestamps and is deliberately a no-op
    // for identical rows.
    await db
      .insert(cmsPages)
      .values({
        section: document.section,
        slug: document.slug,
        status: document.status,
        bodyMdx: document.body,
        title: document.title,
        titleTag: document.titleTag,
        description: document.description,
        summary: document.summary,
        cta: document.cta,
        canonicalSlug: document.canonicalSlug,
        metadata: document.metadata,
        parentId: document.parentId,
        sortOrder: document.sortOrder,
        crumb: document.crumb,
        lockVersion: 1,
        createdBy: actor.id,
        updatedBy: actor.id,
        createdAt,
        updatedAt,
        publishedAt,
        contentUpdatedAt,
      })
      .onConflictDoUpdate({
        target: [cmsPages.section, cmsPages.slug],
        set: {
          status: document.status,
          bodyMdx: document.body,
          title: document.title,
          titleTag: document.titleTag,
          description: document.description,
          summary: document.summary,
          cta: document.cta,
          canonicalSlug: document.canonicalSlug,
          metadata: document.metadata,
          parentId: document.parentId,
          sortOrder: document.sortOrder,
          crumb: document.crumb,
          updatedBy: actor.id,
          updatedAt,
          publishedAt,
          contentUpdatedAt,
        },
      });
  }

  const imported = (
    await db.query.cmsPages.findMany({
      where: eq(cmsPages.section, "guias"),
    })
  ).map(rowToDocument);
  const diagnostics = validateContentCollection(imported);
  const problems = [...diagnostics.values()].flat();
  if (problems.length) {
    throw new Error(
      `Imported guides have ${problems.length} validation diagnostics`,
    );
  }
  console.log(`Imported ${changed.length} guides; validation clean.`);
}

await main();

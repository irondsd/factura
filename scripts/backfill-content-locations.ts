import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "@/db";
import { cmsLocations, cmsPageRevisions, cmsPages } from "@/db/schema";
import { CONTENT_SECTIONS, isContentSection } from "@/content-system/types";

type Mapping = {
  version: 1;
  pages: {
    id: string;
    section: string;
    slug: string;
    title: string;
    locations: string[];
  }[];
};
const apply = process.argv.includes("--apply");
const mappingPath = resolve(
  process.cwd(),
  "plans/content-location-backfill.json",
);
const mapping = JSON.parse(await readFile(mappingPath, "utf8")) as Mapping;
if (mapping.version !== 1 || !Array.isArray(mapping.pages))
  throw new Error("Unsupported location mapping format.");

const registry = await db.select().from(cmsLocations);
const activeKeys = new Set(
  registry.filter((item) => !item.retiredAt).map((item) => item.key),
);
const mappedIds = new Set<string>();
for (const page of mapping.pages) {
  if (mappedIds.has(page.id))
    throw new Error(`Duplicate page id in mapping: ${page.id}`);
  mappedIds.add(page.id);
  if (!isContentSection(page.section))
    throw new Error(`Unknown section in mapping: ${page.section}`);
  if (!page.locations.length)
    throw new Error(`Page ${page.id} has no locations.`);
  if (new Set(page.locations).size !== page.locations.length)
    throw new Error(`Page ${page.id} has duplicate locations.`);
  for (const key of page.locations)
    if (!activeKeys.has(key))
      throw new Error(
        `Page ${page.id} has unknown or retired location: ${key}`,
      );
}

const published = await db
  .select({ id: cmsPages.id, section: cmsPages.section, slug: cmsPages.slug })
  .from(cmsPages)
  .where(eq(cmsPages.status, "published"));
const dbIds = new Set(published.map((page) => page.id));
const missingFromDb = mapping.pages.filter((page) => !dbIds.has(page.id));
const absentFromMapping = published.filter((page) => !mappedIds.has(page.id));
if (missingFromDb.length || absentFromMapping.length) {
  console.error(
    JSON.stringify(
      {
        missingFromDb: missingFromDb.map((page) => page.id),
        absentFromMapping,
      },
      null,
      2,
    ),
  );
  throw new Error("The mapping and published database inventory do not match.");
}

const before = await counts();
console.log(
  JSON.stringify(
    { mode: apply ? "apply" : "dry-run", pages: mapping.pages.length, before },
    null,
    2,
  ),
);
if (!apply) {
  console.log(
    "[locations] dry-run only; pass --apply after the mapping and production command receive explicit human approval.",
  );
  process.exit(0);
}

await db.transaction(async (tx) => {
  for (const page of mapping.pages) {
    const [row] = await tx
      .select({
        publishedRevisionId: cmsPages.publishedRevisionId,
        previewRevisionId: cmsPages.previewRevisionId,
        wipRevisionId: cmsPages.wipRevisionId,
      })
      .from(cmsPages)
      .where(eq(cmsPages.id, page.id))
      .limit(1);
    if (!row)
      throw new Error(`Page disappeared during transaction: ${page.id}`);
    const revisionIds = [
      row.publishedRevisionId,
      row.previewRevisionId,
      row.wipRevisionId,
    ].filter((id): id is string => !!id);
    if (!revisionIds.length) continue;
    await tx
      .update(cmsPageRevisions)
      .set({
        metadata: sql`jsonb_set(${cmsPageRevisions.metadata}, '{locations}', ${JSON.stringify([...page.locations].sort())}::jsonb, true)`,
        // Explicit self-assignments document and enforce that protected columns
        // are not stamped by ORM defaults or hooks during this exceptional path.
        updatedAt: sql`${cmsPageRevisions.updatedAt}`,
        contentUpdatedAt: sql`${cmsPageRevisions.contentUpdatedAt}`,
      })
      .where(inArray(cmsPageRevisions.id, revisionIds));
  }
});

const after = await counts();
console.log(JSON.stringify({ after }, null, 2));
const invalid = await db
  .select({ id: cmsPageRevisions.id })
  .from(cmsPageRevisions)
  .innerJoin(
    cmsPages,
    and(
      eq(cmsPageRevisions.pageId, cmsPages.id),
      or(
        eq(cmsPageRevisions.id, cmsPages.publishedRevisionId),
        eq(cmsPageRevisions.id, cmsPages.previewRevisionId),
        eq(cmsPageRevisions.id, cmsPages.wipRevisionId),
      ),
    ),
  )
  .where(
    or(
      isNull(sql`${cmsPageRevisions.metadata}->'locations'`),
      sql`jsonb_array_length(${cmsPageRevisions.metadata}->'locations') = 0`,
    ),
  );
if (invalid.length)
  throw new Error(
    `Post-check found ${invalid.length} active revisions without locations.`,
  );
process.exit(0);

async function counts() {
  const rows = await db
    .select({ section: cmsPages.section, metadata: cmsPageRevisions.metadata })
    .from(cmsPages)
    .innerJoin(
      cmsPageRevisions,
      eq(cmsPageRevisions.id, cmsPages.publishedRevisionId),
    )
    .where(eq(cmsPages.status, "published"));
  const bySection = Object.fromEntries(
    CONTENT_SECTIONS.map((section) => [section, 0]),
  );
  const byLocation: Record<string, number> = {};
  for (const row of rows) {
    bySection[row.section] = (bySection[row.section] ?? 0) + 1;
    const locations = (row.metadata as { locations?: unknown }).locations;
    if (Array.isArray(locations))
      for (const key of locations)
        if (typeof key === "string")
          byLocation[key] = (byLocation[key] ?? 0) + 1;
  }
  return { bySection, byLocation };
}

import { and, eq, inArray, or, sql } from "drizzle-orm";
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

const before = await counts(db);
console.log(
  JSON.stringify(
    {
      mode: apply ? "apply" : "dry-run",
      pages: mapping.pages.length,
      before,
      proposed: mappingCounts(mapping.pages),
    },
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

  // Verify inside the transaction, so a failed check rolls the write back
  // instead of reporting a problem about rows that are already committed.
  // Scoped to *published* pages: a draft's working copy is allowed to carry no
  // locations, and the publish gate is what stops it reaching a reader.
  const problems = await verify(tx);
  if (problems.length) {
    console.error(JSON.stringify({ problems }, null, 2));
    throw new Error(
      `Post-check failed on ${problems.length} active revision(s); rolling back.`,
    );
  }
});

console.log(JSON.stringify({ after: await counts(db) }, null, 2));
console.log(
  "[locations] applied. Redeploy now so no cached article, hub, sitemap or llms.txt survives with the pre-backfill metadata.",
);
process.exit(0);

type Reader = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Every active revision of a published page must name at least one active
 * location. Returns what is wrong rather than throwing, so the caller can print
 * the whole list once. */
async function verify(reader: Reader): Promise<string[]> {
  const rows = await reader
    .select({
      section: cmsPages.section,
      slug: cmsPages.slug,
      revisionId: cmsPageRevisions.id,
      kind: cmsPageRevisions.kind,
      metadata: cmsPageRevisions.metadata,
    })
    .from(cmsPages)
    .innerJoin(
      cmsPageRevisions,
      and(
        eq(cmsPageRevisions.pageId, cmsPages.id),
        or(
          eq(cmsPageRevisions.id, cmsPages.publishedRevisionId),
          eq(cmsPageRevisions.id, cmsPages.previewRevisionId),
          eq(cmsPageRevisions.id, cmsPages.wipRevisionId),
        ),
      ),
    )
    .where(eq(cmsPages.status, "published"));

  const problems: string[] = [];
  for (const row of rows) {
    const where = `${row.section}/${row.slug} (${row.kind} ${row.revisionId})`;
    const locations = (row.metadata as { locations?: unknown }).locations;
    if (!Array.isArray(locations) || locations.length === 0) {
      problems.push(`${where} has no locations`);
      continue;
    }
    for (const key of locations) {
      if (typeof key !== "string" || !activeKeys.has(key)) {
        problems.push(
          `${where} has unknown or retired location ${String(key)}`,
        );
      }
    }
  }
  return problems;
}

async function counts(reader: Reader) {
  const rows = await reader
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

function mappingCounts(pages: Mapping["pages"]) {
  const bySection = Object.fromEntries(
    CONTENT_SECTIONS.map((section) => [section, 0]),
  );
  const byLocation: Record<string, number> = {};
  for (const page of pages) {
    bySection[page.section] = (bySection[page.section] ?? 0) + 1;
    for (const key of page.locations)
      byLocation[key] = (byLocation[key] ?? 0) + 1;
  }
  return { bySection, byLocation };
}

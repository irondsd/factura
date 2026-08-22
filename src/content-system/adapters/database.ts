import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db as defaultDb, type Database } from "@/db";
import { cmsPageRevisions, cmsPages } from "@/db/schema";
import type { ContentDocument, ContentSection } from "../types";
import { type CmsRevisionRow, rowToDocument } from "../repository/mapping";

// `documentsFromDatabase()` (cms.md), the counterpart to the filesystem
// adapter: the whole of a section as `ContentDocument`s, in every state.
//
// Used for validation and migration parity, not for rendering — the public site
// reads through `ContentRepository`, which applies the lifecycle rules. This
// deliberately does not: a collection validator has to see drafts, because
// "this published page links to a draft" is exactly the finding it exists to
// produce.
//
// The copy it reads is the one the CMS would open: the working copy if there is
// one, otherwise the last publication or the public preview. That is the
// version a validator should judge, because it is the version somebody is
// about to publish.
//
// Ordered by slug so a parity report against `documentsFromFilesystem()` lines
// up row for row.

/** `cmsPointer()` from `../repository/revisionSelection`, as SQL. */
const CMS_REVISION_ID = sql`coalesce(${cmsPages.wipRevisionId}, ${cmsPages.publishedRevisionId}, ${cmsPages.previewRevisionId})`;

const PAGE_COLUMNS = {
  id: cmsPages.id,
  section: cmsPages.section,
  slug: cmsPages.slug,
  status: cmsPages.status,
  publishedAt: cmsPages.publishedAt,
  createdAt: cmsPages.createdAt,
  createdBy: cmsPages.createdBy,
  lockVersion: cmsPages.lockVersion,
} as const;

export async function documentsFromDatabase(
  section: ContentSection = "guias",
  database: Database = defaultDb,
): Promise<ContentDocument[]> {
  const rows = await database
    .select({ page: PAGE_COLUMNS, revision: cmsPageRevisions })
    .from(cmsPages)
    .innerJoin(cmsPageRevisions, eq(cmsPageRevisions.id, CMS_REVISION_ID))
    .where(eq(cmsPages.section, section))
    .orderBy(asc(cmsPages.slug));
  return rows.map((row) =>
    rowToDocument(row.page, row.revision as CmsRevisionRow),
  );
}

/** One document by its path, in any state. The CMS preview route and the
 * importer's idempotence check both need "whatever is stored here", which is
 * the one question the public repository will not answer. */
export async function documentFromDatabase(
  section: ContentSection,
  slug: string,
  database: Database = defaultDb,
): Promise<ContentDocument | null> {
  const [row] = await database
    .select({ page: PAGE_COLUMNS, revision: cmsPageRevisions })
    .from(cmsPages)
    .innerJoin(cmsPageRevisions, eq(cmsPageRevisions.id, CMS_REVISION_ID))
    .where(and(eq(cmsPages.section, section), eq(cmsPages.slug, slug)))
    .limit(1);
  return row ? rowToDocument(row.page, row.revision as CmsRevisionRow) : null;
}

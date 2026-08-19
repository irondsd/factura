import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db as defaultDb, type Database } from "@/db";
import { cmsPages } from "@/db/schema";
import type { ContentDocument, ContentSection } from "../types";
import { rowToDocument } from "../repository/mapping";

// `documentsFromDatabase()` (cms.md §5.2), the counterpart to the filesystem
// adapter: the whole of a section as `ContentDocument`s, in every state.
//
// Used for validation and migration parity, not for rendering — the public site
// reads through `ContentRepository`, which applies the lifecycle rules. This
// deliberately does not: a collection validator has to see drafts, because
// "this published page links to a draft" is exactly the finding it exists to
// produce.
//
// Ordered by slug so a parity report against `documentsFromFilesystem()` lines
// up row for row.

export async function documentsFromDatabase(
  section: ContentSection = "guias",
  database: Database = defaultDb,
): Promise<ContentDocument[]> {
  const rows = await database.query.cmsPages.findMany({
    where: eq(cmsPages.section, section),
    orderBy: [asc(cmsPages.slug)],
  });
  return rows.map(rowToDocument);
}

/** One document by its path, in any state. The CMS preview route and the
 * importer's idempotence check both need "whatever is stored here", which is
 * the one question the public repository will not answer. */
export async function documentFromDatabase(
  section: ContentSection,
  slug: string,
  database: Database = defaultDb,
): Promise<ContentDocument | null> {
  const row = await database.query.cmsPages.findFirst({
    where: and(eq(cmsPages.section, section), eq(cmsPages.slug, slug)),
  });
  return row ? rowToDocument(row) : null;
}

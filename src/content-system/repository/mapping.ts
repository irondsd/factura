import type { cmsPages } from "@/db/schema";
import { guideMetadataSchema } from "../metadata/guias";
import {
  type ContentDocument,
  type ContentMetadata,
  type ContentSummary,
  isContentSection,
} from "../types";

// The one translation between a `cms_page` row and a `ContentDocument`. Every
// reader goes through it, so "what a row means" has a single definition and the
// JSONB column is parsed — not cast — exactly once.

export type CmsPageRow = typeof cmsPages.$inferSelect;

/** A row read with the body projected away — what every listing query returns.
 * Derived from the full row type so a new column cannot be added to one shape
 * and forgotten in the other. */
export type CmsPageSummaryRow = Omit<CmsPageRow, "bodyMdx">;

/** Timestamps cross this boundary as ISO strings, not `Date`s.
 *
 * The rendered page prints the publication timestamp verbatim into both the
 * visible dateline and the JSON-LD, and Google requires those two to match. A
 * `Date` has already thrown away the authored offset —
 * `2026-07-12T09:00:00-03:00` comes back as an instant that formats differently
 * depending on where the process runs. Keeping the string keeps the offset. */
const iso = (value: Date): string => value.toISOString();

/** Parse a projected row into a summary, or throw.
 *
 * Throwing is deliberate: a row whose `metadata` does not match the schema is
 * data corruption, not user error. Every write goes through the same schema, so
 * the only ways to get one are a hand-edited row or a schema change without a
 * backfill — and rendering half a page is worse than a loud failure. */
export function rowToSummary(row: CmsPageSummaryRow): ContentSummary {
  if (!isContentSection(row.section)) {
    throw new Error(
      `cms_page ${row.id} has unknown section "${row.section}" — the row is unreadable by this build`,
    );
  }
  const metadata = guideMetadataSchema.safeParse(row.metadata);
  if (!metadata.success) {
    throw new Error(
      `cms_page ${row.id} (${row.section}/${row.slug}) has invalid metadata: ${metadata.error.issues
        .map((i) => `${i.path.join(".") || "<root>"} ${i.message}`)
        .join("; ")}`,
    );
  }

  return {
    id: row.id,
    section: row.section,
    slug: row.slug,
    status: row.status,
    title: row.title,
    titleTag: row.titleTag,
    description: row.description,
    summary: row.summary,
    cta: row.cta,
    canonicalSlug: row.canonicalSlug,
    metadata: metadata.data as ContentMetadata,
    publishedAt: row.publishedAt ? iso(row.publishedAt) : null,
    contentUpdatedAt: iso(row.contentUpdatedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    lockVersion: row.lockVersion,
  };
}

/** The same, plus the body. */
export function rowToDocument(row: CmsPageRow): ContentDocument {
  return { ...rowToSummary(row), body: row.bodyMdx };
}

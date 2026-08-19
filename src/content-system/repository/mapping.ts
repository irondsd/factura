import type { cmsPages } from "@/db/schema";
import { guideMetadataSchema } from "../metadata/guias";
import { sectionMetadataSchema } from "../metadata/sections";
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

/** Timestamps cross this boundary as ISO strings, not `Date`s, so every
 * consumer downstream — the renderer, the validator and the MCP — sees one
 * representation and cannot format a `Date` in the server's local zone
 * by accident.
 *
 * The authored offset is not preserved, and cannot be: `timestamptz` stores an
 * instant, not a zone, so `2026-07-12T09:00:00-03:00` comes back as
 * `2026-07-12T12:00:00.000Z`. That is the same moment, which is what matters
 * here — the visible dateline is formatted explicitly in Buenos Aires time
 * (`formatContentDate`), and the JSON-LD carries the same instant, so the two
 * still agree, which is Google's actual requirement. */
const iso = (value: Date): string => value.toISOString();

/** Parse a row's metadata, or say why it could not be.
 *
 * The section itself is never forgiven, in either mode below: `section` decides
 * which schema, which URL and which renderer a row belongs to, and there is no
 * sensible stand-in for a value this build does not know. */
function readMetadata(
  row: CmsPageSummaryRow,
): { ok: true; data: ContentMetadata } | { ok: false; issues: string } {
  if (!isContentSection(row.section)) {
    throw new Error(
      `cms_page ${row.id} has unknown section "${row.section}" — the row is unreadable by this build`,
    );
  }
  const parsed = (
    row.section === "guias" ? guideMetadataSchema : sectionMetadataSchema
  ).safeParse(row.metadata);
  return parsed.success
    ? { ok: true, data: parsed.data as ContentMetadata }
    : {
        ok: false,
        issues: parsed.error.issues
          .map((i) => `${i.path.join(".") || "<root>"} ${i.message}`)
          .join("; "),
      };
}

/** Parse a projected row into a summary, or throw.
 *
 * Throwing is deliberate for a *public* read: a row whose `metadata` does not
 * match the schema is data corruption, not user error, and rendering half a
 * page to a reader is worse than a loud failure.
 *
 * The CMS reads through `cmsRowToSummary` below instead, and the difference
 * matters — see the note there. */
export function rowToSummary(row: CmsPageSummaryRow): ContentSummary {
  const metadata = readMetadata(row);
  if (!metadata.ok) {
    throw new Error(
      `cms_page ${row.id} (${row.section}/${row.slug}) has invalid metadata: ${metadata.issues}`,
    );
  }
  return { ...base(row), metadata: metadata.data };
}

/** The CMS's read of the same row: an unreadable one comes back with empty
 * metadata and a `metadataError` rather than throwing.
 *
 * Throwing here would take down the section list and the editor — the only two
 * screens from which a bad row could be found and repaired — so one row turns
 * the whole console into something nobody can use without a SQL client. Every
 * write validates on the way in (`CmsContentService.checkedMetadata`), so
 * reaching this at all means a hand-edited row or a schema change without a
 * backfill: exactly the cases where an editor needs the page to still open.
 *
 * A separate function rather than a `mode` argument on the one above, because
 * every caller here reaches for `rows.map(rowToSummary)` and an optional second
 * parameter would quietly receive the array index. */
export function cmsRowToSummary(row: CmsPageSummaryRow): ContentSummary {
  const metadata = readMetadata(row);
  return metadata.ok
    ? { ...base(row), metadata: metadata.data }
    : {
        ...base(row),
        metadata: {} as ContentMetadata,
        metadataError: metadata.issues,
      };
}

/** Everything about a row that does not depend on its metadata parsing.
 * `readMetadata` has already refused an unknown section by the time this runs,
 * which is what makes the cast below safe. */
function base(row: CmsPageSummaryRow): Omit<ContentSummary, "metadata"> {
  return {
    id: row.id,
    section: row.section as ContentSummary["section"],
    slug: row.slug,
    status: row.status,
    title: row.title,
    titleTag: row.titleTag,
    description: row.description,
    summary: row.summary,
    cta: row.cta,
    canonicalSlug: row.canonicalSlug,
    parentId: row.parentId,
    sortOrder: row.sortOrder,
    crumb: row.crumb,
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

/** The CMS's read, plus the body. */
export function cmsRowToDocument(row: CmsPageRow): ContentDocument {
  return { ...cmsRowToSummary(row), body: row.bodyMdx };
}

import type { cmsPageRevisions, cmsPages } from "@/db/schema";
import { guideMetadataSchema } from "../metadata/guias";
import { sectionMetadataSchema } from "../metadata/sections";
import {
  type ContentDocument,
  type ContentMetadata,
  type ContentSummary,
  isContentSection,
} from "../types";

// The one translation between a `(cms_page, cms_page_revision)` pair and a
// `ContentDocument`. Every reader goes through it, so "what a row means" has a
// single definition and the JSONB column is parsed — not cast — exactly once.
//
// Two rows, one document (cms.md): the page carries identity and
// lifecycle — id, section, slug, status, when it first went public — and the
// revision carries everything that was authored. Which revision is the
// lifecycle's decision, made in `./revisionSelection` and applied by the
// repository; by the time anything here runs, that choice is settled.

export type CmsPageRow = typeof cmsPages.$inferSelect;
export type CmsRevisionRow = typeof cmsPageRevisions.$inferSelect;

/** The page half of a document. Only the columns a document needs — the
 * pointers and the legacy authored columns are not among them. */
export type PageIdentity = Pick<
  CmsPageRow,
  | "id"
  | "section"
  | "slug"
  | "status"
  | "publishedAt"
  | "createdAt"
  | "createdBy"
  | "lockVersion"
>;

/** A revision read with the body projected away — what every listing query
 * returns. Derived from the full row type so a new column cannot be added to
 * one shape and forgotten in the other. */
export type RevisionSummaryRow = Omit<CmsRevisionRow, "bodyMdx">;

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

/** Parse a revision's metadata, or say why it could not be.
 *
 * The section itself is never forgiven, in either mode below: `section` decides
 * which schema, which URL and which renderer a row belongs to, and there is no
 * sensible stand-in for a value this build does not know. */
function readMetadata(
  page: PageIdentity,
  revision: RevisionSummaryRow,
): { ok: true; data: ContentMetadata } | { ok: false; issues: string } {
  if (!isContentSection(page.section)) {
    throw new Error(
      `cms_page ${page.id} has unknown section "${page.section}" — the row is unreadable by this build`,
    );
  }
  const parsed = (
    page.section === "guias" || page.section === "noticias"
      ? guideMetadataSchema
      : sectionMetadataSchema
  ).safeParse(revision.metadata);
  return parsed.success
    ? { ok: true, data: parsed.data as ContentMetadata }
    : {
        ok: false,
        issues: parsed.error.issues
          .map((i) => `${i.path.join(".") || "<root>"} ${i.message}`)
          .join("; "),
      };
}

/** Parse a page and its selected revision into a summary, or throw.
 *
 * Throwing is deliberate for a *public* read: a revision whose `metadata` does
 * not match the schema is data corruption, not user error, and rendering half a
 * page to a reader is worse than a loud failure.
 *
 * The CMS reads through `cmsRowToSummary` below instead, and the difference
 * matters — see the note there. */
export function rowToSummary(
  page: PageIdentity,
  revision: RevisionSummaryRow,
): ContentSummary {
  const metadata = readMetadata(page, revision);
  if (!metadata.ok) {
    throw new Error(
      `cms_page_revision ${revision.id} (${page.section}/${page.slug}) has invalid metadata: ${metadata.issues}`,
    );
  }
  return { ...base(page, revision), metadata: metadata.data };
}

/** The CMS's read of the same pair: an unreadable one comes back with empty
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
 * every caller here reaches for `rows.map(rowToSummary)` and an optional extra
 * parameter would quietly receive the array index. */
export function cmsRowToSummary(
  page: PageIdentity,
  revision: RevisionSummaryRow,
): ContentSummary {
  const metadata = readMetadata(page, revision);
  return metadata.ok
    ? { ...base(page, revision), metadata: metadata.data }
    : {
        ...base(page, revision),
        metadata: {} as ContentMetadata,
        metadataError: metadata.issues,
      };
}

/** Everything about the pair that does not depend on its metadata parsing.
 * `readMetadata` has already refused an unknown section by the time this runs,
 * which is what makes the cast below safe. */
function base(
  page: PageIdentity,
  revision: RevisionSummaryRow,
): Omit<ContentSummary, "metadata"> {
  return {
    id: page.id,
    section: page.section as ContentSummary["section"],
    slug: page.slug,
    status: page.status,
    title: revision.title,
    titleTag: revision.titleTag,
    description: revision.description,
    summary: revision.summary,
    cta: revision.cta,
    canonicalSlug: revision.canonicalSlug,
    parentId: revision.parentId,
    sortOrder: revision.sortOrder,
    crumb: revision.crumb,
    // The page's first publication, not the revision's: an unpublish and a
    // republish must not move the visible dateline (cms.md).
    publishedAt: page.publishedAt ? iso(page.publishedAt) : null,
    contentUpdatedAt: iso(revision.contentUpdatedAt),
    // Creation belongs to the page — a document created in March and last
    // published in July was not created in July. The last write, though, is the
    // revision's: it is the copy being looked at.
    createdAt: iso(page.createdAt),
    updatedAt: iso(revision.updatedAt),
    createdBy: page.createdBy,
    updatedBy: revision.updatedBy,
    lockVersion: page.lockVersion,
  };
}

/** The same, plus the body. */
export function rowToDocument(
  page: PageIdentity,
  revision: CmsRevisionRow,
): ContentDocument {
  return { ...rowToSummary(page, revision), body: revision.bodyMdx };
}

/** The CMS's read, plus the body. */
export function cmsRowToDocument(
  page: PageIdentity,
  revision: CmsRevisionRow,
): ContentDocument {
  return { ...cmsRowToSummary(page, revision), body: revision.bodyMdx };
}

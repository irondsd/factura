import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db as defaultDb, type Database } from "@/db";
import { cmsPageRevisions } from "@/db/schema";
import { isRevisionKind, type RevisionKind } from "../revisions";

// The only module that writes `cms_page_revision`.
//
// Same bargain as `./store`: dumb SQL under a service that decides whether a
// write happens at all. Nothing here knows what a publication *means* — it
// inserts rows, updates the one mutable kind, and deletes the ids it is given.
// Retention, validation, the 24-hour window and every pointer decision live in
// `./contentService`, which is what the browser and the MCP both call.
//
// The one piece of policy that *is* here is `nextPublicationNumber`: it has to
// read the current maximum inside the same transaction as the insert, or two
// publications racing would both claim the same number and the unique index
// would fail the second one after it had already done its work.

/** The authored half of a document — everything a revision stores. */
export type AuthoredDocument = {
  body: string;
  title: string;
  titleTag: string | null;
  description: string;
  summary: string;
  cta: string;
  canonicalSlug: string | null;
  metadata: unknown;
  parentId: string | null;
  sortOrder: number;
  crumb: string | null;
  contentUpdatedAt: Date;
};

export type RevisionRecord = AuthoredDocument & {
  id: string;
  pageId: string;
  kind: RevisionKind;
  basedOnRevisionId: string | null;
  publicationNumber: number | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
};

export type RevisionInsert = {
  pageId: string;
  kind: RevisionKind;
  document: AuthoredDocument;
  basedOnRevisionId?: string | null;
  publicationNumber?: number | null;
  publishedAt?: Date | null;
  actorId: string | null;
  now: Date;
  /** Preserve the original author when copying a revision — a checkpoint of
   * somebody else's WIP was not written by whoever triggered the copy. */
  createdBy?: string | null;
};

type Row = typeof cmsPageRevisions.$inferSelect;

export class CmsRevisionStore {
  constructor(private readonly db: Database = defaultDb) {}

  /** A store bound to a transaction. Revision writes never stand alone: they
   * land with the pointer move and the media usage they imply, or not at all. */
  bind(tx: Database): CmsRevisionStore {
    return new CmsRevisionStore(tx);
  }

  async byId(id: string): Promise<RevisionRecord | null> {
    const row = await this.db.query.cmsPageRevisions.findFirst({
      where: eq(cmsPageRevisions.id, id),
    });
    return row ? toRecord(row) : null;
  }

  async byIds(ids: readonly string[]): Promise<RevisionRecord[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.query.cmsPageRevisions.findMany({
      where: inArray(cmsPageRevisions.id, [...ids]),
    });
    return rows.map(toRecord);
  }

  /** Every revision a page holds — at most seven rows: one WIP, one
   * checkpoint, one preview and four publications. Bodies included, because
   * the only caller is the editor's own history and comparison. */
  async listForPage(pageId: string): Promise<RevisionRecord[]> {
    const rows = await this.db.query.cmsPageRevisions.findMany({
      where: eq(cmsPageRevisions.pageId, pageId),
      orderBy: [
        desc(cmsPageRevisions.publicationNumber),
        desc(cmsPageRevisions.updatedAt),
      ],
    });
    return rows.map(toRecord);
  }

  /** This page's publications, newest first. The retention sweep's input. */
  async publications(pageId: string): Promise<RevisionRecord[]> {
    const rows = await this.db.query.cmsPageRevisions.findMany({
      where: and(
        eq(cmsPageRevisions.pageId, pageId),
        eq(cmsPageRevisions.kind, "published"),
      ),
      orderBy: [desc(cmsPageRevisions.publicationNumber)],
    });
    return rows.map(toRecord);
  }

  /** The next publication number for a page, read inside the caller's
   * transaction. `coalesce(max, 0) + 1`, so the first publication is 1. */
  async nextPublicationNumber(pageId: string): Promise<number> {
    const [row] = await this.db
      .select({
        next: sql<number>`coalesce(max(${cmsPageRevisions.publicationNumber}), 0) + 1`,
      })
      .from(cmsPageRevisions)
      .where(
        and(
          eq(cmsPageRevisions.pageId, pageId),
          isNotNull(cmsPageRevisions.publicationNumber),
        ),
      );
    return Number(row?.next ?? 1);
  }

  async insert(input: RevisionInsert): Promise<RevisionRecord> {
    const [row] = await this.db
      .insert(cmsPageRevisions)
      .values({
        pageId: input.pageId,
        kind: input.kind,
        basedOnRevisionId: input.basedOnRevisionId ?? null,
        publicationNumber: input.publicationNumber ?? null,
        bodyMdx: input.document.body,
        title: input.document.title,
        titleTag: input.document.titleTag,
        description: input.document.description,
        summary: input.document.summary,
        cta: input.document.cta,
        canonicalSlug: input.document.canonicalSlug,
        metadata: input.document.metadata,
        parentId: input.document.parentId,
        sortOrder: input.document.sortOrder,
        crumb: input.document.crumb,
        contentUpdatedAt: input.document.contentUpdatedAt,
        createdBy: input.createdBy ?? input.actorId,
        updatedBy: input.actorId,
        createdAt: input.now,
        updatedAt: input.now,
        publishedAt: input.publishedAt ?? null,
      })
      .returning();
    return toRecord(row);
  }

  /** Update the working copy in place. The only in-place update in this table,
   * and the `kind = 'wip'` predicate is what keeps it that way: handed an
   * immutable revision's id by mistake, this changes nothing and returns null
   * rather than quietly rewriting a publication. */
  async updateWip(input: {
    id: string;
    document: AuthoredDocument;
    basedOnRevisionId?: string | null;
    actorId: string | null;
    now: Date;
  }): Promise<RevisionRecord | null> {
    const [row] = await this.db
      .update(cmsPageRevisions)
      .set({
        bodyMdx: input.document.body,
        title: input.document.title,
        titleTag: input.document.titleTag,
        description: input.document.description,
        summary: input.document.summary,
        cta: input.document.cta,
        canonicalSlug: input.document.canonicalSlug,
        metadata: input.document.metadata,
        parentId: input.document.parentId,
        sortOrder: input.document.sortOrder,
        crumb: input.document.crumb,
        contentUpdatedAt: input.document.contentUpdatedAt,
        ...(input.basedOnRevisionId !== undefined
          ? { basedOnRevisionId: input.basedOnRevisionId }
          : {}),
        updatedBy: input.actorId,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(cmsPageRevisions.id, input.id),
          eq(cmsPageRevisions.kind, "wip"),
        ),
      )
      .returning();
    return row ? toRecord(row) : null;
  }

  /** Delete revisions by id. The caller has already moved or cleared every
   * pointer at them — the foreign keys are `restrict`, so a caller that has
   * not gets an error rather than a page with no body. */
  async deleteMany(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .delete(cmsPageRevisions)
      .where(inArray(cmsPageRevisions.id, [...ids]));
  }

  /** Every revision of a set of pages, ordered by page then publication.
   * Used by the migration's verification pass and by the media reconciler,
   * which has to derive usage from *every* retained revision rather than from
   * whatever a page currently shows. */
  async allRevisions(): Promise<RevisionRecord[]> {
    const rows = await this.db.query.cmsPageRevisions.findMany({
      orderBy: [asc(cmsPageRevisions.pageId), asc(cmsPageRevisions.createdAt)],
    });
    return rows.map(toRecord);
  }
}

/** A row, with `kind` narrowed. An unknown kind is a row from a newer deploy;
 * refusing to read it would take the editor down, so it is reported as a
 * checkpoint — the one kind that is neither public nor editable. */
function toRecord(row: Row): RevisionRecord {
  return {
    id: row.id,
    pageId: row.pageId,
    kind: isRevisionKind(row.kind) ? row.kind : "checkpoint",
    basedOnRevisionId: row.basedOnRevisionId,
    publicationNumber: row.publicationNumber,
    body: row.bodyMdx,
    title: row.title,
    titleTag: row.titleTag,
    description: row.description,
    summary: row.summary,
    cta: row.cta,
    canonicalSlug: row.canonicalSlug,
    metadata: row.metadata,
    parentId: row.parentId,
    sortOrder: row.sortOrder,
    crumb: row.crumb,
    contentUpdatedAt: row.contentUpdatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
  };
}

/** The authored half of a `ContentDocument`, ready to store. One conversion,
 * so a new authored field cannot be added to the document and silently dropped
 * on the way into a revision. */
export function authoredFrom(
  document: {
    body: string;
    title: string;
    titleTag: string | null;
    description: string;
    summary: string;
    cta: string;
    canonicalSlug: string | null;
    metadata: unknown;
    parentId: string | null;
    sortOrder: number;
    crumb: string | null;
  },
  contentUpdatedAt: Date,
): AuthoredDocument {
  return {
    body: document.body,
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
    contentUpdatedAt,
  };
}

/** A revision as the thing a copy is made from. */
export const authoredOf = (revision: RevisionRecord): AuthoredDocument =>
  authoredFrom(revision, revision.contentUpdatedAt);

export const cmsRevisionStore = new CmsRevisionStore();

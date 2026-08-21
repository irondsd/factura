import "server-only";
import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db as defaultDb, type Database } from "@/db";
import { cmsPageRevisions, cmsPages } from "@/db/schema";
import {
  cmsRowToDocument,
  cmsRowToSummary,
  type CmsRevisionRow,
  type PageIdentity,
} from "@/content-system/repository/mapping";
import type {
  ContentDocument,
  ContentSection,
  ContentStatus,
  ContentSummary,
} from "@/content-system/types";

// The authenticated half of `cms_page` access: every state, every column, and
// the only writer. Together with
// `src/content-system/repository/postgres.ts` this is the complete set of
// modules allowed to query the table (enforced by
// `src/cms/boundaries.test.ts`).
//
// Deliberately dumb. No authorization, no validation, no lifecycle: those live
// in `./contentService`, which is what the browser and the MCP both call. This
// module's one non-obvious job is the optimistic-concurrency UPDATE, which has
// to be a single statement to be correct at all.
//
// Since revisions (cms.md §14) the page row holds no prose. Reads here join the
// revision the CMS pointer selects — the working copy if there is one, else the
// last publication, else the public preview — so `findById` still answers with
// a whole `ContentDocument` and every caller above is unchanged.

export type CmsListFilter = {
  section?: ContentSection;
  statuses?: ContentStatus[];
  /** Substring match on title or slug, case-insensitive. */
  search?: string;
};

/** The page row itself: identity, lifecycle and the four revision pointers.
 * What the service reasons about before it decides which revision to touch. */
export type CmsPageRecord = PageIdentity & {
  updatedAt: Date;
  updatedBy: string | null;
  publishedRevisionId: string | null;
  previewRevisionId: string | null;
  wipRevisionId: string | null;
  checkpointRevisionId: string | null;
};

export type CmsPageInsert = {
  section: ContentSection;
  slug: string;
  status: ContentStatus;
  actorId: string;
  now: Date;
};

export type CmsPageUpdate = {
  id: string;
  expectedLockVersion: number;
  actorId: string;
  now: Date;
  /** Only the fields being changed. Absent means "leave it alone".
   *
   * Every field here belongs to the page rather than to a document: lifecycle,
   * the first-publication date, and the four pointers. Authored prose is never
   * in this patch, because it is never on this row. */
  patch: {
    status?: ContentStatus;
    publishedAt?: Date | null;
    publishedRevisionId?: string | null;
    previewRevisionId?: string | null;
    wipRevisionId?: string | null;
    checkpointRevisionId?: string | null;
  };
};

/** The page columns a record needs. */
const PAGE_COLUMNS = {
  id: cmsPages.id,
  section: cmsPages.section,
  slug: cmsPages.slug,
  status: cmsPages.status,
  publishedAt: cmsPages.publishedAt,
  createdAt: cmsPages.createdAt,
  createdBy: cmsPages.createdBy,
  updatedAt: cmsPages.updatedAt,
  updatedBy: cmsPages.updatedBy,
  lockVersion: cmsPages.lockVersion,
  publishedRevisionId: cmsPages.publishedRevisionId,
  previewRevisionId: cmsPages.previewRevisionId,
  wipRevisionId: cmsPages.wipRevisionId,
  checkpointRevisionId: cmsPages.checkpointRevisionId,
} as const;

/** The revision columns a summary needs — everything but the body. Loading 43
 * MDX bodies to render a list of links is the cost this projection exists to
 * avoid. */
const REVISION_SUMMARY_COLUMNS = {
  id: cmsPageRevisions.id,
  pageId: cmsPageRevisions.pageId,
  kind: cmsPageRevisions.kind,
  basedOnRevisionId: cmsPageRevisions.basedOnRevisionId,
  publicationNumber: cmsPageRevisions.publicationNumber,
  title: cmsPageRevisions.title,
  titleTag: cmsPageRevisions.titleTag,
  description: cmsPageRevisions.description,
  summary: cmsPageRevisions.summary,
  cta: cmsPageRevisions.cta,
  canonicalSlug: cmsPageRevisions.canonicalSlug,
  metadata: cmsPageRevisions.metadata,
  parentId: cmsPageRevisions.parentId,
  sortOrder: cmsPageRevisions.sortOrder,
  crumb: cmsPageRevisions.crumb,
  contentUpdatedAt: cmsPageRevisions.contentUpdatedAt,
  createdBy: cmsPageRevisions.createdBy,
  updatedBy: cmsPageRevisions.updatedBy,
  createdAt: cmsPageRevisions.createdAt,
  updatedAt: cmsPageRevisions.updatedAt,
  publishedAt: cmsPageRevisions.publishedAt,
} as const;

const REVISION_COLUMNS = {
  ...REVISION_SUMMARY_COLUMNS,
  bodyMdx: cmsPageRevisions.bodyMdx,
} as const;

/** The revision a CMS read follows, as SQL.
 *
 * The same rule as `cmsPointer()` in
 * `src/content-system/repository/revisionSelection.ts`, expressed once here
 * because a join cannot call a TypeScript function. The unit test in
 * `revisionSelection.test.ts` pins the rule; the integration test pins that
 * this join agrees with it. */
const CMS_REVISION_ID = sql`coalesce(${cmsPages.wipRevisionId}, ${cmsPages.publishedRevisionId}, ${cmsPages.previewRevisionId})`;

export class CmsPageStore {
  constructor(private readonly db: Database = defaultDb) {}

  /** Run `body` inside one transaction, with a store bound to it.
   *
   * Everything a content operation touches — the page row, its revisions, the
   * pointers between them and the media usage they imply — has to land
   * together or not at all. A committed save whose usage rows were lost would
   * leave an image looking unused while a live page points at it, and a
   * committed publication whose pointer move was lost would leave the page
   * serving the version it just replaced. */
  async transaction<T>(
    body: (store: CmsPageStore, tx: Database) => Promise<T>,
  ): Promise<T> {
    return (this.db as typeof defaultDb).transaction((tx) =>
      body(new CmsPageStore(tx), tx),
    );
  }

  /** The page row alone — no join, no document. What the service reads before
   * every mutation, because the decision it is about to make is about pointers
   * and lifecycle rather than prose. */
  async findPage(id: string): Promise<CmsPageRecord | null> {
    const [row] = await this.db
      .select(PAGE_COLUMNS)
      .from(cmsPages)
      .where(eq(cmsPages.id, id))
      .limit(1);
    return row ?? null;
  }

  async findPageBySlug(
    section: ContentSection,
    slug: string,
  ): Promise<CmsPageRecord | null> {
    const [row] = await this.db
      .select(PAGE_COLUMNS)
      .from(cmsPages)
      .where(and(eq(cmsPages.section, section), eq(cmsPages.slug, slug)))
      .limit(1);
    return row ?? null;
  }

  /** The document the CMS shows for a page: its working copy, or the baseline
   * an editor would start from. */
  async findById(id: string): Promise<ContentDocument | null> {
    const [row] = await this.db
      .select({ page: PAGE_COLUMNS, revision: REVISION_COLUMNS })
      .from(cmsPages)
      .innerJoin(cmsPageRevisions, eq(cmsPageRevisions.id, CMS_REVISION_ID))
      .where(eq(cmsPages.id, id))
      .limit(1);
    return row
      ? cmsRowToDocument(row.page, row.revision as CmsRevisionRow)
      : null;
  }

  async findBySlug(
    section: ContentSection,
    slug: string,
  ): Promise<ContentDocument | null> {
    const [row] = await this.db
      .select({ page: PAGE_COLUMNS, revision: REVISION_COLUMNS })
      .from(cmsPages)
      .innerJoin(cmsPageRevisions, eq(cmsPageRevisions.id, CMS_REVISION_ID))
      .where(and(eq(cmsPages.section, section), eq(cmsPages.slug, slug)))
      .limit(1);
    return row
      ? cmsRowToDocument(row.page, row.revision as CmsRevisionRow)
      : null;
  }

  /** One page's document at one *named* revision, for history previews and
   * comparisons. Refuses a revision belonging to another page — the pointer
   * invariants are the service's job, but "show me revision X of page Y" is a
   * question a URL can carry, and it must not become a way to read a different
   * page's draft. */
  async findAtRevision(
    pageId: string,
    revisionId: string,
  ): Promise<ContentDocument | null> {
    const [row] = await this.db
      .select({ page: PAGE_COLUMNS, revision: REVISION_COLUMNS })
      .from(cmsPages)
      .innerJoin(cmsPageRevisions, eq(cmsPageRevisions.pageId, cmsPages.id))
      .where(and(eq(cmsPages.id, pageId), eq(cmsPageRevisions.id, revisionId)))
      .limit(1);
    return row
      ? cmsRowToDocument(row.page, row.revision as CmsRevisionRow)
      : null;
  }

  /** The CMS list. Every status, in editorial order. */
  async list(filter: CmsListFilter = {}): Promise<ContentSummary[]> {
    const conditions = [
      filter.section ? eq(cmsPages.section, filter.section) : undefined,
      filter.statuses?.length
        ? inArray(cmsPages.status, filter.statuses)
        : undefined,
      filter.search
        ? or(
            // `%` and `_` in the box are literal characters to a person typing
            // a title, so escape them rather than letting a stray underscore
            // silently widen the match.
            ilike(cmsPageRevisions.title, `%${escapeLike(filter.search)}%`),
            ilike(cmsPages.slug, `%${escapeLike(filter.search)}%`),
          )
        : undefined,
    ].filter((c) => c !== undefined);

    const rows = await this.db
      .select({ page: PAGE_COLUMNS, revision: REVISION_SUMMARY_COLUMNS })
      .from(cmsPages)
      .innerJoin(cmsPageRevisions, eq(cmsPageRevisions.id, CMS_REVISION_ID))
      .where(conditions.length ? and(...conditions) : undefined)
      // Editorial order, not "most recently touched": the CMS list renders the
      // page tree, and a tree that reshuffled as you edited would be unusable.
      // `buildContentTree` re-sorts anyway; this makes the query deterministic.
      .orderBy(asc(cmsPageRevisions.sortOrder), asc(cmsPages.slug));

    return rows.map((row) => cmsRowToSummary(row.page, row.revision));
  }

  /** Whole documents for a section, at the CMS-selected revision. The
   * collection validator's input: it has to see drafts, because "this
   * published page links to a draft" is exactly the finding it exists to
   * produce. */
  async documentsForSection(
    section: ContentSection,
  ): Promise<ContentDocument[]> {
    const rows = await this.db
      .select({ page: PAGE_COLUMNS, revision: REVISION_COLUMNS })
      .from(cmsPages)
      .innerJoin(cmsPageRevisions, eq(cmsPageRevisions.id, CMS_REVISION_ID))
      .where(eq(cmsPages.section, section))
      .orderBy(asc(cmsPages.slug));
    return rows.map((row) =>
      cmsRowToDocument(row.page, row.revision as CmsRevisionRow),
    );
  }

  /** The documents a *public* read would see, per page, for the section — the
   * live publication of every published page and the promoted snapshot of
   * every previewed one. What collection validation measures a publication
   * candidate against (cms.md §14.6). */
  async publicDocumentsForSection(
    section: ContentSection,
  ): Promise<ContentDocument[]> {
    const selected = sql`case ${cmsPages.status}
      when 'published' then ${cmsPages.publishedRevisionId}
      when 'preview' then ${cmsPages.previewRevisionId}
      else null end`;
    const rows = await this.db
      .select({ page: PAGE_COLUMNS, revision: REVISION_COLUMNS })
      .from(cmsPages)
      .innerJoin(cmsPageRevisions, eq(cmsPageRevisions.id, selected))
      .where(eq(cmsPages.section, section))
      .orderBy(asc(cmsPages.slug));
    return rows.map((row) =>
      cmsRowToDocument(row.page, row.revision as CmsRevisionRow),
    );
  }

  /** Insert the page row. Prose is not among its arguments: the caller inserts
   * the initial `wip` revision and points the page at it, in the same
   * transaction. */
  async insertPage(input: CmsPageInsert): Promise<CmsPageRecord> {
    const [row] = await this.db
      .insert(cmsPages)
      .values({
        section: input.section,
        slug: input.slug,
        status: input.status,
        lockVersion: 1,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        createdAt: input.now,
        updatedAt: input.now,
        publishedAt: null,
      })
      .returning(PAGE_COLUMNS);
    return row;
  }

  /** Apply an update if and only if the row is still at `expectedLockVersion`.
   *
   * One statement, and the version is in the WHERE clause rather than checked
   * in JavaScript first. A read-then-write would leave a window between the two
   * in which another save lands, which is exactly the race the version exists
   * to close. Zero rows updated means the version moved (or the page is gone);
   * the caller turns that into a conflict.
   *
   * `lock_version` is incremented in SQL from the column's own value, so it
   * cannot be advanced past a save this transaction never saw. Every accepted
   * mutation bumps it — including a WIP save, which touches no column on this
   * row at all (cms.md §14.3): the page lock is the CMS's single concurrency
   * token, and a save that did not move it would let a second editor hold a
   * version that is no longer current. */
  async updateWithLock(input: CmsPageUpdate): Promise<CmsPageRecord | null> {
    const { patch } = input;
    const [row] = await this.db
      .update(cmsPages)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.publishedAt !== undefined
          ? { publishedAt: patch.publishedAt }
          : {}),
        ...(patch.publishedRevisionId !== undefined
          ? { publishedRevisionId: patch.publishedRevisionId }
          : {}),
        ...(patch.previewRevisionId !== undefined
          ? { previewRevisionId: patch.previewRevisionId }
          : {}),
        ...(patch.wipRevisionId !== undefined
          ? { wipRevisionId: patch.wipRevisionId }
          : {}),
        ...(patch.checkpointRevisionId !== undefined
          ? { checkpointRevisionId: patch.checkpointRevisionId }
          : {}),
        lockVersion: sql`${cmsPages.lockVersion} + 1`,
        updatedBy: input.actorId,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(cmsPages.id, input.id),
          eq(cmsPages.lockVersion, input.expectedLockVersion),
        ),
      )
      .returning(PAGE_COLUMNS);
    return row ?? null;
  }

  /** Move pointers without touching the lock.
   *
   * Only ever called *after* `updateWithLock` has matched in the same
   * transaction, which is what makes it safe: that UPDATE took a row-level
   * exclusive lock held until commit, so nothing else can be writing this row
   * while the revisions it will point at are being inserted.
   *
   * It exists because a pointer cannot be set to a revision that does not exist
   * yet, and a revision cannot be inserted while the pointer to the one it
   * replaces is still `restrict`-ing it. Clear in the claim, insert, then point
   * here — one lock bump per operation, not three. */
  async setPointers(input: {
    id: string;
    patch: {
      publishedRevisionId?: string | null;
      previewRevisionId?: string | null;
      wipRevisionId?: string | null;
      checkpointRevisionId?: string | null;
    };
  }): Promise<void> {
    if (Object.keys(input.patch).length === 0) return;
    await this.db
      .update(cmsPages)
      .set(input.patch)
      .where(eq(cmsPages.id, input.id));
  }

  /** Remove a row whose pointers the caller has already cleared, inside a
   * transaction that has already claimed it. The revisions, their media usage
   * and the page's activity rows go with it through the cascades. */
  async deleteById(id: string): Promise<void> {
    await this.db.delete(cmsPages).where(eq(cmsPages.id, id));
  }

  /** The current version of a page, for reporting a conflict accurately. Null
   * when the page does not exist at all. */
  async lockVersionOf(id: string): Promise<number | null> {
    const [row] = await this.db
      .select({ lockVersion: cmsPages.lockVersion })
      .from(cmsPages)
      .where(eq(cmsPages.id, id))
      .limit(1);
    return row?.lockVersion ?? null;
  }

  /** Distinct pages holding any revision that names `pageId` as its parent.
   *
   * The question `cms_page_revision.parent_id`'s `restrict` foreign key asks,
   * asked where the answer can still name the pages — a raw constraint
   * violation tells an editor nothing they can act on. Historical revisions
   * count: they are what the constraint counts. */
  async pagesWithParent(
    pageId: string,
  ): Promise<{ id: string; slug: string }[]> {
    const rows = await this.db
      .selectDistinct({ id: cmsPages.id, slug: cmsPages.slug })
      .from(cmsPageRevisions)
      .innerJoin(cmsPages, eq(cmsPages.id, cmsPageRevisions.pageId))
      .where(eq(cmsPageRevisions.parentId, pageId));
    return rows.filter((row) => row.id !== pageId);
  }

  /** The pages a revision id set belongs to, for the media library's "which
   * page is this image on" join. Read-only, and it never leaves this store. */
  async pagesForRevisions(
    revisionIds: readonly string[],
  ): Promise<Map<string, CmsPageRecord>> {
    if (revisionIds.length === 0) return new Map();
    const rows = await this.db
      .select({ revisionId: cmsPageRevisions.id, page: PAGE_COLUMNS })
      .from(cmsPageRevisions)
      .innerJoin(cmsPages, eq(cmsPages.id, cmsPageRevisions.pageId))
      .where(inArray(cmsPageRevisions.id, [...revisionIds]));
    return new Map(rows.map((row) => [row.revisionId, row.page]));
  }
}

/** Escape the wildcards `ILIKE` gives meaning to, so a search box matches what
 * was typed. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export const cmsPageStore = new CmsPageStore();

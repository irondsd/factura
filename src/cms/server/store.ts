import "server-only";
import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db as defaultDb, type Database } from "@/db";
import { cmsPages } from "@/db/schema";
import {
  cmsRowToDocument,
  cmsRowToSummary,
  rowToDocument,
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

export type CmsListFilter = {
  section?: ContentSection;
  statuses?: ContentStatus[];
  /** Substring match on title or slug, case-insensitive. */
  search?: string;
};

export type CmsPageInsert = {
  section: ContentSection;
  slug: string;
  status: ContentStatus;
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
  actorId: string;
  now: Date;
};

export type CmsPageUpdate = {
  id: string;
  expectedLockVersion: number;
  actorId: string;
  now: Date;
  /** Only the fields being changed. Absent means "leave it alone" — which is
   * why a status-only transition does not touch `content_updated_at`. */
  patch: {
    status?: ContentStatus;
    body?: string;
    title?: string;
    titleTag?: string | null;
    description?: string;
    summary?: string;
    cta?: string;
    canonicalSlug?: string | null;
    metadata?: unknown;
    parentId?: string | null;
    sortOrder?: number;
    crumb?: string | null;
    publishedAt?: Date | null;
    contentUpdatedAt?: Date;
  };
};

export class CmsPageStore {
  constructor(private readonly db: Database = defaultDb) {}

  async findById(id: string): Promise<ContentDocument | null> {
    const row = await this.db.query.cmsPages.findFirst({
      where: eq(cmsPages.id, id),
    });
    return row ? cmsRowToDocument(row) : null;
  }

  async findBySlug(
    section: ContentSection,
    slug: string,
  ): Promise<ContentDocument | null> {
    const row = await this.db.query.cmsPages.findFirst({
      where: and(eq(cmsPages.section, section), eq(cmsPages.slug, slug)),
    });
    return row ? cmsRowToDocument(row) : null;
  }

  /** The CMS list. Every status, newest edit first — an editor's list is
   * ordered by what they were last working on, not by publication date. */
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
            ilike(cmsPages.title, `%${escapeLike(filter.search)}%`),
            ilike(cmsPages.slug, `%${escapeLike(filter.search)}%`),
          )
        : undefined,
    ].filter((c) => c !== undefined);

    const rows = await this.db.query.cmsPages.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      columns: { bodyMdx: false },
      // Editorial order, not "most recently touched": the CMS list renders the
      // page tree, and a tree that reshuffled as you edited would be unusable.
      // `buildContentTree` re-sorts anyway; this makes the query deterministic.
      orderBy: [asc(cmsPages.sortOrder), asc(cmsPages.slug)],
    });
    return rows.map(cmsRowToSummary);
  }

  async insert(input: CmsPageInsert): Promise<ContentDocument> {
    const [row] = await this.db
      .insert(cmsPages)
      .values({
        section: input.section,
        slug: input.slug,
        status: input.status,
        bodyMdx: input.body,
        title: input.title,
        titleTag: input.titleTag,
        description: input.description,
        summary: input.summary,
        cta: input.cta,
        canonicalSlug: input.canonicalSlug,
        metadata: input.metadata,
        parentId: input.parentId,
        sortOrder: input.sortOrder,
        crumb: input.crumb,
        lockVersion: 1,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        createdAt: input.now,
        updatedAt: input.now,
        publishedAt: input.status === "published" ? input.now : null,
        contentUpdatedAt: input.now,
      })
      .returning();
    // Strict on the way back out, unlike the reads above: the service parses
    // metadata before calling this, so a row that cannot be read here is a bug
    // in that check rather than pre-existing damage, and should say so loudly.
    return rowToDocument(row);
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
   * cannot be advanced past a save this transaction never saw. */
  async updateWithLock(input: CmsPageUpdate): Promise<ContentDocument | null> {
    const { patch } = input;
    const [row] = await this.db
      .update(cmsPages)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.body !== undefined ? { bodyMdx: patch.body } : {}),
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.titleTag !== undefined ? { titleTag: patch.titleTag } : {}),
        ...(patch.description !== undefined
          ? { description: patch.description }
          : {}),
        ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
        ...(patch.cta !== undefined ? { cta: patch.cta } : {}),
        ...(patch.canonicalSlug !== undefined
          ? { canonicalSlug: patch.canonicalSlug }
          : {}),
        ...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
        ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}),
        ...(patch.sortOrder !== undefined
          ? { sortOrder: patch.sortOrder }
          : {}),
        ...(patch.crumb !== undefined ? { crumb: patch.crumb } : {}),
        ...(patch.publishedAt !== undefined
          ? { publishedAt: patch.publishedAt }
          : {}),
        ...(patch.contentUpdatedAt !== undefined
          ? { contentUpdatedAt: patch.contentUpdatedAt }
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
      .returning();
    return row ? rowToDocument(row) : null;
  }

  /** The current version of a page, for reporting a conflict accurately. Null
   * when the page does not exist at all. */
  async lockVersionOf(id: string): Promise<number | null> {
    const row = await this.db.query.cmsPages.findFirst({
      where: eq(cmsPages.id, id),
      columns: { lockVersion: true },
    });
    return row?.lockVersion ?? null;
  }
}

/** Escape the wildcards `ILIKE` gives meaning to, so a search box matches what
 * was typed. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export const cmsPageStore = new CmsPageStore();

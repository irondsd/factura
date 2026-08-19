import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db as defaultDb, type Database } from "@/db";
import { cmsPages } from "@/db/schema";
import type { ContentDocument, ContentSection, ContentSummary } from "../types";
import { type ContentRepository, pathToSlug } from "./contract";
import { rowToDocument, rowToSummary } from "./mapping";
import { listableStatuses, renderableStatuses } from "./visibility";

// The public, PostgreSQL-backed content repository.
//
// This module and `src/cms/server/store.ts` are the only two places that query
// `cms_page` (enforced by `src/cms/boundaries.test.ts`). Every visibility
// decision below comes from `./visibility` rather than being written inline as
// a `where` clause, so the rules are testable on their own and there is exactly
// one definition of who may see what.
//
// Caching is deliberately *not* here. Section 3.3 puts the one-hour
// `unstable_cache` wrapper at the call site in Phase 7, where the tag and the
// `revalidate` value have to be statically analyzable; a repository that
// cached itself would also be a repository the CMS could not reuse for its
// uncached previews.

/** Columns a listing needs — everything but the body. Loading 43 MDX bodies to
 * render a list of links is the cost this projection exists to avoid. */
const SUMMARY_COLUMNS = { bodyMdx: false } as const;

export class PostgresContentRepository implements ContentRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async getByPath(
    section: ContentSection,
    slug: string[],
  ): Promise<ContentDocument | null> {
    const row = await this.db.query.cmsPages.findFirst({
      where: and(
        eq(cmsPages.section, section),
        eq(cmsPages.slug, pathToSlug(slug)),
        // A draft is indistinguishable from a missing page here, by design:
        // the caller gets null either way and cannot probe for unpublished
        // work by watching which slugs 404.
        inArray(cmsPages.status, [...renderableStatuses("public")]),
      ),
    });
    return row ? rowToDocument(row) : null;
  }

  async listPublished(section: ContentSection): Promise<ContentSummary[]> {
    return this.list(section, [...listableStatuses("public")]);
  }

  /** Whether this section has been migrated into the CMS at all — any row, in
   * any state.
   *
   * Not a content read, and deliberately not part of the `ContentRepository`
   * contract: it answers a question that only exists during the migration
   * window, namely whether the filesystem registry is still this section's
   * source of truth. It has to count every state, because "every page in the
   * section is currently a draft" is a real editorial answer and must not be
   * mistaken for "not migrated yet" — which would republish all of them from
   * disk. */
  async hasContent(section: ContentSection): Promise<boolean> {
    const row = await this.db.query.cmsPages.findFirst({
      where: eq(cmsPages.section, section),
      columns: { id: true },
    });
    return row !== undefined;
  }

  async listPubliclyRenderable(
    section: ContentSection,
  ): Promise<ContentSummary[]> {
    return this.list(section, [...renderableStatuses("public")]);
  }

  /** Newest first, by publication. `published_at` is null for a page that has
   * never been published, so the sort falls back to the editorial timestamp —
   * which is the only date a `preview` page has. */
  private async list(
    section: ContentSection,
    statuses: string[],
  ): Promise<ContentSummary[]> {
    const rows = await this.db.query.cmsPages.findMany({
      where: and(
        eq(cmsPages.section, section),
        inArray(
          cmsPages.status,
          statuses as (typeof cmsPages.status.enumValues)[number][],
        ),
      ),
      columns: SUMMARY_COLUMNS,
      // Editorial order first: an index that lists a hub's children in the
      // order their author chose is the whole point of `sort_order`, and it is
      // uniform across sections. Publication date breaks ties, which is what a
      // flat section like guides falls back to since every row shares
      // `sortOrder` 0.
      //
      // `coalesce` rather than a second date key: a page that has never been
      // published has no `published_at`, and the editorial timestamp is the
      // only date it has — but using that as a *tiebreak* between two published
      // pages made the order move whenever anyone edited one of them. Fifteen
      // guides share two publication instants, so that is not hypothetical: an
      // edit to one reshuffled the related-guides block on the others.
      //
      // Slug last, so the order is total and deterministic. It is also what the
      // filesystem registry did — it sorted on publication alone, and a stable
      // `Array.sort` left ties in `readdir` order, which is filename order,
      // which is slug order.
      orderBy: [
        asc(cmsPages.sortOrder),
        desc(
          sql`coalesce(${cmsPages.publishedAt}, ${cmsPages.contentUpdatedAt})`,
        ),
        asc(cmsPages.slug),
      ],
    });
    return rows.map(rowToSummary);
  }
}

/** The process-wide public repository. A single instance because it holds no
 * state beyond the database handle. */
export const postgresContentRepository = new PostgresContentRepository();

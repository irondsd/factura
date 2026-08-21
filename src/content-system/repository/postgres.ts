import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db as defaultDb, type Database } from "@/db";
import { cmsPageRevisions, cmsPages } from "@/db/schema";
import type { ContentDocument, ContentSection, ContentSummary } from "../types";
import { type ContentRepository, pathToSlug } from "./contract";
import { type CmsRevisionRow, rowToDocument, rowToSummary } from "./mapping";
import { listableStatuses, renderableStatuses } from "./visibility";

// The public, PostgreSQL-backed content repository.
//
// This module and `src/cms/server/store.ts` are the only two places that query
// `cms_page` (enforced by `src/cms/boundaries.test.ts`). Every visibility
// decision below comes from `./visibility` rather than being written inline as
// a `where` clause, and every *version* decision comes from
// `./revisionSelection`, so the rules are testable on their own and there is
// exactly one definition of who may see what — and which copy of it.
//
// The join below is the whole security property of revisions: a public read
// resolves `published_revision_id` or `preview_revision_id` and nothing else.
// The working copy is not reachable from here, so an editor saving a
// half-rewritten paragraph cannot put it in front of a reader by accident, and
// no amount of getting the status wrong changes that.
//
// Caching is deliberately *not* here. Section 3.3 puts the one-hour
// `unstable_cache` wrapper at the call site in Phase 7, where the tag and the
// `revalidate` value have to be statically analyzable; a repository that
// cached itself would also be a repository the CMS could not reuse for its
// uncached previews.

/** The page half of a public read. */
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

/** Columns a listing needs — everything but the body. Loading 43 MDX bodies to
 * render a list of links is the cost this projection exists to avoid. */
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

/** The revision a public read follows, as SQL — `publicPointer()` from
 * `./revisionSelection`, which a join cannot call.
 *
 * A `case` on status rather than a `coalesce` of the two pointers, and the
 * difference matters: `coalesce` would fall back to the preview snapshot of a
 * *published* page whose published pointer was somehow null, quietly serving an
 * unindexed draft copy at a live URL. This one returns null instead, and a null
 * drops the row from the inner join — the page 404s, loudly, which is the
 * failure mode to prefer. */
const PUBLIC_REVISION_ID = sql`case ${cmsPages.status}
  when 'published' then ${cmsPages.publishedRevisionId}
  when 'preview' then ${cmsPages.previewRevisionId}
  else null end`;

export class PostgresContentRepository implements ContentRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async getByPath(
    section: ContentSection,
    slug: string[],
  ): Promise<ContentDocument | null> {
    const [row] = await this.db
      .select({ page: PAGE_COLUMNS, revision: REVISION_COLUMNS })
      .from(cmsPages)
      .innerJoin(cmsPageRevisions, eq(cmsPageRevisions.id, PUBLIC_REVISION_ID))
      .where(
        and(
          eq(cmsPages.section, section),
          eq(cmsPages.slug, pathToSlug(slug)),
          // A draft is indistinguishable from a missing page here, by design:
          // the caller gets null either way and cannot probe for unpublished
          // work by watching which slugs 404. The join has already excluded it
          // — a draft resolves no pointer — and the predicate says so anyway,
          // because a reader should not have to derive it from a `case`.
          statusIn(renderableStatuses("public")),
        ),
      )
      .limit(1);
    return row ? rowToDocument(row.page, row.revision as CmsRevisionRow) : null;
  }

  async listPublished(section: ContentSection): Promise<ContentSummary[]> {
    return this.list(section, [...listableStatuses("public")]);
  }

  async listPubliclyRenderable(
    section: ContentSection,
  ): Promise<ContentSummary[]> {
    return this.list(section, [...renderableStatuses("public")]);
  }

  /** Newest first by the date readers see in each section's listing.
   *
   * Guides display their publication date; statistics and research display
   * their last-updated date because those pages are refreshed as their source
   * data changes. */
  private async list(
    section: ContentSection,
    statuses: string[],
  ): Promise<ContentSummary[]> {
    const rows = await this.db
      .select({ page: PAGE_COLUMNS, revision: REVISION_SUMMARY_COLUMNS })
      .from(cmsPages)
      .innerJoin(cmsPageRevisions, eq(cmsPageRevisions.id, PUBLIC_REVISION_ID))
      .where(and(eq(cmsPages.section, section), statusIn(statuses)))
      // `published_at` is null for a page that has never been published, so a
      // preview falls back to its editorial timestamp. Slug last makes ties
      // deterministic without reintroducing editorial ordering.
      .orderBy(
        desc(
          section === "guias" || section === "noticias"
            ? sql`coalesce(${cmsPages.publishedAt}, ${cmsPageRevisions.contentUpdatedAt})`
            : cmsPageRevisions.contentUpdatedAt,
        ),
        asc(cmsPages.slug),
      );
    return rows.map((row) => rowToSummary(row.page, row.revision));
  }
}

/** `status = any(…)`, written out rather than via `inArray` so the values keep
 * the enum's type without a cast at every call site. */
const statusIn = (statuses: readonly string[]) =>
  sql`${cmsPages.status} in (${sql.join(
    statuses.map((status) => sql`${status}`),
    sql`, `,
  )})`;

/** The process-wide public repository. A single instance because it holds no
 * state beyond the database handle. */
export const postgresContentRepository = new PostgresContentRepository();

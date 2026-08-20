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

  /** Newest first by the date readers see in each section's listing.
   *
   * Guides display their publication date; statistics and research display
   * their last-updated date because those pages are refreshed as their source
   * data changes. */
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
      // `published_at` is null for a page that has never been published, so a
      // preview falls back to its editorial timestamp. Slug last makes ties
      // deterministic without reintroducing editorial ordering.
      orderBy: [
        desc(
          section === "guias"
            ? sql`coalesce(${cmsPages.publishedAt}, ${cmsPages.contentUpdatedAt})`
            : cmsPages.contentUpdatedAt,
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

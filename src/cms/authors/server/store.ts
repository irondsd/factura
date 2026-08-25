import "server-only";
import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db as defaultDb, type Database } from "@/db";
import { cmsAuthors, cmsPageRevisions, cmsPages } from "@/db/schema";
import type { ContentAuthor } from "@/content-system/authors/types";
import { AUTHOR_ROLE_FIELDS } from "@/content-system/authors/types";
import type { ContentSection } from "@/content-system/types";

// SQL and nothing else, like every other CMS store: no policy, no validation,
// no cache invalidation. `service.ts` above it decides what may happen; this
// only knows how to say it to Postgres.

type AuthorRow = typeof cmsAuthors.$inferSelect;

const iso = (value: Date): string => value.toISOString();

const authorOf = (row: AuthorRow): ContentAuthor => ({
  ...row,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

export type AuthorUsage = {
  id: string;
  section: ContentSection;
  slug: string;
  title: string;
  /** Which credit this page gives them. A person can hold both on one page,
   * which is an editorial mistake the validator warns about — so both are
   * reported rather than the first one found. */
  roles: ("author" | "factChecker")[];
};

/** Pages whose currently-reachable copies name an author.
 *
 * "Currently reachable" is the working copy, the publication and the public
 * preview — the same three pointers the category usage query walks, and for the
 * same reason: a superseded publication may still name someone, and that is
 * history rather than something an editor can act on. */
const CURRENT_REVISION_POINTERS = (pages: typeof cmsPages) =>
  or(
    eq(cmsPageRevisions.id, pages.wipRevisionId),
    eq(cmsPageRevisions.id, pages.publishedRevisionId),
    eq(cmsPageRevisions.id, pages.previewRevisionId),
  );

export class CmsAuthorStore {
  constructor(private readonly database: Database = defaultDb) {}

  bind(database: Database): CmsAuthorStore {
    return new CmsAuthorStore(database);
  }

  transaction<T>(body: (store: CmsAuthorStore) => Promise<T>): Promise<T> {
    return (this.database as typeof defaultDb).transaction((tx) =>
      body(this.bind(tx)),
    );
  }

  /** Every author, by name. There is no `sortOrder` column: at this size an
   * alphabetical list is both deterministic and the order a person expects. */
  async list(): Promise<ContentAuthor[]> {
    const rows = await this.database
      .select()
      .from(cmsAuthors)
      .orderBy(asc(sql`lower(${cmsAuthors.name})`));
    return rows.map(authorOf);
  }

  async findById(id: string): Promise<ContentAuthor | null> {
    const [row] = await this.database
      .select()
      .from(cmsAuthors)
      .where(eq(cmsAuthors.id, id))
      .limit(1);
    return row ? authorOf(row) : null;
  }

  /** Case-insensitively, matching the unique index. `exceptId` is how an edit
   * that keeps the same name avoids colliding with itself. */
  async findByName(
    name: string,
    options: { exceptId?: string } = {},
  ): Promise<ContentAuthor | null> {
    const [row] = await this.database
      .select()
      .from(cmsAuthors)
      .where(
        and(
          sql`lower(${cmsAuthors.name}) = lower(${name})`,
          ...(options.exceptId ? [ne(cmsAuthors.id, options.exceptId)] : []),
        ),
      )
      .limit(1);
    return row ? authorOf(row) : null;
  }

  async findBySlug(
    slug: string,
    options: { exceptId?: string } = {},
  ): Promise<ContentAuthor | null> {
    const [row] = await this.database
      .select()
      .from(cmsAuthors)
      .where(
        and(
          eq(cmsAuthors.slug, slug),
          ...(options.exceptId ? [ne(cmsAuthors.id, options.exceptId)] : []),
        ),
      )
      .limit(1);
    return row ? authorOf(row) : null;
  }

  async insert(input: {
    values: Pick<
      AuthorRow,
      "name" | "tagline" | "jobTitle" | "imageMediaId" | "slug" | "about"
    >;
    actorId: string;
    now: Date;
  }): Promise<ContentAuthor> {
    const [row] = await this.database
      .insert(cmsAuthors)
      .values({
        ...input.values,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    return authorOf(row);
  }

  /** A plain update: no `lock_version` to match on, so a concurrent edit is
   * last-write-wins. Deliberate — see the table comment. */
  async update(input: {
    id: string;
    patch: Partial<
      Pick<
        AuthorRow,
        "name" | "tagline" | "jobTitle" | "imageMediaId" | "slug" | "about"
      >
    >;
    actorId: string;
    now: Date;
  }): Promise<ContentAuthor | null> {
    const [row] = await this.database
      .update(cmsAuthors)
      .set({
        ...input.patch,
        updatedBy: input.actorId,
        updatedAt: input.now,
      })
      .where(eq(cmsAuthors.id, input.id))
      .returning();
    return row ? authorOf(row) : null;
  }

  /** Which pages credit this author, in either role. */
  async usage(id: string): Promise<AuthorUsage[]> {
    const rows = await this.database
      .select({
        id: cmsPages.id,
        section: cmsPages.section,
        slug: cmsPages.slug,
        title: cmsPageRevisions.title,
        authorId: sql<string | null>`${cmsPageRevisions.metadata}->>'authorId'`,
        factCheckerId: sql<
          string | null
        >`${cmsPageRevisions.metadata}->>'factCheckerId'`,
      })
      .from(cmsPages)
      .innerJoin(
        cmsPageRevisions,
        and(
          eq(cmsPageRevisions.pageId, cmsPages.id),
          CURRENT_REVISION_POINTERS(cmsPages),
        ),
      )
      .where(
        or(
          ...AUTHOR_ROLE_FIELDS.map(
            (field) => sql`${cmsPageRevisions.metadata}->>${field} = ${id}`,
          ),
        ),
      );

    // Three pointers can name the same page, so fold by page and union the
    // roles rather than reporting one row per revision.
    const unique = new Map<string, AuthorUsage>();
    for (const row of rows) {
      const entry = unique.get(row.id) ?? {
        id: row.id,
        section: row.section as ContentSection,
        slug: row.slug,
        title: row.title,
        roles: [],
      };
      if (row.authorId === id && !entry.roles.includes("author")) {
        entry.roles.push("author");
      }
      if (row.factCheckerId === id && !entry.roles.includes("factChecker")) {
        entry.roles.push("factChecker");
      }
      unique.set(row.id, entry);
    }
    return [...unique.values()];
  }

  /** Authors whose portrait is one of these media ids.
   *
   * The media service's trash gate asks this. It cannot come from
   * `cms_media_usage`: that table's primary key starts with a revision id, and
   * a portrait is held by an author row, not by any page copy. */
  async byPortrait(
    mediaIds: readonly string[],
  ): Promise<{ id: string; name: string; imageMediaId: string }[]> {
    const unique = [...new Set(mediaIds)].filter(Boolean);
    if (unique.length === 0) return [];
    const rows = await this.database
      .select({
        id: cmsAuthors.id,
        name: cmsAuthors.name,
        imageMediaId: cmsAuthors.imageMediaId,
      })
      .from(cmsAuthors)
      .where(inArray(cmsAuthors.imageMediaId, unique));
    return rows.filter(
      (row): row is { id: string; name: string; imageMediaId: string } =>
        row.imageMediaId !== null,
    );
  }
}

export const cmsAuthorStore = new CmsAuthorStore();

import "server-only";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { db as defaultDb, type Database } from "@/db";
import {
  cmsCategories,
  cmsCategoryRedirects,
  cmsPageRevisions,
  cmsPages,
} from "@/db/schema";
import type { ContentCategory } from "@/content-system/categories/types";
import type { ContentSection } from "@/content-system/types";

type CategoryRow = typeof cmsCategories.$inferSelect;

const iso = (value: Date): string => value.toISOString();

const categoryOf = (row: CategoryRow): ContentCategory => ({
  ...row,
  section: row.section as ContentSection,
  retiredAt: row.retiredAt ? iso(row.retiredAt) : null,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

export type CategoryUsage = {
  id: string;
  section: ContentSection;
  slug: string;
  title: string;
};

export class CmsCategoryStore {
  constructor(private readonly database: Database = defaultDb) {}

  bind(database: Database): CmsCategoryStore {
    return new CmsCategoryStore(database);
  }

  transaction<T>(body: (store: CmsCategoryStore) => Promise<T>): Promise<T> {
    return (this.database as typeof defaultDb).transaction((tx) =>
      body(this.bind(tx)),
    );
  }

  async list(
    section: ContentSection,
    options: { includeRetired?: boolean } = {},
  ): Promise<ContentCategory[]> {
    const rows = await this.database
      .select()
      .from(cmsCategories)
      .where(
        options.includeRetired
          ? eq(cmsCategories.section, section)
          : and(
              eq(cmsCategories.section, section),
              isNull(cmsCategories.retiredAt),
            ),
      )
      .orderBy(asc(cmsCategories.sortOrder), asc(cmsCategories.label));
    return rows.map(categoryOf);
  }

  async findById(id: string): Promise<ContentCategory | null> {
    const [row] = await this.database
      .select()
      .from(cmsCategories)
      .where(eq(cmsCategories.id, id))
      .limit(1);
    return row ? categoryOf(row) : null;
  }

  async findByKey(
    section: ContentSection,
    key: string,
  ): Promise<ContentCategory | null> {
    const [row] = await this.database
      .select()
      .from(cmsCategories)
      .where(
        and(eq(cmsCategories.section, section), eq(cmsCategories.key, key)),
      )
      .limit(1);
    return row ? categoryOf(row) : null;
  }

  async findBySlug(
    section: ContentSection,
    slug: string,
    options: { includeRetired?: boolean } = {},
  ): Promise<ContentCategory | null> {
    const [row] = await this.database
      .select()
      .from(cmsCategories)
      .where(
        and(
          eq(cmsCategories.section, section),
          eq(cmsCategories.slug, slug),
          ...(options.includeRetired ? [] : [isNull(cmsCategories.retiredAt)]),
        ),
      )
      .limit(1);
    return row ? categoryOf(row) : null;
  }

  async redirectFor(
    section: ContentSection,
    fromSlug: string,
  ): Promise<ContentCategory | null> {
    const [row] = await this.database
      .select({ category: cmsCategories })
      .from(cmsCategoryRedirects)
      .innerJoin(
        cmsCategories,
        eq(cmsCategories.id, cmsCategoryRedirects.categoryId),
      )
      .where(
        and(
          eq(cmsCategoryRedirects.section, section),
          eq(cmsCategoryRedirects.fromSlug, fromSlug),
          isNull(cmsCategories.retiredAt),
        ),
      )
      .limit(1);
    if (!row || row.category.slug === fromSlug) return null;
    return categoryOf(row.category);
  }

  async insert(input: {
    section: ContentSection;
    key: string;
    slug: string;
    label: string;
    title: string;
    description: string;
    sortOrder: number;
    actorId: string;
    now: Date;
  }): Promise<ContentCategory> {
    const [row] = await this.database
      .insert(cmsCategories)
      .values({
        ...input,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    return categoryOf(row);
  }

  async updateWithLock(input: {
    id: string;
    expectedLockVersion: number;
    patch: Partial<
      Pick<
        CategoryRow,
        | "slug"
        | "label"
        | "title"
        | "description"
        | "sortOrder"
        | "retiredAt"
        | "retiredBy"
      >
    >;
    actorId: string;
    now: Date;
  }): Promise<ContentCategory | null> {
    const [row] = await this.database
      .update(cmsCategories)
      .set({
        ...input.patch,
        updatedBy: input.actorId,
        updatedAt: input.now,
        lockVersion: sql`${cmsCategories.lockVersion} + 1`,
      })
      .where(
        and(
          eq(cmsCategories.id, input.id),
          eq(cmsCategories.lockVersion, input.expectedLockVersion),
        ),
      )
      .returning();
    return row ? categoryOf(row) : null;
  }

  async dropRedirect(section: ContentSection, slug: string): Promise<void> {
    await this.database
      .delete(cmsCategoryRedirects)
      .where(
        and(
          eq(cmsCategoryRedirects.section, section),
          eq(cmsCategoryRedirects.fromSlug, slug),
        ),
      );
  }

  async addRedirect(input: {
    section: ContentSection;
    fromSlug: string;
    categoryId: string;
    actorId: string;
    now: Date;
  }): Promise<void> {
    await this.database.insert(cmsCategoryRedirects).values({
      section: input.section,
      fromSlug: input.fromSlug,
      categoryId: input.categoryId,
      createdBy: input.actorId,
      createdAt: input.now,
    });
  }

  async redirectsForCategory(id: string): Promise<string[]> {
    const rows = await this.database
      .select({ slug: cmsCategoryRedirects.fromSlug })
      .from(cmsCategoryRedirects)
      .where(eq(cmsCategoryRedirects.categoryId, id))
      .orderBy(asc(cmsCategoryRedirects.createdAt));
    return rows.map((row) => row.slug);
  }

  /** Current editable/public pointers only. Superseded historical revisions may
   * retain the key; the retired category tombstone keeps those understandable. */
  async usage(section: ContentSection, key: string): Promise<CategoryUsage[]> {
    const rows = await this.database
      .select({
        id: cmsPages.id,
        section: cmsPages.section,
        slug: cmsPages.slug,
        title: cmsPageRevisions.title,
      })
      .from(cmsPages)
      .innerJoin(
        cmsPageRevisions,
        and(
          eq(cmsPageRevisions.pageId, cmsPages.id),
          or(
            eq(cmsPageRevisions.id, cmsPages.wipRevisionId),
            eq(cmsPageRevisions.id, cmsPages.publishedRevisionId),
            eq(cmsPageRevisions.id, cmsPages.previewRevisionId),
          ),
        ),
      )
      .where(
        and(
          eq(cmsPages.section, section),
          sql`(${cmsPageRevisions.metadata}->'categories') ? ${key}`,
        ),
      );

    const unique = new Map<string, CategoryUsage>();
    for (const row of rows) {
      if (!unique.has(row.id)) {
        unique.set(row.id, {
          id: row.id,
          section: row.section as ContentSection,
          slug: row.slug,
          title: row.title,
        });
      }
    }
    return [...unique.values()];
  }

  async lockVersionOf(id: string): Promise<number | null> {
    const [row] = await this.database
      .select({ version: cmsCategories.lockVersion })
      .from(cmsCategories)
      .where(eq(cmsCategories.id, id))
      .limit(1);
    return row?.version ?? null;
  }
}

export const cmsCategoryStore = new CmsCategoryStore();

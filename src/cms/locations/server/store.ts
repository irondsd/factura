import "server-only";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { db as defaultDb, type Database } from "@/db";
import {
  cmsLocationRedirects,
  cmsLocations,
  cmsPageRevisions,
  cmsPages,
} from "@/db/schema";
import type { ContentLocation } from "@/content-system/locations/types";
import type { ContentSection, ContentStatus } from "@/content-system/types";

type LocationRow = typeof cmsLocations.$inferSelect;
const iso = (value: Date): string => value.toISOString();
const locationOf = (row: LocationRow): ContentLocation => ({
  ...row,
  retiredAt: row.retiredAt ? iso(row.retiredAt) : null,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

export type LocationUsage = {
  id: string;
  section: ContentSection;
  slug: string;
  title: string;
  status: ContentStatus;
};

export class CmsLocationStore {
  constructor(private readonly database: Database = defaultDb) {}
  bind(database: Database) {
    return new CmsLocationStore(database);
  }
  transaction<T>(body: (store: CmsLocationStore) => Promise<T>): Promise<T> {
    return (this.database as typeof defaultDb).transaction((tx) =>
      body(this.bind(tx)),
    );
  }

  async list(
    options: { includeRetired?: boolean } = {},
  ): Promise<ContentLocation[]> {
    const rows = await this.database
      .select()
      .from(cmsLocations)
      .where(
        options.includeRetired ? undefined : isNull(cmsLocations.retiredAt),
      )
      .orderBy(asc(cmsLocations.label));
    return rows.map(locationOf);
  }
  async findById(id: string): Promise<ContentLocation | null> {
    const [row] = await this.database
      .select()
      .from(cmsLocations)
      .where(eq(cmsLocations.id, id))
      .limit(1);
    return row ? locationOf(row) : null;
  }
  async findByKey(key: string): Promise<ContentLocation | null> {
    const [row] = await this.database
      .select()
      .from(cmsLocations)
      .where(eq(cmsLocations.key, key))
      .limit(1);
    return row ? locationOf(row) : null;
  }
  async findBySlug(
    slug: string,
    options: { includeRetired?: boolean } = {},
  ): Promise<ContentLocation | null> {
    const [row] = await this.database
      .select()
      .from(cmsLocations)
      .where(
        and(
          eq(cmsLocations.slug, slug),
          ...(options.includeRetired ? [] : [isNull(cmsLocations.retiredAt)]),
        ),
      )
      .limit(1);
    return row ? locationOf(row) : null;
  }
  async redirectFor(fromSlug: string): Promise<ContentLocation | null> {
    const [row] = await this.database
      .select({ location: cmsLocations })
      .from(cmsLocationRedirects)
      .innerJoin(
        cmsLocations,
        eq(cmsLocations.id, cmsLocationRedirects.locationId),
      )
      .where(
        and(
          eq(cmsLocationRedirects.fromSlug, fromSlug),
          isNull(cmsLocations.retiredAt),
        ),
      )
      .limit(1);
    if (!row || row.location.slug === fromSlug) return null;
    return locationOf(row.location);
  }
  async insert(input: {
    key: string;
    slug: string;
    label: string;
    title: string;
    description: string;
    actorId: string;
    now: Date;
  }): Promise<ContentLocation> {
    const [row] = await this.database
      .insert(cmsLocations)
      .values({
        ...input,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    return locationOf(row);
  }
  async updateWithLock(input: {
    id: string;
    expectedLockVersion: number;
    patch: Partial<
      Pick<
        LocationRow,
        "slug" | "label" | "title" | "description" | "retiredAt" | "retiredBy"
      >
    >;
    actorId: string;
    now: Date;
  }): Promise<ContentLocation | null> {
    const [row] = await this.database
      .update(cmsLocations)
      .set({
        ...input.patch,
        updatedBy: input.actorId,
        updatedAt: input.now,
        lockVersion: sql`${cmsLocations.lockVersion} + 1`,
      })
      .where(
        and(
          eq(cmsLocations.id, input.id),
          eq(cmsLocations.lockVersion, input.expectedLockVersion),
        ),
      )
      .returning();
    return row ? locationOf(row) : null;
  }
  async dropRedirect(slug: string) {
    await this.database
      .delete(cmsLocationRedirects)
      .where(eq(cmsLocationRedirects.fromSlug, slug));
  }
  async addRedirect(input: {
    fromSlug: string;
    locationId: string;
    actorId: string;
    now: Date;
  }) {
    await this.database
      .insert(cmsLocationRedirects)
      .values({ ...input, createdBy: input.actorId, createdAt: input.now });
  }
  async redirectsForLocation(id: string): Promise<string[]> {
    const rows = await this.database
      .select({ slug: cmsLocationRedirects.fromSlug })
      .from(cmsLocationRedirects)
      .where(eq(cmsLocationRedirects.locationId, id))
      .orderBy(asc(cmsLocationRedirects.createdAt));
    return rows.map((row) => row.slug);
  }
  /** `usage` for every location key at once: one scan of the current
   * revisions instead of one per location. For the registry list, which shows
   * each location's pages and used to ask per location. */
  async usageByKey(): Promise<Map<string, LocationUsage[]>> {
    const rows = await this.database.execute<{
      key: string;
      id: string;
      section: string;
      slug: string;
      status: string;
      title: string;
    }>(
      sql`select distinct location.key, ${cmsPages.id} as id, ${cmsPages.section} as section,
          ${cmsPages.slug} as slug, ${cmsPages.status} as status, ${cmsPageRevisions.title} as title
        from ${cmsPages}
        inner join ${cmsPageRevisions}
          on ${cmsPageRevisions.pageId} = ${cmsPages.id}
          and ${cmsPageRevisions.id} in (${cmsPages.wipRevisionId}, ${cmsPages.publishedRevisionId}, ${cmsPages.previewRevisionId})
        cross join lateral jsonb_array_elements_text(
          case when jsonb_typeof(${cmsPageRevisions.metadata}->'locations') = 'array'
            then ${cmsPageRevisions.metadata}->'locations' else '[]'::jsonb end
        ) as location(key)`,
    );
    // `distinct` folds identical rows, but two pointers of one page can carry
    // different titles; keep the first per page, as `usage` does.
    const byKey = new Map<string, Map<string, LocationUsage>>();
    for (const row of rows) {
      const pages = byKey.get(row.key) ?? new Map<string, LocationUsage>();
      if (!pages.has(row.id))
        pages.set(row.id, {
          id: row.id,
          section: row.section as ContentSection,
          slug: row.slug,
          title: row.title,
          status: row.status as ContentStatus,
        });
      byKey.set(row.key, pages);
    }
    return new Map(
      [...byKey].map(([key, pages]) => [key, [...pages.values()]]),
    );
  }

  async usage(key: string): Promise<LocationUsage[]> {
    const rows = await this.database
      .select({
        id: cmsPages.id,
        section: cmsPages.section,
        slug: cmsPages.slug,
        status: cmsPages.status,
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
      .where(sql`(${cmsPageRevisions.metadata}->'locations') ? ${key}`);
    const unique = new Map<string, LocationUsage>();
    for (const row of rows)
      if (!unique.has(row.id))
        unique.set(row.id, {
          id: row.id,
          section: row.section as ContentSection,
          slug: row.slug,
          title: row.title,
          status: row.status,
        });
    return [...unique.values()];
  }
  async lockVersionOf(id: string): Promise<number | null> {
    const [row] = await this.database
      .select({ version: cmsLocations.lockVersion })
      .from(cmsLocations)
      .where(eq(cmsLocations.id, id))
      .limit(1);
    return row?.version ?? null;
  }
}

export const cmsLocationStore = new CmsLocationStore();

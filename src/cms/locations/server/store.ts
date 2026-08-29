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
  bind(database: Database) { return new CmsLocationStore(database); }
  transaction<T>(body: (store: CmsLocationStore) => Promise<T>): Promise<T> {
    return (this.database as typeof defaultDb).transaction((tx) => body(this.bind(tx)));
  }

  async list(options: { includeRetired?: boolean } = {}): Promise<ContentLocation[]> {
    const rows = await this.database.select().from(cmsLocations)
      .where(options.includeRetired ? undefined : isNull(cmsLocations.retiredAt))
      .orderBy(asc(cmsLocations.sortOrder), asc(cmsLocations.label));
    return rows.map(locationOf);
  }
  async findById(id: string): Promise<ContentLocation | null> {
    const [row] = await this.database.select().from(cmsLocations).where(eq(cmsLocations.id, id)).limit(1);
    return row ? locationOf(row) : null;
  }
  async findByKey(key: string): Promise<ContentLocation | null> {
    const [row] = await this.database.select().from(cmsLocations).where(eq(cmsLocations.key, key)).limit(1);
    return row ? locationOf(row) : null;
  }
  async findBySlug(slug: string, options: { includeRetired?: boolean } = {}): Promise<ContentLocation | null> {
    const [row] = await this.database.select().from(cmsLocations).where(and(
      eq(cmsLocations.slug, slug),
      ...(options.includeRetired ? [] : [isNull(cmsLocations.retiredAt)]),
    )).limit(1);
    return row ? locationOf(row) : null;
  }
  async redirectFor(fromSlug: string): Promise<ContentLocation | null> {
    const [row] = await this.database.select({ location: cmsLocations })
      .from(cmsLocationRedirects)
      .innerJoin(cmsLocations, eq(cmsLocations.id, cmsLocationRedirects.locationId))
      .where(and(eq(cmsLocationRedirects.fromSlug, fromSlug), isNull(cmsLocations.retiredAt))).limit(1);
    if (!row || row.location.slug === fromSlug) return null;
    return locationOf(row.location);
  }
  async insert(input: { key: string; slug: string; label: string; title: string; description: string; sortOrder: number; actorId: string; now: Date }): Promise<ContentLocation> {
    const [row] = await this.database.insert(cmsLocations).values({
      ...input, createdBy: input.actorId, updatedBy: input.actorId,
      createdAt: input.now, updatedAt: input.now,
    }).returning();
    return locationOf(row);
  }
  async updateWithLock(input: {
    id: string; expectedLockVersion: number;
    patch: Partial<Pick<LocationRow, "slug" | "label" | "title" | "description" | "sortOrder" | "retiredAt" | "retiredBy">>;
    actorId: string; now: Date;
  }): Promise<ContentLocation | null> {
    const [row] = await this.database.update(cmsLocations).set({
      ...input.patch, updatedBy: input.actorId, updatedAt: input.now,
      lockVersion: sql`${cmsLocations.lockVersion} + 1`,
    }).where(and(eq(cmsLocations.id, input.id), eq(cmsLocations.lockVersion, input.expectedLockVersion))).returning();
    return row ? locationOf(row) : null;
  }
  async dropRedirect(slug: string) { await this.database.delete(cmsLocationRedirects).where(eq(cmsLocationRedirects.fromSlug, slug)); }
  async addRedirect(input: { fromSlug: string; locationId: string; actorId: string; now: Date }) {
    await this.database.insert(cmsLocationRedirects).values({ ...input, createdBy: input.actorId, createdAt: input.now });
  }
  async redirectsForLocation(id: string): Promise<string[]> {
    const rows = await this.database.select({ slug: cmsLocationRedirects.fromSlug }).from(cmsLocationRedirects)
      .where(eq(cmsLocationRedirects.locationId, id)).orderBy(asc(cmsLocationRedirects.createdAt));
    return rows.map((row) => row.slug);
  }
  async usage(key: string): Promise<LocationUsage[]> {
    const rows = await this.database.select({
      id: cmsPages.id, section: cmsPages.section, slug: cmsPages.slug,
      status: cmsPages.status, title: cmsPageRevisions.title,
    }).from(cmsPages).innerJoin(cmsPageRevisions, and(
      eq(cmsPageRevisions.pageId, cmsPages.id),
      or(
        eq(cmsPageRevisions.id, cmsPages.wipRevisionId),
        eq(cmsPageRevisions.id, cmsPages.publishedRevisionId),
        eq(cmsPageRevisions.id, cmsPages.previewRevisionId),
      ),
    )).where(sql`(${cmsPageRevisions.metadata}->'locations') ? ${key}`);
    const unique = new Map<string, LocationUsage>();
    for (const row of rows) if (!unique.has(row.id)) unique.set(row.id, {
      id: row.id, section: row.section as ContentSection, slug: row.slug,
      title: row.title, status: row.status,
    });
    return [...unique.values()];
  }
  async lockVersionOf(id: string): Promise<number | null> {
    const [row] = await this.database.select({ version: cmsLocations.lockVersion }).from(cmsLocations).where(eq(cmsLocations.id, id)).limit(1);
    return row?.version ?? null;
  }
}

export const cmsLocationStore = new CmsLocationStore();

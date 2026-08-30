import "server-only";
import { asc, eq, isNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { cmsLocationRedirects, cmsLocations } from "@/db/schema";
import type {
  ContentLocation,
  NonEmptyContentLocation,
} from "../locations/types";
import {
  CONTENT_SECTIONS,
  type ContentSection,
  type ContentSummary,
} from "../types";
import { CI_CONTENT_LOCATIONS } from "./ci-fixtures";
import { sectionRepository } from "./sections";
import { locationsTag } from "./tags";

const mapLocation = (
  row: typeof cmsLocations.$inferSelect,
): ContentLocation => ({
  ...row,
  retiredAt: row.retiredAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

async function readLocations(): Promise<ContentLocation[]> {
  if (process.env.CI_CONTENT_FIXTURES === "1") return [...CI_CONTENT_LOCATIONS];
  const { db } = await import("@/db");
  return (
    await db
      .select()
      .from(cmsLocations)
      .where(isNull(cmsLocations.retiredAt))
      .orderBy(asc(cmsLocations.sortOrder), asc(cmsLocations.label))
  ).map(mapLocation);
}

async function readRedirect(slug: string): Promise<ContentLocation | null> {
  if (process.env.CI_CONTENT_FIXTURES === "1") return null;
  const { db } = await import("@/db");
  const [row] = await db
    .select({ location: cmsLocations })
    .from(cmsLocationRedirects)
    .innerJoin(
      cmsLocations,
      eq(cmsLocations.id, cmsLocationRedirects.locationId),
    )
    .where(eq(cmsLocationRedirects.fromSlug, slug))
    .limit(1);
  if (!row || row.location.retiredAt || row.location.slug === slug) return null;
  return mapLocation(row.location);
}

const cachedLocations = unstable_cache(
  readLocations,
  ["content", "locations"],
  {
    revalidate: false,
    tags: [locationsTag],
  },
);
const cachedRedirect = unstable_cache(
  readRedirect,
  ["content", "location-redirect"],
  {
    revalidate: false,
    tags: [locationsTag],
  },
);

export const contentLocations = () => cachedLocations();
export const locationRedirect = (slug: string) => cachedRedirect(slug);

export async function locationByKey(
  key: string,
): Promise<ContentLocation | undefined> {
  return (await contentLocations()).find((location) => location.key === key);
}

export async function locationBySlug(
  slug: string,
): Promise<ContentLocation | undefined> {
  return (await contentLocations()).find((location) => location.slug === slug);
}

export async function locationsByKeys(
  keys: readonly string[],
): Promise<ContentLocation[]> {
  const requested = new Set(keys);
  return (await contentLocations()).filter((location) =>
    requested.has(location.key),
  );
}

/** The four published section lists, read through `sectionRepository` — the
 * *cached* reads, not `publishedContent`'s raw passthrough.
 *
 * This is the whole cache-invalidation story for the location surfaces, and the
 * difference is not cosmetic. A location hub is a static page whose only other
 * read is the registry, tagged `content:locations`. Reading the sections
 * untagged left the hub carrying that one tag, so publishing an article
 * refreshed the sitemap (which reads tagged section lists of its own) and left
 * the hub serving the old list until the next deployment — and left a hub that
 * had 404'd while empty answering 404 after its first page was published.
 * Going through the cached reads is what puts `content:<section>` on the hub's
 * cache entry, which is what `revalidatePublicContent` already expires. */
export async function publishedContentBySection(): Promise<
  Record<ContentSection, ContentSummary[]>
> {
  const lists = await Promise.all(
    CONTENT_SECTIONS.map((section) =>
      sectionRepository(section)!.listPublished(),
    ),
  );
  return Object.fromEntries(
    CONTENT_SECTIONS.map((section, index) => [section, lists[index]]),
  ) as Record<ContentSection, ContentSummary[]>;
}

export async function contentInLocation(
  key: string,
): Promise<Record<ContentSection, ContentSummary[]>> {
  const bySection = await publishedContentBySection();
  return Object.fromEntries(
    CONTENT_SECTIONS.map((section) => [
      section,
      bySection[section].filter((page) =>
        page.metadata.locations.includes(key),
      ),
    ]),
  ) as Record<ContentSection, ContentSummary[]>;
}

export async function nonEmptyContentLocations(): Promise<
  NonEmptyContentLocation[]
> {
  const [locations, bySection] = await Promise.all([
    contentLocations(),
    publishedContentBySection(),
  ]);
  return locations.flatMap((location) => {
    const pages = CONTENT_SECTIONS.flatMap((section) =>
      bySection[section].filter((page) =>
        page.metadata.locations.includes(location.key),
      ),
    ).sort(
      (a, b) => Date.parse(b.contentUpdatedAt) - Date.parse(a.contentUpdatedAt),
    );
    if (pages.length === 0) return [];
    return [{ ...location, total: pages.length, pages }];
  });
}

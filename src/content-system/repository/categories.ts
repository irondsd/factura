import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { cmsCategories, cmsCategoryRedirects } from "@/db/schema";
import type { ContentCategory } from "../categories/types";
import type { ContentSection, ContentSummary } from "../types";
import { publicContentRepository } from "./public";
import { contentTag } from "./tags";

const mapCategory = (
  row: typeof cmsCategories.$inferSelect,
): ContentCategory => ({
  ...row,
  section: row.section as ContentSection,
  retiredAt: row.retiredAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

async function readCategories(section: ContentSection) {
  const rows = await db
    .select()
    .from(cmsCategories)
    .where(
      and(eq(cmsCategories.section, section), isNull(cmsCategories.retiredAt)),
    )
    .orderBy(asc(cmsCategories.sortOrder), asc(cmsCategories.label));
  return rows.map(mapCategory);
}

async function readRedirect(section: ContentSection, fromSlug: string) {
  const [row] = await db
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
  return mapCategory(row.category);
}

type CachedCategories = {
  list: () => Promise<ContentCategory[]>;
  redirect: (slug: string) => Promise<ContentCategory | null>;
};

const CACHE = new Map<ContentSection, CachedCategories>();

function cached(section: ContentSection): CachedCategories {
  const existing = CACHE.get(section);
  if (existing) return existing;
  const tags = [contentTag(section)];
  const value = {
    list: unstable_cache(
      () => readCategories(section),
      ["content", section, "categories"],
      { revalidate: 3600, tags },
    ),
    redirect: unstable_cache(
      (slug: string) => readRedirect(section, slug),
      ["content", section, "category-redirect"],
      { revalidate: 3600, tags },
    ),
  };
  CACHE.set(section, value);
  return value;
}

export const publishedContent = (section: ContentSection) =>
  publicContentRepository.listPublished(section);

export const contentCategories = (section: ContentSection) =>
  cached(section).list();

export async function categoryByKey(
  section: ContentSection,
  key: string,
): Promise<ContentCategory | undefined> {
  return (await contentCategories(section)).find((item) => item.key === key);
}

export async function categoryBySlug(
  section: ContentSection,
  slug: string,
): Promise<ContentCategory | undefined> {
  return (await contentCategories(section)).find((item) => item.slug === slug);
}

export const categoryRedirect = (
  section: ContentSection,
  slug: string,
): Promise<ContentCategory | null> => cached(section).redirect(slug);

export async function categoriesByKeys(
  section: ContentSection,
  keys: readonly string[],
): Promise<ContentCategory[]> {
  const byKey = new Map(
    (await contentCategories(section)).map((category) => [
      category.key,
      category,
    ]),
  );
  return keys
    .map((key) => byKey.get(key))
    .filter((category): category is ContentCategory => category !== undefined);
}

export async function contentInCategory(
  section: ContentSection,
  key: string,
): Promise<ContentSummary[]> {
  return (await publishedContent(section)).filter((page) =>
    page.metadata.categories.includes(key),
  );
}

export async function nonEmptyContentCategories(
  section: ContentSection,
): Promise<ContentCategory[]> {
  const [categories, pages] = await Promise.all([
    contentCategories(section),
    publishedContent(section),
  ]);
  return categories.filter((category) =>
    pages.some((page) => page.metadata.categories.includes(category.key)),
  );
}

export async function contentByPrimaryCategory(
  section: ContentSection,
): Promise<
  { category: ContentCategory; pages: ContentSummary[]; total: number }[]
> {
  const [categories, pages] = await Promise.all([
    contentCategories(section),
    publishedContent(section),
  ]);
  return categories
    .map((category) => ({
      category,
      pages: pages.filter(
        (page) => page.metadata.categories[0] === category.key,
      ),
      total: pages.filter((page) =>
        page.metadata.categories.includes(category.key),
      ).length,
    }))
    .filter((group) => group.pages.length > 0);
}

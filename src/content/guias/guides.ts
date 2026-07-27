import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { MDXComponents } from "mdx/types";
import type { ComponentType } from "react";
import { CATEGORIES, type Category, type CategoryId } from "./categories";

// Build-time access to the guide MDX files. Guides are Spanish-only evergreen
// SEO articles authored as `.mdx` in this directory; each file exports a `meta`
// object alongside its default (the rendered component). This module is the
// single source the index page, the article route, and the sitemap read from.

export type GuideMeta = {
  /** Page <title> and article headline. */
  title: string;
  /** <meta name="description"> + OG/Twitter description. */
  description: string;
  /** Short blurb shown on the /guias index cards. */
  summary: string;
  /** SEO keywords for <meta name="keywords">. */
  keywords: string[];
  /** 1–3 category ids. The first is the guide's *primary* category — it decides
   * the index grouping and the breadcrumb. See `./categories.ts`. */
  categories: CategoryId[];
  /** ISO date (YYYY-MM-DD) first published. */
  published: string;
  /** ISO date (YYYY-MM-DD) last updated. */
  updated: string;
};

export type Guide = { slug: string; meta: GuideMeta };

const DIR = path.join(process.cwd(), "src/content/guias");

/** Slugs of every guide (filenames without the `.mdx` extension). */
export function guideSlugs(): string[] {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));
}

/** Load a single guide's rendered component + metadata by slug. `Content` takes
 * the standard MDX `components` prop, which the article route uses to override
 * the global map with per-guide components (see the `RelatedGuides` note in
 * `src/mdx-components.tsx`). */
export async function loadGuide(
  slug: string,
): Promise<{
  Content: ComponentType<{ components?: MDXComponents }>;
  meta: GuideMeta;
}> {
  const mod = await import(`@/content/guias/${slug}.mdx`);
  return { Content: mod.default, meta: mod.meta };
}

async function readAllGuides(): Promise<Guide[]> {
  const guides = await Promise.all(
    guideSlugs().map(async (slug) => ({
      slug,
      meta: (await loadGuide(slug)).meta,
    })),
  );
  return guides.sort((a, b) =>
    b.meta.published.localeCompare(a.meta.published),
  );
}

// Memoized for the lifetime of the process. Reading every guide means importing
// every compiled MDX module just to get at `meta`, and that now happens on the
// index, each of the category pages, *and* each article (for related guides).
// Guide content is baked in at build time and can't change under us, so a
// module-level memo is both safe and simpler than request-scoped caching.
let guidesPromise: Promise<Guide[]> | undefined;

/** All guides with metadata, newest first. The single read every consumer goes
 * through — the index, the category pages, the sitemap and llms.txt. */
export function allGuides(): Promise<Guide[]> {
  return (guidesPromise ??= readAllGuides());
}

/** A guide's primary category: the first id in `meta.categories`. It decides
 * where the guide is grouped on the index and which breadcrumb it gets. */
export const primaryCategoryOf = (guide: Guide): CategoryId =>
  guide.meta.categories[0];

/** Every guide *tagged* with `id` — primary or not — newest first. This is the
 * category page's list, and it's a superset of that category's index section. */
export async function guidesInCategory(id: CategoryId): Promise<Guide[]> {
  return (await allGuides()).filter((g) => g.meta.categories.includes(id));
}

/** The /guias index, grouped by *primary* category so no guide is listed twice.
 * Sections come in registry order; a category no guide leads with is omitted.
 * `total` is the tagged count (what its category page will show), which is why
 * it can exceed `guides.length`. */
export async function guidesByPrimaryCategory(): Promise<
  { category: Category; guides: Guide[]; total: number }[]
> {
  const guides = await allGuides();
  return CATEGORIES.map((category) => ({
    category,
    guides: guides.filter((g) => primaryCategoryOf(g) === category.id),
    total: guides.filter((g) => g.meta.categories.includes(category.id)).length,
  })).filter((section) => section.guides.length > 0);
}

/** Guides to suggest at the foot of `slug`, best match first.
 *
 * Ranked by how many categories they share with the current guide, with a
 * tiebreak bonus for sharing its primary one, then newest first. If that turns
 * up too few — a guide alone in its category — the list is topped up with the
 * newest other guides, so the block is never awkwardly short or empty. */
export async function relatedGuides(
  slug: string,
  limit = 3,
): Promise<Guide[]> {
  const guides = await allGuides();
  const current = guides.find((g) => g.slug === slug);
  if (!current) return [];

  const others = guides.filter((g) => g.slug !== slug);
  const shared = (g: Guide) =>
    g.meta.categories.filter((c) => current.meta.categories.includes(c)).length;

  const ranked = others
    .filter((g) => shared(g) > 0)
    .map((g) => ({
      guide: g,
      score:
        shared(g) +
        (primaryCategoryOf(g) === primaryCategoryOf(current) ? 0.5 : 0),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.guide.meta.published.localeCompare(a.guide.meta.published),
    )
    .map((r) => r.guide);

  if (ranked.length >= limit) return ranked.slice(0, limit);

  const filler = others.filter((g) => !ranked.includes(g));
  return [...ranked, ...filler].slice(0, limit);
}

/** Categories with at least one tagged guide, in registry order. Drives
 * `generateStaticParams` and the sitemap so no empty category page is built.
 * Wider than the index sections: a category can have tagged guides but none
 * that lead with it. */
export async function nonEmptyCategories(): Promise<Category[]> {
  const guides = await allGuides();
  return CATEGORIES.filter((c) =>
    guides.some((g) => g.meta.categories.includes(c.id)),
  );
}

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
  /** Full ISO 8601 timestamp with offset, e.g. "2026-06-29T09:00:00-03:00",
   * when the guide was first published. Google asks for the date and only
   * *recommends* the time and timezone, but the extra precision is free and it
   * keeps the visible dateline and the JSON-LD identical, which Google does
   * require. See AUTHORING.md §2. */
  published: string;
  /** Full ISO 8601 timestamp with offset, when the guide was last updated. */
  updated: string;
  /** Optional Q&A block, rendered where the body places `<Faq />` and emitted
   * as FAQPage JSON-LD. One list feeds both, so the markup can never claim a
   * question the page doesn't visibly answer — which is the condition Google
   * puts on the markup being legitimate at all.
   *
   * Note this buys no FAQ rich result: since 2023 Google shows those only for
   * government and health sites. The value is the visible answers competing for
   * long-tail queries and "People also ask"; the markup is for Bing and for the
   * LLM crawlers that read it. Answers are plain text — put links in the prose,
   * not here, so the rendered text and the schema text stay identical. */
  faq?: { q: string; a: string }[];
};

export type Guide = {
  slug: string;
  meta: GuideMeta;
  /** Estimated reading time in whole minutes, from the MDX body. */
  readingMinutes: number;
};

const DIR = path.join(process.cwd(), "src/content/guias");

// Spanish informational prose, read a bit more carefully than a novel because of
// the tables and step lists. Silent-reading research puts general Spanish text
// near 260 wpm; 200 is the deliberate discount for this material. One constant —
// change it here if the estimates feel off.
const WORDS_PER_MINUTE = 200;

/** Strip the `meta` export off the front of a guide's source, leaving the prose.
 * Brace-matched rather than regexed so an object literal in the body can't cut
 * the article short. */
function guideBody(source: string): string {
  const marker = source.match(/export\s+const\s+meta\s*=\s*/);
  if (!marker || marker.index === undefined) return source;
  const open = source.indexOf("{", marker.index);
  if (open === -1) return source;

  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(i + 1);
  }
  return source;
}

/** Words a reader actually reads: prose only, with code, image URLs, JSX tags
 * and markdown scaffolding removed. Link *text* counts, link targets don't. */
function countWords(body: string): number {
  const prose = body
    .replace(/```[\s\S]*?```/g, " ") // fenced code
    .replace(/`[^`]*`/g, " ") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → their text
    .replace(/<[^>]+>/g, " ") // JSX / HTML tags
    .replace(/^#{1,6}[ \t]+/gm, " ") // heading markers
    .replace(/^[ \t]*[-*>][ \t]+/gm, " ") // list bullets, quotes
    .replace(/^[ \t]*\|.*\|[ \t]*$/gm, (row) => row.replace(/[|-]/g, " ")) // table pipes
    .replace(/[*_~]/g, " "); // emphasis

  return prose.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Estimated reading time for a guide, in whole minutes (never below 1).
 *
 * `faq` is passed in because the Q&A lives in the `meta` block, which
 * `guideBody` strips — but it renders on the page like any other prose, and a
 * six-question FAQ is a couple of minutes of reading. Callers already hold the
 * meta, so threading it through beats re-parsing the block here. */
export function readingMinutes(
  slug: string,
  faq?: GuideMeta["faq"],
): number {
  const source = fs.readFileSync(path.join(DIR, `${slug}.mdx`), "utf8");
  const faqWords = (faq ?? []).reduce(
    (n, { q, a }) => n + countWords(`${q} ${a}`),
    0,
  );
  return Math.max(
    1,
    Math.round((countWords(guideBody(source)) + faqWords) / WORDS_PER_MINUTE),
  );
}

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
export async function loadGuide(slug: string): Promise<{
  Content: ComponentType<{ components?: MDXComponents }>;
  meta: GuideMeta;
}> {
  const mod = await import(`@/content/guias/${slug}.mdx`);
  return { Content: mod.default, meta: mod.meta };
}

async function readAllGuides(): Promise<Guide[]> {
  const guides = await Promise.all(
    guideSlugs().map(async (slug) => {
      const { meta } = await loadGuide(slug);
      return { slug, meta, readingMinutes: readingMinutes(slug, meta.faq) };
    }),
  );
  // Newest first. Timestamps now carry offsets, so compare instants rather than
  // strings — "…T09:00:00-03:00" and "…T09:00:00Z" don't sort as text.
  return guides.sort(
    (a, b) => Date.parse(b.meta.published) - Date.parse(a.meta.published),
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
export async function relatedGuides(slug: string, limit = 3): Promise<Guide[]> {
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
        Date.parse(b.guide.meta.published) - Date.parse(a.guide.meta.published),
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

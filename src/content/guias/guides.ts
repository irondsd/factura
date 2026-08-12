import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { MDXComponents } from "mdx/types";
import type { ComponentType } from "react";
import { CATEGORIES, type Category, type CategoryId } from "./categories";
import { extractHeadings, FAQ_SECTION, type Heading } from "../headings";
import { mdxBody, readingStats } from "../mdx";

// Build-time access to the guide MDX files. Guides are Spanish-only evergreen
// SEO articles authored as `.mdx` in this directory; each file exports a `meta`
// object alongside its default (the rendered component). This module is the
// single source the index page, the article route, and the sitemap read from.

export type GuideMeta = {
  /** Page <title> and article headline. Rendered verbatim in <title> — the
   * section drops the "— Factura" suffix the rest of the site uses, because ten
   * characters of brand pushed most of these past the ~60 a search result
   * shows, and Google labels the result with the site name anyway. */
  title: string;
  /** Overrides `title` in <title> only — the <h1> and the JSON-LD headline stay
   * `title`. For the guide whose headline reads well on the page but doesn't
   * survive the search snippet. ≤60 chars; see AUTHORING.md §2. */
  titleTag?: string;
  /** <meta name="description"> + OG/Twitter description. */
  description: string;
  /** Social-card copy, when the click-hook wants to differ from the search
   * copy. Both default to the headline/description above. */
  ogTitle?: string;
  ogDescription?: string;
  /** Steers the generated social card at `/og/guias/<slug>/card.png`.
   * `eyebrow` replaces the default "GUÍA · <vendor or category>" line; `stat`
   * puts one figure under the headline, for the guides whose answer *is* a
   * number ("+318% en dos años"). Both are text slots — the card's layout and
   * palette aren't per-guide. */
  ogImage?: { eyebrow?: string; stat?: string };
  /** The company this guide is about — "Edesur", "Metrogas", "AySA". Names the
   * card's eyebrow and becomes the JSON-LD `about`, which is how a search
   * engine reading the markup learns the article is about that utility rather
   * than merely mentioning it. Leave unset for a guide about a topic. */
  vendor?: string;
  /** Short blurb shown on the /guias index cards. */
  summary: string;
  /** One line of copy for the `<TopCta />` banner the article route renders
   * between the header and the first paragraph — the hook for the reader who
   * skims the intro and leaves. Written per guide; see AUTHORING.md §5. */
  cta: string;
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
  /** Slug of the guide that should rank for this topic. Set it when two guides
   * compete for the same query and one of them is the answer: this one keeps
   * rendering at its own URL, but its canonical (and its JSON-LD) point at the
   * other, and it drops out of the sitemap. The lever for cannibalization —
   * cheaper and less link-breaking than deleting a guide. */
  canonical?: string;
  /** Keep this guide out of the index AND out of every listing — the index, the
   * category hubs, related guides, llms.txt, the sitemap. It still renders at
   * its URL, so a draft can be read and reviewed before it's announced. */
  noindex?: true;
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

/** How long a guide is: words of real prose, and the reading time in whole
 * minutes. The FAQ is counted too — it lives in the `meta` block, which
 * `mdxBody` strips, but it renders on the page like any other prose and a
 * six-question FAQ is a couple of minutes of reading. */
export function guideStats(
  slug: string,
  faq?: GuideMeta["faq"],
): { words: number; minutes: number } {
  const source = fs.readFileSync(path.join(DIR, `${slug}.mdx`), "utf8");
  return readingStats(
    source,
    (faq ?? []).map(({ q, a }) => `${q} ${a}`),
  );
}

/** Reading time alone, for the listings — they show the minutes and never the
 * word count. */
export const readingMinutes = (slug: string, faq?: GuideMeta["faq"]): number =>
  guideStats(slug, faq).minutes;

/** The sections of a guide, for its table of contents: every `##` in the body,
 * in order, with the id `rehype-slug` gave the rendered heading.
 *
 * The FAQ is appended when the guide has one *and* places it, because it reads
 * as a section like any other even though its heading isn't in the body. It's
 * dropped if a real heading already took that id, which would otherwise mean a
 * contents entry pointing at the wrong section. */
export function guideHeadings(slug: string, faq?: GuideMeta["faq"]): Heading[] {
  const body = mdxBody(fs.readFileSync(path.join(DIR, `${slug}.mdx`), "utf8"));
  const headings = extractHeadings(body);

  const hasFaq = (faq?.length ?? 0) > 0 && /<Faq[\s/>]/.test(body);
  if (hasFaq && !headings.some((h) => h.id === FAQ_SECTION.id)) {
    headings.push({ ...FAQ_SECTION });
  }
  return headings;
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
  // `.mdx` isn't type-checked, so this cast is the one place the guide format is
  // asserted rather than proven — `scripts/validate-guides.ts` is what actually
  // checks a guide's meta block against `GuideMeta`.
  return { Content: mod.default, meta: mod.meta as GuideMeta };
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

/** Every guide on disk, newest first — drafts included. Deliberately NOT
 * exported: the only things that may reach a `noindex` guide are the article
 * route (by slug) and `generateStaticParams`, both of which go through
 * `loadGuide`/`guideSlugs`. Everything that *lists* guides goes through
 * `listedGuides` below, which is what makes "a draft can't leak into a listing"
 * a property of the module rather than a rule each consumer has to remember. */
function allGuides(): Promise<Guide[]> {
  return (guidesPromise ??= readAllGuides());
}

/** The publicly listed guides, newest first. The single read every consumer
 * goes through — the index, the category pages, related guides, the sitemap and
 * llms.txt. */
export async function listedGuides(): Promise<Guide[]> {
  return (await allGuides()).filter((g) => !g.meta.noindex);
}

/** A guide's primary category: the first id in `meta.categories`. It decides
 * where the guide is grouped on the index and which breadcrumb it gets. */
export const primaryCategoryOf = (guide: Guide): CategoryId =>
  guide.meta.categories[0];

/** Every guide *tagged* with `id` — primary or not — newest first. This is the
 * category page's list, and it's a superset of that category's index section. */
export async function guidesInCategory(id: CategoryId): Promise<Guide[]> {
  return (await listedGuides()).filter((g) => g.meta.categories.includes(id));
}

/** The /guias index, grouped by *primary* category so no guide is listed twice.
 * Sections come in registry order; a category no guide leads with is omitted.
 * `total` is the tagged count (what its category page will show), which is why
 * it can exceed `guides.length`. */
export async function guidesByPrimaryCategory(): Promise<
  { category: Category; guides: Guide[]; total: number }[]
> {
  const guides = await listedGuides();
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
 * newest other guides, so the block is never awkwardly short or empty.
 *
 * A draft isn't in the listed set, so it finds no `current` and suggests
 * nothing; `<RelatedGuides>` renders null for an empty list. Fine for a page
 * only its author is reading, and it keeps drafts from cross-linking. */
export async function relatedGuides(slug: string, limit = 3): Promise<Guide[]> {
  const guides = await listedGuides();
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
  const guides = await listedGuides();
  return CATEGORIES.filter((c) =>
    guides.some((g) => g.meta.categories.includes(c.id)),
  );
}

import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { MDXComponents } from "mdx/types";
import type { ComponentType } from "react";
import { sectionRepository } from "@/content-system/repository/sections";
import type { ContentDocument, ContentSummary } from "@/content-system/types";
import {
  extractHeadings,
  FAQ_SECTION,
  type Heading,
  SOURCES_SECTION,
} from "./headings";
import { mdxBody, readingStats } from "./mdx";

// The engine behind every *registry* content section — /estadisticas today,
// /investigacion beside it, and whatever comes next.
//
// ── Why this is a factory and not two copies ──────────────────────────────
// The two sections are the same machine pointed at different prose. Both
// register their pages explicitly, both address a page by a *path* rather than
// a flat slug, both author the same `export const meta = { … }` block, both
// build a breadcrumb by walking the prefixes, both feed the same sitemap, feed,
// llms.txt, social card and JSON-LD. What differs between them is a directory,
// a URL prefix and a handful of Spanish nouns — which is exactly the set of
// things `SectionConfig` below carries.
//
// The guides are deliberately NOT built on this. Their slugs are flat
// filenames, they're discovered by walking a directory rather than registered,
// and they carry categories instead of a hierarchy. Forcing them through here
// would mean a config field per difference and a section that is mostly
// exceptions.
//
// ── Why the slug is an array ──────────────────────────────────────────────
// A page's URL is a path, so a subject can grow from one page into a page per
// district without moving:
//
//   /estadisticas/inflacion-de-vivienda          ← national
//   /estadisticas/inflacion-de-vivienda/gba      ← one region
//
// Every intermediate segment must itself be a registered page, or the
// breadcrumb puts a link to a 404 in the trail — `assertHubs` fails the build
// instead.
//
// ── Why a registry instead of reading the directory ───────────────────────
// The path has levels, and a dynamic `import()` with a `/` in the interpolated
// part leans on bundler context-module behaviour that differs between webpack
// and Turbopack. An explicit list also gives each section its editorial
// ordering for free.

export type SectionMeta = {
  /** Page <h1> and, unless `titleTag` overrides it, the <title>. */
  title: string;
  /** Overrides `title` in <title> only, for a headline that reads well on the
   * page but doesn't survive a ~60-character search snippet. */
  titleTag?: string;
  /** <meta name="description"> + OG/Twitter description. */
  description: string;
  /** Social-card copy, when the click-hook wants to differ from search copy. */
  ogTitle?: string;
  ogDescription?: string;
  /** One figure printed under the headline on the generated social card — on
   * these pages the answer usually *is* a number ("+47,8 % interanual"). */
  ogStat?: string;
  /** Short blurb for the section index and for the parent page's child list. */
  summary: string;
  /** Optional 16:9 illustration: a path under
   * `/img/<section>/previews/`, shown as a thumbnail on the page's row in the
   * section index and in a hub's list of its children. Same field, same rule
   * and same reasoning as the guides' `preview` — including that it is
   * deliberately *not* rendered on the page itself, and that a page without one
   * gets the text-only row it has always had.
   *
   * What it should show is the section's own difference: these pages are charts
   * and maps, so the thumbnail is a small true rendering of the thing — the
   * city shaded by that page's own latest figures — rather than a decorative
   * object.
   *
   * A path and not a `{ src, alt }` pair because the thumbnail is decorative in
   * the accessibility sense: it renders `alt=""`, since the title beside it
   * already names the page. */
  preview?: string;
  /** One line of copy for the `<TopCta />` banner above the prose. */
  cta: string;
  /** SEO keywords for <meta name="keywords">. */
  keywords: string[];
  /** Full ISO 8601 timestamp with offset, e.g. "2026-08-10T09:00:00-03:00". */
  published: string;
  /** Same, for the last update. These pages are refreshed as the source
   * agencies publish, so this is the field that actually moves. */
  updated: string;
  /** Where the numbers come from. Rendered as the page's sources block (the
   * body places a bare `<Fuentes />`) and read by the Dataset JSON-LD. */
  sources: { label: string; href: string; note?: string }[];
  /** Describes the underlying data for the `Dataset` structured data — the
   * markup that lets these pages show up in Google's dataset search rather than
   * only as articles. */
  dataset: {
    /** Formal name of the series, as its publisher names it. */
    name: string;
    /** What one observation is, in a sentence. */
    description: string;
    /** ISO 8601 interval, e.g. "2020-01/2026-06". */
    temporalCoverage: string;
    /** Free text — "Argentina", "Ciudad Autónoma de Buenos Aires". */
    spatialCoverage: string;
    /** What each series measures, for `variableMeasured`. */
    variableMeasured: string[];
  };
  /** Optional Q&A block, rendered where the body places `<Faq />` and emitted
   * as FAQPage JSON-LD — one list feeds both, so the markup can never claim a
   * question the page doesn't visibly answer. Plain text: put links in the
   * prose so the rendered text and the schema text stay identical. */
  faq?: { q: string; a: string }[];
  /** Keep the page out of every listing and out of the sitemap. It still
   * renders at its URL, so a draft can be reviewed before it's announced. */
  noindex?: true;
};

// `.mdx` isn't type-checked and its ambient `meta` is `unknown` (see
// src/types/mdx.d.ts), so the shape is asserted once, where a module is loaded.
type Loader = () => Promise<{
  default: ComponentType<{ components?: MDXComponents }>;
  meta: unknown;
}>;

export type SectionEntry = {
  /** URL path under the section's base, one string per segment. */
  slug: string[];
  /** Short label for the breadcrumb and for listings — "Inflación", not the
   * full headline. */
  crumb: string;
  /** Path of the `.mdx`, relative to the section's directory. Kept explicitly
   * so the word count can read the file without re-deriving it from the slug. */
  file: string;
  load: Loader;
};

/** Everything that differs between one registry section and the next. Every
 * field here is either a location or a piece of Spanish the section says about
 * itself; nothing here is behaviour. */
export type SectionConfig = {
  /** Directory name under `src/content`. */
  id: string;
  /** Optional public URL segment when it differs from the source directory. */
  base?: string;
  /** What a reader calls the section: the eyebrow above a headline, the root
   * breadcrumb, the social card's kicker, the feed category. */
  label: string;
  /** The "back to the index" link at the foot of an article. */
  backLabel: string;
  /** The eyebrow on a `<PaginaRelacionada />` card pointing into this section. */
  relatedLabel: string;
  entries: SectionEntry[];
};

export type SectionPage = {
  slug: string[];
  crumb: string;
  meta: SectionMeta;
};

export type ContentSection = SectionConfig & {
  /** Site-relative base path, "/estadisticas". */
  base: string;
  /** `["alquiler","caba"]` → "alquiler/caba". The key every lookup is done by. */
  slugPath(slug: string[]): string;
  /** Site-relative href for a page. */
  href(slug: string[]): string;
  /** Every page's slug, for `generateStaticParams`. Drafts included: a
   * `noindex` page still has to render at its URL. */
  slugs(): string[][];
  /** Load one page's rendered component + metadata, or `null` when there is no
   * page a *public* reader may see there — unregistered, or a CMS row that is
   * still a draft. The lifecycle rule belongs to the repository, so this is the
   * one place it is applied and no route re-derives it.
   *
   * `document` is the stored row when the page came from the CMS, so a caller
   * that needs the body — reading time, table of contents — does not query for
   * it a second time. Absent for a page still served from the registry. */
  load(slug: string[]): Promise<{
    Content: ComponentType<{ components?: MDXComponents }>;
    meta: SectionMeta;
    crumb: string;
    document?: ContentDocument;
  } | null>;
  /** Words of real prose and the reading time in whole minutes. */
  readingStats(
    slug: string[],
    faq?: SectionMeta["faq"],
  ): { words: number; minutes: number };
  /** The sections of a page, for its table of contents. */
  headings(slug: string[], faq?: SectionMeta["faq"]): Heading[];
  /** The publicly listed pages, in registry order. */
  listed(): Promise<SectionPage[]>;
  /** The pages directly under `slug`. Pass `[]` for the top level. */
  children(slug: string[]): Promise<SectionPage[]>;
  /** The breadcrumb trail below the section index, page by page. */
  crumbs(slug: string[]): Promise<{ name: string; href: string }[]>;
};

export function createSection(config: SectionConfig): ContentSection {
  const { id, entries } = config;
  const base = `/${config.base ?? id}`;
  const dir = path.join(process.cwd(), "src/content", id);

  const slugPath = (slug: string[]): string => slug.join("/");
  const href = (slug: string[]): string => `${base}/${slugPath(slug)}`;
  const entryFor = (slug: string[]): SectionEntry | undefined =>
    entries.find((e) => slugPath(e.slug) === slugPath(slug));

  const metaFromDatabase = (document: ContentSummary): SectionMeta => ({
    title: document.title,
    ...(document.titleTag ? { titleTag: document.titleTag } : {}),
    description: document.description,
    summary: document.summary,
    cta: document.cta,
    keywords: document.metadata.keywords,
    published: document.publishedAt ?? document.contentUpdatedAt,
    updated: document.contentUpdatedAt,
    sources: document.metadata.sources ?? [],
    dataset: document.metadata.dataset ?? {
      name: document.title,
      description: document.description,
      temporalCoverage: document.contentUpdatedAt.slice(0, 7),
      spatialCoverage: "Argentina",
      variableMeasured: [],
    },
    ...(document.metadata.ogTitle
      ? { ogTitle: document.metadata.ogTitle }
      : {}),
    ...(document.metadata.ogDescription
      ? { ogDescription: document.metadata.ogDescription }
      : {}),
    ...(document.metadata.ogStat ? { ogStat: document.metadata.ogStat } : {}),
    ...(document.metadata.previewImage
      ? { preview: document.metadata.previewImage }
      : {}),
    ...(document.metadata.faq ? { faq: document.metadata.faq } : {}),
    ...(document.status !== "published" ? { noindex: true } : {}),
  });

  // Fails the build when a nested page has no parent page — see the note at the
  // top. Cheap, and the alternative is a breadcrumb that 404s.
  const known = new Set(entries.map((e) => slugPath(e.slug)));
  for (const { slug } of entries) {
    for (let i = 1; i < slug.length; i++) {
      const parent = slugPath(slug.slice(0, i));
      if (!known.has(parent)) {
        throw new Error(
          `${id}: /${slugPath(slug)} has no parent page at /${parent}. ` +
            `Every intermediate segment needs its own page.`,
        );
      }
    }
  }

  const sourceOf = (slug: string[]): string => {
    const entry = entryFor(slug);
    if (!entry) throw new Error(`${id}: unknown page /${slugPath(slug)}`);
    return fs.readFileSync(path.join(dir, entry.file), "utf8");
  };

  /** The cached, lifecycle-aware public reads for this section. */
  const repository = sectionRepository(id);

  /** Whether the CMS is this section's source of truth yet.
   *
   * The registry is kept through the migration as a rollback fixture (cms.md
   * §3.1), so both sources exist at once and something has to decide between
   * them. The rule is all-or-nothing per section: once a section has been
   * imported, the database answers every question about it, including "no". A
   * per-page fallback would mean unpublishing an imported page silently served
   * the `.mdx` still sitting on disk — the lifecycle would stop meaning
   * anything for exactly the pages that had been migrated. */
  const migrated = async (): Promise<boolean> =>
    (await repository?.hasContent()) ?? false;

  async function readAll(): Promise<SectionPage[]> {
    // Once a section has CMS rows, listings, breadcrumbs and every discovery
    // consumer read the same public repository as the article route.  The
    // registry remains only as an import/rollback fixture until Phase 12's
    // parity gate is complete.
    //
    // `listPubliclyRenderable` rather than `listPublished` because `crumbs()`
    // has to resolve the trail above a `preview` page too, and a preview URL is
    // meant to render completely. `listed()` below is what every *listing* goes
    // through, and it drops everything that is not published.
    if (await migrated()) {
      const stored = (await repository?.listPubliclyRenderable()) ?? [];
      return stored.map((document) => ({
        slug: document.slug.split("/"),
        crumb: document.crumb ?? document.title,
        meta: metaFromDatabase(document),
      }));
    }
    return Promise.all(
      entries.map(async ({ slug, crumb, load }) => {
        const { meta } = await load();
        return { slug, crumb, meta: meta as SectionMeta };
      }),
    );
  }

  // CMS content is mutable, so this intentionally has no process-lifetime
  // memo. The public repository owns visibility and its caller owns caching.
  const allPages = (): Promise<SectionPage[]> => readAll();

  /** Words of real prose and the reading time. The FAQ counts — it renders on
   * the page even though it lives in the stripped `meta` block. */
  function pageReadingStats(
    slug: string[],
    faq?: SectionMeta["faq"],
  ): { words: number; minutes: number } {
    return readingStats(
      sourceOf(slug),
      (faq ?? []).map(({ q, a }) => `${q} ${a}`),
    );
  }

  /** The single read every listing goes through, which is what keeps a draft
   * out of all of them at once. */
  const listed = async (): Promise<SectionPage[]> =>
    (await allPages()).filter((p) => !p.meta.noindex);

  return {
    ...config,
    base,
    slugPath,
    href,

    slugs: () => entries.map((e) => e.slug),

    async load(slug) {
      // Through the repository, never `documentFromDatabase`: that one answers
      // "whatever is stored", drafts included, and this is a public read. A
      // draft returns null here and the route turns it into the 404 cms.md §3.2
      // requires.
      if (await migrated()) {
        const stored = await repository?.getByPath(slugPath(slug));
        if (!stored) return null;
        // Lazy import so the component bindings the compiler pulls in are not
        // part of this module's initialization cycle.
        const { compileContent } =
          await import("@/content-system/render/renderContent");
        return {
          Content: await compileContent(stored.body, stored.section),
          meta: metaFromDatabase(stored),
          crumb: stored.crumb ?? stored.title,
          document: stored,
        };
      }

      const entry = entryFor(slug);
      if (!entry) return null;
      const mod = await entry.load();
      return {
        Content: mod.default,
        meta: mod.meta as SectionMeta,
        crumb: entry.crumb,
      };
    },

    readingStats: pageReadingStats,

    /** Every `##` in the body, with the id `rehype-slug` gave the rendered
     * heading.
     *
     * The FAQ and the sources block are appended too. Both read as sections
     * like any other, but neither has a `##` in the body — the author drops in
     * a bare tag and the route feeds it from `meta`. Each is added only when
     * the page both *has* the content and *places* the tag, and skipped if a
     * real heading already claimed its id, which would otherwise mean a
     * contents entry pointing at the wrong section. */
    headings(slug, faq) {
      const body = mdxBody(sourceOf(slug));
      const headings = extractHeadings(body);

      const appended: [boolean, Heading][] = [
        [(faq?.length ?? 0) > 0 && /<Faq[\s/>]/.test(body), FAQ_SECTION],
        [/<Fuentes[\s/>]/.test(body), SOURCES_SECTION],
      ];
      for (const [present, section] of appended) {
        if (present && !headings.some((h) => h.id === section.id)) {
          headings.push({ ...section });
        }
      }
      return headings;
    },

    listed,

    async children(slug) {
      const pages = await listed();
      return pages.filter(
        (p) =>
          p.slug.length === slug.length + 1 &&
          slugPath(p.slug.slice(0, slug.length)) === slugPath(slug),
      );
    },

    /** `Alquiler / CABA` — the trail *below* the section index, which the
     * routes prepend themselves. Every prefix is a real page (see the hub
     * assertion above), so every crumb links somewhere. */
    async crumbs(slug) {
      const pages = await allPages();
      return slug.map((_, i) => {
        const prefix = slug.slice(0, i + 1);
        const page = pages.find((p) => slugPath(p.slug) === slugPath(prefix));
        return {
          // The hub assertion guarantees the lookup hits; the fallback keeps
          // this total rather than asserting a second time.
          name: page?.crumb ?? prefix[i],
          href: href(prefix),
        };
      });
    },
  };
}

import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { MDXComponents } from "mdx/types";
import type { ComponentType } from "react";
import {
  extractHeadings,
  FAQ_SECTION,
  type Heading,
  SOURCES_SECTION,
} from "../headings";
import { mdxBody, readingStats } from "../mdx";

// Build-time access to the /estadisticas pages. Same authoring format as the
// guides — an `export const meta = { … }` block on top of a markdown body — but
// a different URL shape, and that difference is the whole point of this module.
//
// ── Why the slug is an array ───────────────────────────────────────────────
// A guide is one flat slug under /guias. A statistic has a natural hierarchy:
// the country-level page, then the same statistic per province or city.
//
//   /estadisticas/inflacion              ← national
//   /estadisticas/alquiler               ← national
//   /estadisticas/alquiler/caba          ← one district
//   /estadisticas/alquiler/santa-cruz
//
// So a page's slug is a path (`["alquiler", "caba"]`), the route is a catch-all,
// and the breadcrumb trail is built by walking the prefixes. Every intermediate
// segment must itself be a registered page — `/estadisticas/alquiler/caba` with
// no `/estadisticas/alquiler` would put a crumb in the trail that 404s, so
// `assertHubs` below fails the build instead.
//
// ── Why a registry instead of reading the directory ───────────────────────
// The guides walk their content dir and `import()` by slug, which works because
// their slugs are flat filenames. Here the path has levels, and a dynamic import
// with a `/` in the interpolated part leans on bundler context-module behaviour
// that differs between webpack and Turbopack. The list below is explicit, which
// also gives the section its editorial ordering for free — and a statistics page
// (a dataset, its charts, its methodology) is a big enough thing to be worth one
// line in a registry.

export type StatsMeta = {
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
  /** One figure printed under the headline on the generated social card — for
   * these pages the answer usually *is* a number ("+47,8 % interanual"). */
  ogStat?: string;
  /** Short blurb for the section index and for the parent page's child list. */
  summary: string;
  /** One line of copy for the `<TopCta />` banner above the prose. */
  cta: string;
  /** SEO keywords for <meta name="keywords">. */
  keywords: string[];
  /** Full ISO 8601 timestamp with offset, e.g. "2026-08-10T09:00:00-03:00". */
  published: string;
  /** Same, for the last update. These pages are refreshed monthly as INDEC
   * publishes, so this is the field that actually moves. */
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

type Entry = {
  /** URL path under /estadisticas, one string per segment. */
  slug: string[];
  /** Short label for the breadcrumb and for listings — "Inflación", not the
   * full headline. */
  crumb: string;
  /** Path of the `.mdx`, relative to this directory. Kept explicitly so the
   * word count can read the file without re-deriving it from the slug. */
  file: string;
  load: Loader;
};

/** Every statistics page, in the order the index lists them. Adding one means
 * adding its `.mdx` and one entry here. */
const ENTRIES: Entry[] = [
  {
    slug: ["inflacion-de-vivienda"],
    crumb: "Inflación de vivienda",
    file: "inflacion-de-vivienda.mdx",
    load: () => import("./inflacion-de-vivienda.mdx"),
  },
  // The six regions, in the order INDEC lists them — which is also the order the
  // hub's own charts and tables use, so a reader moving between the two never
  // has to re-learn where a region sits.
  {
    slug: ["inflacion-de-vivienda", "gba"],
    crumb: "GBA",
    file: "inflacion-de-vivienda/gba.mdx",
    load: () => import("./inflacion-de-vivienda/gba.mdx"),
  },
  {
    slug: ["inflacion-de-vivienda", "pampeana"],
    crumb: "Pampeana",
    file: "inflacion-de-vivienda/pampeana.mdx",
    load: () => import("./inflacion-de-vivienda/pampeana.mdx"),
  },
  {
    slug: ["inflacion-de-vivienda", "noreste"],
    crumb: "Noreste",
    file: "inflacion-de-vivienda/noreste.mdx",
    load: () => import("./inflacion-de-vivienda/noreste.mdx"),
  },
  {
    slug: ["inflacion-de-vivienda", "noroeste"],
    crumb: "Noroeste",
    file: "inflacion-de-vivienda/noroeste.mdx",
    load: () => import("./inflacion-de-vivienda/noroeste.mdx"),
  },
  {
    slug: ["inflacion-de-vivienda", "cuyo"],
    crumb: "Cuyo",
    file: "inflacion-de-vivienda/cuyo.mdx",
    load: () => import("./inflacion-de-vivienda/cuyo.mdx"),
  },
  {
    slug: ["inflacion-de-vivienda", "patagonia"],
    crumb: "Patagonia",
    file: "inflacion-de-vivienda/patagonia.mdx",
    load: () => import("./inflacion-de-vivienda/patagonia.mdx"),
  },
  // Flat rather than ["venta", "caba"]: the series is CABA-only, and a national
  // `/estadisticas/venta` hub with one child and nothing of its own to say is a
  // doorway. If a province ever publishes a comparable series, this becomes
  // `venta/caba` plus a permanent redirect from here.
  {
    slug: ["precio-m2-caba"],
    crumb: "Precio del m² en CABA",
    file: "precio-m2-caba.mdx",
    load: () => import("./precio-m2-caba.mdx"),
  },
  // The other half of the same question, and flat for the same reason: the
  // series is CABA-only. The two link to each other with <PaginaRelacionada />.
  {
    slug: ["alquiler-caba"],
    crumb: "Alquileres en CABA",
    file: "alquiler-caba.mdx",
    load: () => import("./alquiler-caba.mdx"),
  },
  // The other question about the same market: not what a flat costs but
  // whether there is one. Flat for the same reason as its neighbours, and next
  // to the rent page because the two are read together — that one can only
  // colour the barrios with enough listings to price, and this one covers all
  // 48 because a total is never suppressed.
  {
    slug: ["oferta-alquiler-caba"],
    crumb: "Oferta de alquiler",
    file: "oferta-alquiler-caba.mdx",
    load: () => import("./oferta-alquiler-caba.mdx"),
  },
  // The same series as the page above, read down its time axis instead of
  // across its map — and the one page in the section that is a history rather
  // than a lookup. Directly after the map it shares a dataset with, so a reader
  // who has just found their barrio can carry on into what happened to it.
  {
    slug: ["historia-oferta-alquiler-caba"],
    crumb: "Historia de la oferta",
    file: "historia-oferta-alquiler-caba.mdx",
    load: () => import("./historia-oferta-alquiler-caba.mdx"),
  },
  // The two price pages above, divided. Last because it depends on both: it publishes no
  // series of its own, and its page is largely about the arithmetic joining
  // them. Flat for the same reason as its two inputs.
  {
    slug: ["rentabilidad-alquiler-caba"],
    crumb: "Rentabilidad del alquiler",
    file: "rentabilidad-alquiler-caba.mdx",
    load: () => import("./rentabilidad-alquiler-caba.mdx"),
  },
];

const DIR = path.join(process.cwd(), "src/content/estadisticas");

/** A slug array as it appears in a URL: `["alquiler","caba"]` → "alquiler/caba".
 * Also the key every lookup here is done by. */
export const slugPath = (slug: string[]): string => slug.join("/");

/** Site-relative href for a page. */
export const statsHref = (slug: string[]): string =>
  `/estadisticas/${slugPath(slug)}`;

/** Fails the build when a nested page has no parent page — see the note at the
 * top. Cheap, and the alternative is a breadcrumb that 404s. */
function assertHubs(): void {
  const known = new Set(ENTRIES.map((e) => slugPath(e.slug)));
  for (const { slug } of ENTRIES) {
    for (let i = 1; i < slug.length; i++) {
      const parent = slugPath(slug.slice(0, i));
      if (!known.has(parent)) {
        throw new Error(
          `estadisticas: /${slugPath(slug)} has no parent page at /${parent}. ` +
            `Every intermediate segment needs its own page.`,
        );
      }
    }
  }
}
assertHubs();

export type StatsPage = {
  slug: string[];
  crumb: string;
  meta: StatsMeta;
  readingMinutes: number;
};

const entryFor = (slug: string[]): Entry | undefined =>
  ENTRIES.find((e) => slugPath(e.slug) === slugPath(slug));

/** Every page's slug, for `generateStaticParams`. Drafts included: a `noindex`
 * page still has to render at its URL. */
export const statsSlugs = (): string[][] => ENTRIES.map((e) => e.slug);

/** Load one page's rendered component + metadata. `Content` takes the standard
 * MDX `components` prop, which the route uses to bind the components that need
 * to know which page they're on (`<Faq />`, `<Fuentes />`). */
export async function loadStatsPage(slug: string[]): Promise<{
  Content: ComponentType<{ components?: MDXComponents }>;
  meta: StatsMeta;
  crumb: string;
} | null> {
  const entry = entryFor(slug);
  if (!entry) return null;
  const mod = await entry.load();
  return {
    Content: mod.default,
    meta: mod.meta as StatsMeta,
    crumb: entry.crumb,
  };
}

const sourceOf = (slug: string[]): string => {
  const entry = entryFor(slug);
  if (!entry) throw new Error(`estadisticas: unknown page /${slugPath(slug)}`);
  return fs.readFileSync(path.join(DIR, entry.file), "utf8");
};

/** Words of real prose and the reading time in whole minutes. The FAQ counts —
 * it renders on the page even though it lives in the stripped `meta` block. */
export function statsStats(
  slug: string[],
  faq?: StatsMeta["faq"],
): { words: number; minutes: number } {
  return readingStats(
    sourceOf(slug),
    (faq ?? []).map(({ q, a }) => `${q} ${a}`),
  );
}

/** The sections of a page, for its table of contents: every `##` in the body,
 * with the id `rehype-slug` gave the rendered heading.
 *
 * The FAQ and the sources block are appended too. Both read as sections like any
 * other, but neither has a `##` in the body — the author drops in a bare tag and
 * the route feeds it from `meta`. Each is added only when the page both *has*
 * the content and *places* the tag, and skipped if a real heading already
 * claimed its id, which would otherwise mean a contents entry pointing at the
 * wrong section. */
export function statsHeadings(
  slug: string[],
  faq?: StatsMeta["faq"],
): Heading[] {
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
}

async function readAll(): Promise<StatsPage[]> {
  return Promise.all(
    ENTRIES.map(async ({ slug, crumb, load }) => {
      const { meta } = await load();
      return {
        slug,
        crumb,
        meta: meta as StatsMeta,
        readingMinutes: statsStats(slug, (meta as StatsMeta).faq).minutes,
      };
    }),
  );
}

// Memoized for the lifetime of the process, like the guides': the content is
// baked in at build time and can't change under us, and every listing (the
// index, a hub's child list, the sitemap, llms.txt) would otherwise re-import
// every compiled MDX module just to reach `meta`.
let pagesPromise: Promise<StatsPage[]> | undefined;

function allPages(): Promise<StatsPage[]> {
  return (pagesPromise ??= readAll());
}

/** The publicly listed pages, in registry order. The single read every listing
 * goes through, which is what keeps a draft out of all of them at once. */
export async function listedStatsPages(): Promise<StatsPage[]> {
  return (await allPages()).filter((p) => !p.meta.noindex);
}

/** The pages directly under `slug` — the children a hub page lists. Pass `[]`
 * for the top level, which is what the section index shows. */
export async function statsChildren(slug: string[]): Promise<StatsPage[]> {
  const pages = await listedStatsPages();
  return pages.filter(
    (p) =>
      p.slug.length === slug.length + 1 &&
      slugPath(p.slug.slice(0, slug.length)) === slugPath(slug),
  );
}

/** The breadcrumb trail for a page, from the section index down to the page
 * itself: `Estadísticas / Alquiler / CABA`. Every prefix is a real page (see
 * `assertHubs`), so every crumb links somewhere. */
export async function statsCrumbs(
  slug: string[],
): Promise<{ name: string; href: string }[]> {
  const pages = await allPages();
  return slug.map((_, i) => {
    const prefix = slug.slice(0, i + 1);
    const page = pages.find((p) => slugPath(p.slug) === slugPath(prefix));
    return {
      // `assertHubs` guarantees the lookup hits; the fallback keeps this total
      // rather than asserting a second time.
      name: page?.crumb ?? prefix[i],
      href: statsHref(prefix),
    };
  });
}

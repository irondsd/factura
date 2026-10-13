import type { MetadataRoute } from "next";
import { CONTRACT_TYPES, contractPath } from "@/lib/rental-contract/model";
import {
  nonEmptyCategories,
  publishedGuides,
} from "@/content-system/repository/guias";
import { SECTIONS } from "@/content/sections";
import { nonEmptyContentCategories } from "@/content-system/repository/categories";
import { nonEmptyContentLocations } from "@/content-system/repository/locations";
import { contentTag, locationsTag } from "@/content-system/repository/tags";
import {
  cachedAtVersion,
  everyVersion,
  publicContentVersions,
} from "@/content-system/repository/versions";
import { CONTENT_SECTIONS } from "@/content-system/types";
import {
  contentCategoryUrl,
  guideCategoryUrl,
  guidesIndexUrl,
  guideUrl,
  localeUrl,
  normativaUrl,
  sectionIndexUrl,
  sectionUrl,
  locationsIndexUrl,
  locationUrl,
} from "@/i18n/metadata";

// Only genuinely public marketing pages belong here. The product app has its
// own origin and sitemap policy. Each landing page exists in both languages:
// the Spanish (canonical) URL is listed
// with `hreflang` alternates so Google indexes the English (/en) version too.
const LANDING: {
  path: string;
  changeFrequency: "weekly" | "monthly";
  priority: number;
}[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/probar", changeFrequency: "weekly", priority: 0.9 },
  { path: "/docs", changeFrequency: "weekly", priority: 0.8 },
  { path: "/faq", changeFrequency: "weekly", priority: 0.8 },
  { path: "/demo", changeFrequency: "weekly", priority: 0.8 },
  { path: "/demo/insights", changeFrequency: "weekly", priority: 0.8 },
  { path: "/demo/bills", changeFrequency: "weekly", priority: 0.8 },
  { path: "/glosario", changeFrequency: "monthly", priority: 0.7 },
  { path: "/contacto", changeFrequency: "monthly", priority: 0.5 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.5 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.5 },
  { path: "/security", changeFrequency: "monthly", priority: 0.5 },
];

// How long a generated sitemap may stand before it is rebuilt regardless of
// tags. The tags are the update path: a publish expires `content:<section>`,
// this route inherits that tag from the reads below, and the next request
// re-renders it within seconds. This line bounds how long a render that went
// wrong anyway can survive.
//
// It used to bound nothing. A route does re-render on this TTL, but every read
// below was a `revalidate: false` entry private to this route's bundle
// (`@/content-system/repository/versions` has the mechanism), still valid on a
// plain TTL expiry — so the re-render re-serialised whatever those entries
// held. On 2026-09-02 that kept a guide out of the sitemap until the next
// unrelated publish; on 2026-10-12 it froze the sitemap at its 14:52 build for
// nine hours, missing seven proveedores and a guía published since. Each piece below is now cached *at a fingerprint of what it lists*,
// read fresh on every render, so a re-render — for whatever reason — that finds
// the content changed reads the database instead of the stale entry. The cost
// is that one small query per render, and a piece is only re-read when its own
// section moved.
export const revalidate = 3600;

// The newest of a set of content timestamps, as an ISO string (the pieces below
// are cached as JSON, where a `Date` would not survive), or `undefined` when
// there is nothing to date. Every listing page below takes its `lastModified` from the
// pages it lists, and that list can come back empty even for a category the
// category query just called non-empty. `Math.max()` of nothing is `-Infinity`,
// and a `Date` built from that throws `RangeError: Invalid time value` when the
// sitemap is serialised — aborting `next build` with a message that names
// neither the section nor the category.
//
// The disagreement that produced it is fixed at the source: the page list
// behind `nonEmptyCategories()` used to be an *uncached* query run beside the
// cached one this route reads, so the two saw different moments by
// construction. Both now come from one cache entry (`repository/categories.ts`).
// The guard stays because omitting the date is the honest answer anyway, by the
// rule below, and a crash in a sitemap is a poor way to learn otherwise.
function newestDate(timestamps: readonly string[]): string | undefined {
  const newest = Math.max(...timestamps.map((t) => Date.parse(t)));
  return Number.isFinite(newest) ? new Date(newest).toISOString() : undefined;
}

/** One instant, normalised the way `newestDate` normalises a set of them. */
const isoDate = (timestamp: string): string =>
  new Date(timestamp).toISOString();

// `lastModified` is only ever a real content date here, never the time the
// sitemap happened to be generated. A file that stamps "modified just now" on
// every fetch teaches Google that its `lastmod` is noise, and Google then
// discounts the field for the whole sitemap — including the section pages
// below, where the date is the entire point of listing them. A page with no
// content timestamp of its own omits `lastModified` rather than inventing one;
// an absent date costs nothing, a false one costs the pages that tell the truth.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Read before anything else, and never from a cache: see `revalidate` above.
  const versions = await publicContentVersions();

  const landing: MetadataRoute.Sitemap = LANDING.map(
    ({ path, changeFrequency, priority }) => ({
      url: localeUrl(path, "es"),
      changeFrequency,
      priority,
      alternates: {
        languages: {
          "es-AR": localeUrl(path, "es"),
          en: localeUrl(path, "en"),
          "x-default": localeUrl(path, "es"),
        },
      },
    }),
  );

  // Guides are Spanish-only: no hreflang alternates (no /en counterpart exists).
  const guidesEntries = await cachedAtVersion(
    ["sitemap", "guias"],
    versions.guias,
    [contentTag("guias")],
    async (): Promise<MetadataRoute.Sitemap> => {
      const [guides, categories] = await Promise.all([
        publishedGuides(),
        nonEmptyCategories(),
      ]);
      return [
        // A listing page's date is the newest thing it lists — same rule as the
        // category hubs below, applied across every guide instead of one category.
        {
          url: guidesIndexUrl,
          lastModified: newestDate(guides.map((g) => g.contentUpdatedAt)),
          changeFrequency: "weekly",
          priority: 0.7,
        },
        // Category hubs sit between the index and the articles: they're listing
        // pages, so `lastModified` tracks the newest guide they contain.
        ...categories.map((c) => {
          const inCategory = guides.filter((g) =>
            g.metadata.categories.includes(c.key),
          );
          return {
            url: guideCategoryUrl(c.slug),
            // Compare instants: `updated` carries a timezone offset, so two
            // timestamps don't necessarily order the same way as their text.
            lastModified: newestDate(inCategory.map((g) => g.contentUpdatedAt)),
            changeFrequency: "weekly" as const,
            priority: 0.65,
          };
        }),
        // A sitemap should list canonical URLs and nothing else. `listedGuides` has
        // already dropped the drafts; what's left to exclude is a guide that points
        // its canonical at another one — submitting it here would ask Google to
        // index the very copy the tag says isn't the one.
        ...guides
          .filter((g) => !g.canonicalSlug)
          .map((g) => ({
            url: guideUrl(g.slug),
            lastModified: isoDate(g.contentUpdatedAt),
            changeFrequency: "monthly" as const,
            priority: 0.6,
          })),
      ];
    },
  );

  // The registry sections — /estadisticas and /investigaciones — Spanish-only like
  // the guides. `lastModified` is `meta.updated` and that's load-bearing here:
  // these pages gain a data point every month, and the date is how a crawler
  // learns to come back.
  //
  // Ranked a notch above the guides at every level — index 0.8 against 0.7, leaf
  // 0.7 against 0.6. Priority is only ever a hint about *relative* importance
  // within this file, and the honest ordering is that these pages are the ones
  // worth crawling first: they carry data published nowhere else in this form,
  // they change monthly, and they're what another site would cite. A guide
  // explaining what expensas are is worth having and is not that.
  const sectionEntries: MetadataRoute.Sitemap = (
    await Promise.all(
      SECTIONS.map((section) =>
        cachedAtVersion(
          ["sitemap", section.id],
          versions[section.id],
          [contentTag(section.id)],
          async (): Promise<MetadataRoute.Sitemap> => {
            const [pages, categories] = await Promise.all([
              section.listed(),
              nonEmptyContentCategories(section.id),
            ]);
            return [
              {
                url: sectionIndexUrl(section.id),
                lastModified: newestDate(pages.map((p) => p.meta.updated)),
                changeFrequency: "monthly" as const,
                priority: 0.8,
              },
              ...categories.map((category) => {
                const inCategory = pages.filter((page) =>
                  page.meta.categoryKeys.includes(category.key),
                );
                return {
                  url: contentCategoryUrl(section.id, category.slug),
                  lastModified: newestDate(
                    inCategory.map((page) => page.meta.updated),
                  ),
                  changeFrequency: "weekly" as const,
                  priority: 0.72,
                };
              }),
              ...pages.map((p) => ({
                url: sectionUrl(section.id, p.slug),
                lastModified: isoDate(p.meta.updated),
                changeFrequency: "monthly" as const,
                priority: 0.7,
              })),
            ];
          },
        ),
      ),
    )
  ).flat();

  // Spanish-only like the guides, so no hreflang alternates. No `lastModified`
  // at all: the registry has no per-norm timestamp, and what changes on this
  // page is a status flipping, which is a redeploy either way.
  const normativa: MetadataRoute.Sitemap = [
    {
      url: normativaUrl,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];

  // A location hub lists pages from every section, so its piece moves with any
  // of them as well as with the registry itself.
  const locationEntries = await cachedAtVersion(
    ["sitemap", "locations"],
    everyVersion(versions),
    [locationsTag, ...CONTENT_SECTIONS.map(contentTag)],
    async (): Promise<MetadataRoute.Sitemap> => {
      const locations = await nonEmptyContentLocations();
      return locations.length
        ? [
            {
              url: locationsIndexUrl,
              // The directory changes when either one of its entries changes or
              // an article listed under one does. A renamed/reworded location is a
              // significant visible change even when all its articles are older.
              lastModified: newestDate(
                locations.flatMap((location) => [
                  location.updatedAt,
                  ...location.pages.map((page) => page.contentUpdatedAt),
                ]),
              ),
              changeFrequency: "weekly" as const,
              priority: 0.7,
            },
            ...locations.map((location) => ({
              url: locationUrl(location.slug),
              lastModified: newestDate([
                location.updatedAt,
                ...location.pages.map((page) => page.contentUpdatedAt),
              ]),
              changeFrequency: "weekly" as const,
              priority: 0.68,
            })),
          ]
        : [];
    },
  );

  // The data sections ahead of the guides, matching both the priorities above
  // and the nav order. Order carries no formal weight in the protocol, but it's
  // the reading order of anyone — or anything — walking the file top to bottom.
  return [
    ...landing,
    ...CONTRACT_TYPES.map((type) => ({
      url: localeUrl(contractPath(type), "es"),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...sectionEntries,
    ...guidesEntries,
    ...locationEntries,
    ...normativa,
  ];
}

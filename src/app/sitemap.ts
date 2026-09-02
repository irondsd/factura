import type { MetadataRoute } from "next";
import {
  nonEmptyCategories,
  publishedGuides,
} from "@/content-system/repository/guias";
import { SECTIONS } from "@/content/sections";
import { nonEmptyContentCategories } from "@/content-system/repository/categories";
import { nonEmptyContentLocations } from "@/content-system/repository/locations";
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
// tags. Everything this file reads is cached with `revalidate: false` and
// expires only on `revalidateTag` (`@/cms/server/invalidation`), and so, until
// this line, was the sitemap's own entry — which made one bad render permanent.
//
// It is worth being precise about what "bad render" means, because the tags are
// not the part that is broken. A route does inherit the tags of the cached
// reads it ran — `unstable_cache` pushes them onto the work unit, so this entry
// genuinely carries `content:guias` and the rest. What a tag cannot express is
// an *order*: expiring one buys no promise that the route re-renders after the
// entries it reads have been expired, only that it re-renders. Publishing a
// guide on 2026-09-02 purged this route and re-rendered it 25 seconds later
// against a `publishedGuides` entry that had not caught up, and the result — a
// sitemap missing the page that triggered it — was then served as a fresh
// `HIT` until the next unrelated publish. /llms.txt and /guias, which happened
// to re-render later in the same minute, were correct throughout.
//
// So this is a repair floor, not the update path: a publish still reaches the
// sitemap in seconds through the tag, and this only bounds how long a render
// that lost the race can survive. An hour, which is what the section reads
// themselves used to carry (`repository/sections.ts`) before on-demand
// invalidation replaced it. The cost is one rewrite of a ~35 KB file per hour,
// and no database work at all: on a plain TTL expiry every read below is still
// a valid cache entry, so the re-render is a re-serialisation.
export const revalidate = 3600;

// The newest of a set of content timestamps, or `undefined` when there is
// nothing to date. Every listing page below takes its `lastModified` from the
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
function newestDate(timestamps: readonly string[]): Date | undefined {
  const newest = Math.max(...timestamps.map((t) => Date.parse(t)));
  return Number.isFinite(newest) ? new Date(newest) : undefined;
}

// `lastModified` is only ever a real content date here, never the time the
// sitemap happened to be generated. A file that stamps "modified just now" on
// every fetch teaches Google that its `lastmod` is noise, and Google then
// discounts the field for the whole sitemap — including the section pages
// below, where the date is the entire point of listing them. A page with no
// content timestamp of its own omits `lastModified` rather than inventing one;
// an absent date costs nothing, a false one costs the pages that tell the truth.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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
  const [guides, categories] = await Promise.all([
    publishedGuides(),
    nonEmptyCategories(),
  ]);
  const guidesEntries: MetadataRoute.Sitemap = [
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
        lastModified: new Date(g.contentUpdatedAt),
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
  ];

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
      SECTIONS.map(async (section) => {
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
            lastModified: new Date(p.meta.updated),
            changeFrequency: "monthly" as const,
            priority: 0.7,
          })),
        ];
      }),
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

  const locations = await nonEmptyContentLocations();
  const locationEntries: MetadataRoute.Sitemap = locations.length
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

  // The data sections ahead of the guides, matching both the priorities above
  // and the nav order. Order carries no formal weight in the protocol, but it's
  // the reading order of anyone — or anything — walking the file top to bottom.
  return [
    ...landing,
    ...sectionEntries,
    ...guidesEntries,
    ...locationEntries,
    ...normativa,
  ];
}

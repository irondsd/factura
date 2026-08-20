import type { MetadataRoute } from "next";
import {
  nonEmptyCategories,
  publishedGuides,
} from "@/content-system/repository/guias";
import { SECTIONS } from "@/content/sections";
import {
  guideCategoryUrl,
  guidesIndexUrl,
  guideUrl,
  localeUrl,
  normativaUrl,
  sectionIndexUrl,
  sectionUrl,
} from "@/i18n/metadata";

// Only genuinely public, logged-out-visible pages belong here. The
// authenticated app (everything under /app) is `noindex`. Each
// landing page exists in both languages: the Spanish (canonical) URL is listed
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
  { path: "/security", changeFrequency: "monthly", priority: 0.5 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const landing: MetadataRoute.Sitemap = LANDING.map(
    ({ path, changeFrequency, priority }) => ({
      url: localeUrl(path, "es"),
      lastModified: now,
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
    {
      url: guidesIndexUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    // Category hubs sit between the index and the articles: they're listing
    // pages, so `lastModified` tracks the newest guide they contain.
    ...categories.map((c) => {
      const inCategory = guides.filter((g) =>
        g.metadata.categories.includes(c.id),
      );
      // Compare instants: `updated` carries a timezone offset, so two
      // timestamps don't necessarily order the same way as their text.
      const newest = Math.max(
        ...inCategory.map((g) => Date.parse(g.contentUpdatedAt)),
      );
      return {
        url: guideCategoryUrl(c.id),
        lastModified: new Date(newest),
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
        const pages = await section.listed();
        return [
          {
            url: sectionIndexUrl(section.id),
            lastModified: pages.length
              ? new Date(
                  Math.max(...pages.map((p) => Date.parse(p.meta.updated))),
                )
              : now,
            changeFrequency: "monthly" as const,
            priority: 0.8,
          },
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

  // Spanish-only like the guides, so no hreflang alternates. `now` rather than
  // a content date: the registry has no per-norm timestamp, and what changes on
  // this page is a status flipping, which is a redeploy either way.
  const normativa: MetadataRoute.Sitemap = [
    {
      url: normativaUrl,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];

  // The data sections ahead of the guides, matching both the priorities above
  // and the nav order. Order carries no formal weight in the protocol, but it's
  // the reading order of anyone — or anything — walking the file top to bottom.
  return [...landing, ...sectionEntries, ...guidesEntries, ...normativa];
}

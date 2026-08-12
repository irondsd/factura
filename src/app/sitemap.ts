import type { MetadataRoute } from "next";
import { listedStatsPages } from "@/content/estadisticas/pages";
import { listedGuides, nonEmptyCategories } from "@/content/guias/guides";
import {
  guideCategoryUrl,
  guidesIndexUrl,
  guideUrl,
  localeUrl,
  statsIndexUrl,
  statsUrl,
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
    listedGuides(),
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
      const inCategory = guides.filter((g) => g.meta.categories.includes(c.id));
      // Compare instants: `updated` carries a timezone offset, so two
      // timestamps don't necessarily order the same way as their text.
      const newest = Math.max(
        ...inCategory.map((g) => Date.parse(g.meta.updated)),
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
      .filter((g) => !g.meta.canonical)
      .map((g) => ({
        url: guideUrl(g.slug),
        lastModified: new Date(g.meta.updated),
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
  ];

  // Statistics pages, Spanish-only like the guides. `lastModified` is
  // `meta.updated` and that's load-bearing here: these pages gain a data point
  // every month, and the date is how a crawler learns to come back.
  const stats = await listedStatsPages();
  const statsEntries: MetadataRoute.Sitemap = [
    {
      url: statsIndexUrl,
      lastModified: stats.length
        ? new Date(Math.max(...stats.map((p) => Date.parse(p.meta.updated))))
        : now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...stats.map((p) => ({
      url: statsUrl(p.slug),
      lastModified: new Date(p.meta.updated),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];

  return [...landing, ...guidesEntries, ...statsEntries];
}

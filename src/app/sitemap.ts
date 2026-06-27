import type { MetadataRoute } from "next";
import { localeUrl } from "@/i18n/metadata";

// Only genuinely public, logged-out-visible pages belong here. The
// authenticated app (everything under /app) is disallowed in robots.ts. Each
// landing page exists in both languages: the Spanish (canonical) URL is listed
// with `hreflang` alternates so Google indexes the English (/en) version too.
const LANDING: {
  path: string;
  changeFrequency: "weekly" | "monthly";
  priority: number;
}[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/docs", changeFrequency: "weekly", priority: 0.8 },
  { path: "/faq", changeFrequency: "weekly", priority: 0.8 },
  { path: "/demo", changeFrequency: "weekly", priority: 0.8 },
  { path: "/demo/insights", changeFrequency: "weekly", priority: 0.8 },
  { path: "/demo/bills", changeFrequency: "weekly", priority: 0.8 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.5 },
  { path: "/security", changeFrequency: "monthly", priority: 0.5 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return LANDING.map(({ path, changeFrequency, priority }) => ({
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
  }));
}

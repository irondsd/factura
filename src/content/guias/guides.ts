import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { ComponentType } from "react";

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

/** Load a single guide's rendered component + metadata by slug. */
export async function loadGuide(
  slug: string,
): Promise<{ Content: ComponentType; meta: GuideMeta }> {
  const mod = await import(`@/content/guias/${slug}.mdx`);
  return { Content: mod.default, meta: mod.meta };
}

/** All guides with metadata, newest first. Used by the index and the sitemap. */
export async function allGuides(): Promise<Guide[]> {
  const guides = await Promise.all(
    guideSlugs().map(async (slug) => ({
      slug,
      meta: (await loadGuide(slug)).meta,
    })),
  );
  return guides.sort((a, b) => b.meta.published.localeCompare(a.meta.published));
}

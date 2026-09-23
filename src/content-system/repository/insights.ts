import "server-only";
import { desc } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { cmsInsights } from "@/db/schema";
import { resolveInsightCards } from "../insights/resolve";
import type { ContentInsight, InsightCard } from "../insights/types";
import { CONTENT_SECTIONS, type ContentSection } from "../types";
import { contentCategories, publishedContent } from "./categories";
import { insightsTag } from "./tags";

// The public read of «destacados».
//
// Two cached reads meet here, and each keeps its own tag. The insight rows are
// cached under `content:insights`, which the CMS expires on every insight
// write. The pages they point at come from the sections' own cached lists, under
// `content:<section>` — so a rename, a recategorisation or an unpublish reaches
// the rail through the same invalidation that already rebuilds the section
// index, with nothing here to keep in sync.

/** At most this many cards per rail. The rail scrolls, but a reader who has
 * paged through a dozen headlines is not looking for the thirteenth. */
const MAX_CARDS = 12;

const iso = (value: Date): string => value.toISOString();

const readInsights = unstable_cache(
  async (): Promise<ContentInsight[]> => {
    // CI builds render without a database, like the other public reads.
    if (process.env.CI_CONTENT_FIXTURES === "1") return [];
    const { db } = await import("@/db");
    const rows = await db
      .select()
      .from(cmsInsights)
      .orderBy(desc(cmsInsights.date), desc(cmsInsights.createdAt));
    return rows.map((row) => ({
      ...row,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    }));
  },
  ["content", "insights"],
  { revalidate: false, tags: [insightsTag] },
);

async function cardsFor(
  sections: readonly ContentSection[],
  keep: (insight: ContentInsight) => boolean,
): Promise<InsightCard[]> {
  const insights = (await readInsights()).filter(keep);
  // No insights, no page reads — and no section tags picked up for nothing.
  if (insights.length === 0) return [];

  const [pages, categories] = await Promise.all([
    Promise.all(sections.map((s) => publishedContent(s))),
    Promise.all(sections.map((s) => contentCategories(s))),
  ]);
  return resolveInsightCards(
    insights,
    new Map(sections.map((s, i) => [s, pages[i]])),
    new Map(sections.map((s, i) => [s, categories[i]])),
  ).slice(0, MAX_CARDS);
}

/** The rail on one section's index: every insight whose page is a published
 * page of that section. */
export const sectionInsights = (section: ContentSection) =>
  cardsFor([section], () => true);

/** The homepage rail: insights marked «página principal», from any section. */
export const homepageInsights = () =>
  cardsFor(CONTENT_SECTIONS, (insight) => insight.onHomepage);

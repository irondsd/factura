import type { ContentCategory } from "../categories/types";
import type { ContentSection, ContentSummary } from "../types";
import type { ContentInsight, InsightCard } from "./types";

/** Turn stored insights into cards by joining each to its page.
 *
 * Pure, so the rule is testable without a database: the caller hands in the
 * *published* pages of every section it cares about, and an insight whose page
 * is not among them — a draft, a preview, a page in another section — simply
 * does not become a card. That is what makes the lifecycle rule hold here by
 * construction rather than by a `where` clause: the page lists come from the
 * public repository, which never returns anything unpublished.
 *
 * Newest first, ties broken by id so the order is total. */
export function resolveInsightCards(
  insights: readonly ContentInsight[],
  pages: ReadonlyMap<ContentSection, readonly ContentSummary[]>,
  categories: ReadonlyMap<ContentSection, readonly ContentCategory[]>,
): InsightCard[] {
  const byId = new Map<string, ContentSummary>();
  for (const list of pages.values()) {
    for (const page of list) byId.set(page.id, page);
  }

  return insights
    .flatMap((insight): InsightCard[] => {
      const page = byId.get(insight.pageId);
      if (!page) return [];
      const primary = page.metadata.categories[0];
      const category = primary
        ? categories.get(page.section)?.find((c) => c.key === primary)
        : undefined;
      return [
        {
          id: insight.id,
          title: insight.title,
          body: insight.body,
          date: insight.date,
          section: page.section,
          href: `/${page.section}/${page.slug}`,
          category: category?.label ?? null,
        },
      ];
    })
    .sort((a, b) =>
      a.date === b.date
        ? a.id.localeCompare(b.id)
        : b.date.localeCompare(a.date),
    );
}

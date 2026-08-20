import { ContentList } from "@/components/article/ContentList";
import type { ContentSummary } from "@/content-system/types";

/** Thin guide adapter over the shared content row. Publication date is shown
 * without a prefix; statistics and research label their update date instead. */
export function GuideList({
  guides,
  titleAs = "h2",
}: {
  guides: ContentSummary[];
  titleAs?: "h2" | "h3";
}) {
  return (
    <ContentList
      titleAs={titleAs}
      items={guides.map((guide) => ({
        key: guide.slug,
        href: `/guias/${guide.slug}`,
        title: guide.title,
        summary: guide.summary,
        previewMediaId: guide.metadata.previewMediaId,
        preview: guide.metadata.previewImage,
        date: guide.publishedAt ?? guide.contentUpdatedAt,
      }))}
    />
  );
}

import { ContentList } from "@/components/article/ContentList";
import type { ContentSummary } from "@/content-system/types";

/** Thin guide adapter over the shared content row. Every listing uses the
 * editorial update timestamp, so its visible date agrees with its ordering. */
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
      datePrefix="Actualizado el "
      items={guides.map((guide) => ({
        key: guide.slug,
        href: `/guias/${guide.slug}`,
        title: guide.title,
        summary: guide.summary,
        previewMediaId: guide.metadata.previewMediaId,
        date: guide.contentUpdatedAt,
      }))}
    />
  );
}

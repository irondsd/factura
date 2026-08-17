import { ContentList } from "@/components/article/ContentList";
import type { Guide } from "@/content/guias/guides";

/** Thin guide adapter over the shared content row. Publication date is shown
 * without a prefix; statistics and research label their update date instead. */
export function GuideList({
  guides,
  titleAs = "h2",
}: {
  guides: Guide[];
  titleAs?: "h2" | "h3";
}) {
  return (
    <ContentList
      titleAs={titleAs}
      items={guides.map((guide) => ({
        key: guide.slug,
        href: `/guias/${guide.slug}`,
        title: guide.meta.title,
        summary: guide.meta.summary,
        preview: guide.meta.preview,
        date: guide.meta.published,
      }))}
    />
  );
}

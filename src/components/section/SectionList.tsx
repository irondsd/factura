import { ContentList } from "@/components/article/ContentList";
import type { ContentSection, SectionPage } from "@/content/section";

/** Registry-section adapter over the shared content row. These pages are
 * refreshed with their datasets, so the listing leads with the update date. */
export function SectionList({
  section,
  pages,
  titleAs = "h2",
}: {
  section: ContentSection;
  pages: SectionPage[];
  titleAs?: "h2" | "h3";
}) {
  return (
    <ContentList
      titleAs={titleAs}
      datePrefix="Actualizado el "
      items={pages.map((page) => ({
        key: section.href(page.slug),
        href: section.href(page.slug),
        title: page.meta.title,
        summary: page.meta.summary,
        preview: page.meta.preview,
        date: page.meta.updated,
      }))}
    />
  );
}

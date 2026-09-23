import {
  homepageInsights,
  sectionInsights,
} from "@/content-system/repository/insights";
import type { ContentSection } from "@/content-system/types";
import { InsightsRail } from "./InsightsRail";

// The server halves of the rail: fetch the right cards, hand them to the
// client component. Both render nothing when there is nothing to show, so a
// page can place one unconditionally.

/** Every published insight of one section — the rail on its index. */
export async function SectionInsights({
  section,
  title,
  className,
}: {
  section: ContentSection;
  title: string;
  className?: string;
}) {
  const insights = await sectionInsights(section);
  return (
    <InsightsRail title={title} insights={insights} className={className} />
  );
}

/** The insights marked «página principal», from every section. */
export async function HomepageInsights({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  const insights = await homepageInsights();
  return (
    <InsightsRail title={title} insights={insights} className={className} />
  );
}

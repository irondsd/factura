import type { ContentSection, ContentStatus } from "@/content-system/types";

/** One page an insight can point at, as the CMS picker and list show it. The
 * category is resolved on the server, the same way the public card resolves
 * it: the label of the first category key in the page's metadata. */
export type InsightPageOption = {
  id: string;
  section: ContentSection;
  title: string;
  slug: string;
  status: ContentStatus;
  category: string | null;
};

import type { ContentSection } from "../types";

/** A section-owned taxonomy entry. `key` is stored in page metadata and never
 * changes; `slug` is the public address and may be renamed by a person. */
export type ContentCategory = {
  id: string;
  section: ContentSection;
  key: string;
  slug: string;
  label: string;
  title: string;
  description: string;
  sortOrder: number;
  lockVersion: number;
  createdBy: string | null;
  updatedBy: string | null;
  retiredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContentCategoryWithUsage = ContentCategory & {
  usageCount: number;
};

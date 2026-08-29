import type { ContentSection, ContentStatus, ContentSummary } from "../types";

/** A global geographic taxonomy entry. `key` is revision data; `slug` is its
 * editable public address. */
export type ContentLocation = {
  id: string;
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

export type ContentLocationWithUsage = ContentLocation & {
  usageCount: number;
  /** Active CMS pointers that prevent retirement. The manager renders these so
   * an editor can fix the exact pages instead of hunting for a raw count. */
  usage?: {
    id: string;
    section: ContentSection;
    slug: string;
    title: string;
    status: ContentStatus;
  }[];
};

export type LocationSectionCount = Record<ContentSection, number>;

export type NonEmptyContentLocation = ContentLocation & {
  total: number;
  counts: LocationSectionCount;
  pages: ContentSummary[];
};

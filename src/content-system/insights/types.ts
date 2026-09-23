import type { ContentSection } from "../types";

/** One «destacado» as stored: the row the CMS writes and the public read model
 * reads. Shared here, like `ContentCategory`, because neither side owns it.
 *
 * It carries a page id and nothing else about the page. The section, the
 * address and the category are resolved from that page when the card renders —
 * see `cms_insight` in the schema for why none of them is copied. */
export type ContentInsight = {
  id: string;
  pageId: string;
  title: string;
  body: string;
  /** Calendar day, `YYYY-MM-DD`. */
  date: string;
  onHomepage: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/** What one card on the public site renders, with the page already resolved.
 * Only insights whose page is currently published ever become one of these. */
export type InsightCard = {
  id: string;
  title: string;
  body: string;
  date: string;
  section: ContentSection;
  /** The page's current public path. */
  href: string;
  /** Label of the page's primary category — the first key in its metadata —
   * or null when it has none, or none that is still active. */
  category: string | null;
};

/** Field limits, shared by the CMS form and the service that enforces them.
 * Sized to the card: a title wraps to about four lines at 28 characters, and
 * the body is a caption, not a paragraph. */
export const INSIGHT_LIMITS = { title: 90, body: 160 } as const;

/** A `date` column value rendered through the content date formatters, which
 * read an instant. Noon in Buenos Aires keeps the day from sliding back one in
 * the site's own time zone, which a bare `YYYY-MM-DD` (UTC midnight) would. */
export const insightInstant = (date: string): string =>
  `${date}T12:00:00-03:00`;

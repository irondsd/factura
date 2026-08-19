import { extractHeadings, FAQ_SECTION, type Heading } from "@/content/headings";
import { readingStats } from "@/content/mdx";
import type { ContentDocument, ContentSummary } from "./types";

// The derived facts a rendered page needs that are not columns: its table of
// contents and its reading time.
//
// The filesystem registry computes both by reading the `.mdx` file off disk
// (`guideHeadings`, `guideStats`) — a `readFileSync` per request. A database
// document already holds its body, so these take the document and nothing else,
// which is also what lets the CMS preview compute them for unsaved-but-stored
// content without a second source of truth.

/** The sections of a page, for its contents column: every `##` in the body, in
 * order, with the id `rehype-slug` gives the rendered heading.
 *
 * The FAQ is appended when the page has questions *and* places `<Faq />`,
 * because it reads as a section like any other even though its heading is not
 * in the body. Dropped if a real heading already claimed that id, which would
 * otherwise mean a contents entry pointing at the wrong section. Same rule as
 * `guideHeadings`, restated against a document rather than a file. */
export function documentHeadings(
  document: Pick<ContentDocument, "body" | "metadata">,
): Heading[] {
  const headings = extractHeadings(document.body);
  const faq = document.metadata?.faq ?? [];
  const placesFaq = faq.length > 0 && /<Faq[\s/>]/.test(document.body);
  if (placesFaq && !headings.some((h) => h.id === FAQ_SECTION.id)) {
    headings.push({ ...FAQ_SECTION });
  }
  return headings;
}

/** Words of real prose and the reading time in whole minutes. The FAQ counts:
 * it is metadata rather than body, but it renders on the page like any other
 * prose and six questions are a couple of minutes of reading. */
export function documentStats(
  document: Pick<ContentDocument, "body" | "metadata">,
): { words: number; minutes: number } {
  return readingStats(
    document.body,
    (document.metadata?.faq ?? []).map(({ q, a }) => `${q} ${a}`),
  );
}

/** Pages to suggest at the foot of `document`, best match first.
 *
 * Ranked by shared categories, with a tiebreak bonus for sharing the primary
 * one, then newest first; topped up with the newest others so the block is
 * never awkwardly short. The same ranking `relatedGuides` applies on the
 * filesystem, over whatever set the caller passes — which is how the CMS
 * preview shows a real block instead of an empty one, and how the public page
 * will after the cutover.
 *
 * The caller decides what `candidates` contains, and that is where the
 * lifecycle rule lives: a public page passes published pages only. */
export function relatedDocuments(
  document: Pick<ContentSummary, "slug" | "metadata">,
  candidates: readonly ContentSummary[],
  limit = 3,
): ContentSummary[] {
  const categories = document.metadata?.categories ?? [];
  const others = candidates.filter((page) => page.slug !== document.slug);

  const shared = (page: ContentSummary) =>
    (page.metadata?.categories ?? []).filter((c) => categories.includes(c))
      .length;

  const ranked = others
    .filter((page) => shared(page) > 0)
    .map((page) => ({
      page,
      score:
        shared(page) +
        ((page.metadata?.categories ?? [])[0] === categories[0] ? 0.5 : 0),
    }))
    .sort(
      (a, b) =>
        b.score - a.score || publishedTime(b.page) - publishedTime(a.page),
    )
    .map((entry) => entry.page);

  if (ranked.length >= limit) return ranked.slice(0, limit);

  const filler = others.filter((page) => !ranked.includes(page));
  return [...ranked, ...filler].slice(0, limit);
}

const publishedTime = (page: ContentSummary): number =>
  Date.parse(page.publishedAt ?? page.contentUpdatedAt);

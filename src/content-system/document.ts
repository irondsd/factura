import {
  extractHeadings,
  FAQ_SECTION,
  type Heading,
  SOURCES_SECTION,
} from "@/content/headings";
import type { ContentDocument, ContentSummary } from "./types";

const WORDS_PER_MINUTE = 200;

function countWords(body: string): number {
  const prose = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^#{1,6}[ \t]+/gm, " ")
    .replace(/^[ \t]*[-*>][ \t]+/gm, " ")
    .replace(/^[ \t]*\|.*\|[ \t]*$/gm, (row) => row.replace(/[|-]/g, " "))
    .replace(/[*_~]/g, " ");
  return prose.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

// The derived facts a rendered page needs that are not columns: its table of
// contents and its reading time.
//
// The filesystem registry computes both by reading the `.mdx` file off disk
// (`guideHeadings`, `guideStats`) — a `readFileSync` per request. A database
// document already holds its body, so these take the document and nothing else,
// which is also what lets the CMS preview compute them for unsaved-but-stored
// content without a second source of truth.

/** The sections of a page, for its contents column: every `##` in the body, in
 * order, with the id `rehype-slug` gives the rendered heading, plus the two
 * blocks whose heading lives in metadata rather than in the body.
 *
 * The same rule the filesystem registry applies (`ContentSection.headings`),
 * restated against a document rather than a file — and it has to stay the same,
 * because these two are what a page's contents column is built from on either
 * side of the migration. */
export function documentHeadings(
  document: Pick<ContentDocument, "body" | "metadata">,
): Heading[] {
  const headings = extractHeadings(document.body);

  // Two blocks whose heading is not in the body: the author drops in a bare tag
  // and the route feeds it from metadata. Each is listed only when the page
  // both *places* the tag and *has* the content — `<Faq />` and `<Fuentes />`
  // each render nothing when their list is empty, and a contents entry linking
  // to a section that isn't there is worse than no entry.
  const appended: [boolean, Heading][] = [
    [
      (document.metadata?.faq?.length ?? 0) > 0 &&
        /<Faq[\s/>]/.test(document.body),
      FAQ_SECTION,
    ],
    [
      (document.metadata?.sources?.length ?? 0) > 0 &&
        /<Fuentes[\s/>]/.test(document.body),
      SOURCES_SECTION,
    ],
  ];

  for (const [present, section] of appended) {
    // Skipped if a real heading already claimed the id, which would otherwise
    // mean a contents entry pointing at the wrong section.
    if (present && !headings.some((h) => h.id === section.id)) {
      headings.push({ ...section });
    }
  }

  return headings;
}

/** Words of real prose and the reading time in whole minutes. The FAQ counts:
 * it is metadata rather than body, but it renders on the page like any other
 * prose and six questions are a couple of minutes of reading. */
export function documentStats(
  document: Pick<ContentDocument, "body" | "metadata">,
): { words: number; minutes: number } {
  const words =
    countWords(document.body) +
    (document.metadata?.faq ?? []).reduce(
      (total, { q, a }) => total + countWords(`${q} ${a}`),
      0,
    );
  return { words, minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)) };
}

/** Pages to suggest at the foot of `document`, best match first.
 *
 * Ranked by shared categories, with a tiebreak bonus for sharing the primary
 * one, then most recently updated first; topped up with the freshest others so the block is
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
      (a, b) => b.score - a.score || updatedTime(b.page) - updatedTime(a.page),
    )
    .map((entry) => entry.page);

  if (ranked.length >= limit) return ranked.slice(0, limit);

  const filler = others.filter((page) => !ranked.includes(page));
  return [...ranked, ...filler].slice(0, limit);
}

const updatedTime = (page: ContentSummary): number =>
  Date.parse(page.contentUpdatedAt);

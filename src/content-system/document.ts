import {
  extractHeadings,
  FAQ_SECTION,
  type Heading,
  METHODOLOGY_SECTION,
  SOURCES_SECTION,
} from "@/content/headings";
import {
  type ContentDocument,
  type ContentSummary,
  methodologyEntries,
} from "./types";

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
 * order, with the id `rehype-slug` gives the rendered heading, plus the three
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

  // Three blocks whose heading is not in the body: the author drops in a bare
  // tag and the route feeds it from metadata. Each is listed only when the page
  // both *places* the tag and *has* the content — `<Metodologia />`, `<Faq />`
  // and `<Fuentes />` each render nothing when their data is empty, and a
  // contents entry linking to a section that isn't there is worse than no
  // entry.
  //
  // In this order because it is the order the three belong in: how the numbers
  // were made, then the questions about them, then where to go and check. A
  // body that places them in another order gets these three entries in this
  // one, which is the same simplification that has always applied to the pair.
  const appended: [boolean, Heading][] = [
    [
      methodologyEntries(document.metadata?.methodology).length > 0 &&
        /<Metodologia[\s/>]/.test(document.body),
      METHODOLOGY_SECTION,
    ],
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
 * prose and six questions are a couple of minutes of reading. The methodology
 * block counts for the same reason, and comes to a paragraph at most. */
export function documentStats(
  document: Pick<ContentDocument, "body" | "metadata">,
): { words: number; minutes: number } {
  const words =
    countWords(document.body) +
    (document.metadata?.faq ?? []).reduce(
      (total, { q, a }) => total + countWords(`${q} ${a}`),
      0,
    ) +
    methodologyEntries(document.metadata?.methodology).reduce(
      (total, { text }) => total + countWords(text),
      0,
    );
  return { words, minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)) };
}

/** The location key for content that applies to the whole country. */
const NATIONWIDE = "argentina";

/** Pages to suggest at the foot of `document`, best match first.
 *
 * Location first: a reader of a Mendoza water guide cares about Mendoza's
 * electricity company, not three random distributors from across the country.
 * So a candidate qualifies only if it shares one of the page's locations, and
 * after those come nationwide (`argentina`) pages, which apply to everyone.
 * Nothing else qualifies. A province with too few guides gets a short list,
 * and a page with no match gets none, which hides the block. Neighbouring
 * provinces are deliberately not a tier.
 *
 * Within each tier, pages sharing more categories come first, with a bonus for
 * sharing the primary one. Equal scores are ordered by `pairOrder`, a hash of
 * the two slugs, and never by date.
 *
 * That tiebreak is a cost decision. It used to be "most recently updated
 * first", which put whatever was published or edited last into the rail of
 * every guide it tied with — ~35 pages on average, 53 at worst — and each of
 * those is a changed page Vercel bills as an ISR write (8 KB units, identical
 * regenerations free). With a pair hash an edit moves no other rail at all, and
 * a new guide lands in ~3. Scoping by location keeps it there: a new Mendoza
 * guide can only enter Mendoza rails, plus the rare short one that tops up
 * with nationwide pages.
 *
 * The caller decides what `candidates` contains, and that is where the
 * lifecycle rule lives: a public page passes published pages only. */
export function relatedDocuments(
  document: Pick<ContentSummary, "slug" | "metadata">,
  candidates: readonly ContentSummary[],
  limit = 3,
): ContentSummary[] {
  const categories = document.metadata?.categories ?? [];
  const locations = document.metadata?.locations ?? [];

  const tier = (page: ContentSummary): number | null => {
    const theirs = page.metadata?.locations ?? [];
    if (theirs.some((l) => locations.includes(l))) return 0;
    if (theirs.includes(NATIONWIDE)) return 1;
    return null;
  };

  const score = (page: ContentSummary): number => {
    const theirs = page.metadata?.categories ?? [];
    return (
      theirs.filter((c) => categories.includes(c)).length +
      (theirs[0] === categories[0] ? 0.5 : 0)
    );
  };

  return candidates
    .filter((page) => page.slug !== document.slug)
    .flatMap((page) => {
      const t = tier(page);
      return t === null ? [] : [{ page, tier: t, score: score(page) }];
    })
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        b.score - a.score ||
        pairOrder(document.slug, a.page.slug) -
          pairOrder(document.slug, b.page.slug),
    )
    .slice(0, limit)
    .map((entry) => entry.page);
}

/** A stable pseudo-random rank for `candidate` as seen from `from` (32-bit
 * FNV-1a). Stable, so a rail only changes when its own inputs do; per pair
 * rather than per candidate, so each page gets a different pick from the same
 * tied pool. */
function pairOrder(from: string, candidate: string): number {
  let hash = 0x811c9dc5;
  const key = `${from}\u0000${candidate}`;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

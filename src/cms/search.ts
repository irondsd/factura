import type { ContentSection, ContentStatus } from "@/content-system/types";
import { CMS_SECTIONS } from "./sections";

// The CMS's one search: every section at once, title and body together.
//
// It replaces the per-section box that used to sit next to the status filters.
// That box could only ever answer "is this in the section I am already looking
// at", which is the question an editor least often has — the useful one is
// "where did we write about the medidor", and answering it meant opening four
// lists in turn and searching each. So the search moved into the header, where
// it is reachable from every screen, and widened to the whole console.
//
// Unlike the list filters this is *not* URL state. A list you can bookmark is
// worth the query string it costs; a search you ran once on your way to a page
// is not, and putting it in the URL would mean a navigation (and a full server
// render) before the first result could be drawn.
//
// This module is the pure half — what a search *is*, and how a hit is rendered
// — so both the server action and the browser overlay share one definition and
// neither needs a database to be tested.

/** Sections a search can look in: the ones with an editor behind them. A
 * planned section has no pages, so offering its chip would be offering a filter
 * that can only ever return nothing. */
export const CMS_SEARCHABLE_SECTIONS = CMS_SECTIONS.filter(
  (section) => section.status === "live",
);

/** Shorter than this and every page in the console matches. Two characters is
 * also what makes «AI» and «m2» searchable, which one more would not. */
export const MIN_CMS_SEARCH_LENGTH = 2;

/** How many hits one search answers with. Well above the number of pages that
 * exist today, so the cap is a guard against a one-letter term rather than
 * something an editor is expected to hit; when it does bite, the overlay says
 * so instead of silently showing a prefix. */
export const CMS_SEARCH_LIMIT = 40;

/** The sections a search should actually query.
 *
 * Anything unrecognised is dropped rather than refused — the list comes from
 * chips the editor toggled, and a section id that no longer exists is a stale
 * tab, not an attack. An empty result means "no section selected", which the
 * caller reports as such: it is a state the overlay lets you reach by turning
 * every chip off, and it must not quietly become "search everything". */
export function normalizeSearchSections(
  ids: readonly string[],
): ContentSection[] {
  return CMS_SEARCHABLE_SECTIONS.filter((section) =>
    ids.includes(section.id),
  ).map((section) => section.id);
}

/** Whether a term is worth sending to the server at all. */
export const isSearchableTerm = (term: string): boolean =>
  term.trim().length >= MIN_CMS_SEARCH_LENGTH;

/** One row of results, as the overlay draws it.
 *
 * A deliberately flat shape rather than the `ContentSummary` the section list
 * renders: this crosses a server-action boundary, and everything the row shows
 * — including who last touched it — is resolved on the server, where the
 * lookups can be batched across the whole result set. */
export type CmsSearchHitView = {
  id: string;
  section: ContentSection;
  slug: string;
  title: string;
  status: ContentStatus;
  /** A saved working copy sits behind the page's status — the same distinction
   * the section list draws with its «Borrador guardado» line. */
  hasWip: boolean;
  updatedAt: string;
  /** The account behind the last edit, already resolved to something readable.
   * Null when the column was never written or the account is gone. */
  updatedBy: string | null;
  /** Where the term was found. A body-only hit is the one that needs its
   * excerpt to explain itself, and the one the old per-section box could never
   * find at all. */
  inTitle: boolean;
  /** Text around the first body occurrence, or null when the body has none. */
  excerpt: string | null;
};

export type CmsSearchResponse = {
  /** Echoed back so a late-arriving response can be matched to the box's
   * current contents rather than overwriting a newer search. */
  term: string;
  hits: CmsSearchHitView[];
  /** Whether the cap above cut the answer short. */
  truncated: boolean;
};

/** A run of text, and whether it is part of what was searched for. */
export type SearchSegment = { text: string; match: boolean };

/**
 * Split `text` around every case-insensitive occurrence of `term`, so a row can
 * mark the matches without the caller building a regular expression out of
 * whatever was typed. A term is a literal here — `.` and `(` are characters an
 * editor searches for, not syntax.
 */
export function highlightSegments(text: string, term: string): SearchSegment[] {
  const needle = term.trim().toLowerCase();
  if (!needle || !text) return [{ text, match: false }];

  const haystack = text.toLowerCase();
  const segments: SearchSegment[] = [];
  let cursor = 0;

  for (;;) {
    const at = haystack.indexOf(needle, cursor);
    if (at === -1) break;
    if (at > cursor) {
      segments.push({ text: text.slice(cursor, at), match: false });
    }
    segments.push({ text: text.slice(at, at + needle.length), match: true });
    cursor = at + needle.length;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), match: false });
  }
  return segments;
}

/**
 * Make a slice of stored MDX readable on one or two lines.
 *
 * The excerpt is cut out of the source by character offset, so it starts and
 * ends mid-anything: half a heading's `##`, a stray `|` from a table row, the
 * hard line breaks that make a paragraph. Collapsing the whitespace is what
 * turns that into a sentence; the ellipses say that both ends were cut, which
 * they always were unless the match sat at the very start of the body.
 */
export function tidyExcerpt(raw: string, atStart: boolean): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return "";
  return `${atStart ? "" : "…"}${text}…`;
}

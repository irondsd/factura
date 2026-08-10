// Reading an `.mdx` file as *prose* — the bits both content sections need, and
// neither of them should own. `guias` and `estadisticas` are authored the same
// way (an `export const meta = { … }` block on top of a markdown body), so the
// word count, the reading time and the "where does the body start" question have
// exactly one answer for both.
//
// Deliberately NOT `server-only`, and free of `node:fs`: this takes source text
// and returns numbers, which is what lets the validator script import it too.

/** Strip the `meta` export off the front of an article's source, leaving the
 * prose. Brace-matched rather than regexed so an object literal in the body
 * can't cut the article short. */
export function mdxBody(source: string): string {
  const marker = source.match(/export\s+const\s+meta\s*=\s*/);
  if (!marker || marker.index === undefined) return source;
  const open = source.indexOf("{", marker.index);
  if (open === -1) return source;

  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(i + 1);
  }
  return source;
}

/** Words a reader actually reads: prose only, with code, image URLs, JSX tags
 * and markdown scaffolding removed. Link *text* counts, link targets don't. */
export function countWords(body: string): number {
  const prose = body
    .replace(/```[\s\S]*?```/g, " ") // fenced code
    .replace(/`[^`]*`/g, " ") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → their text
    .replace(/<[^>]+>/g, " ") // JSX / HTML tags
    .replace(/^#{1,6}[ \t]+/gm, " ") // heading markers
    .replace(/^[ \t]*[-*>][ \t]+/gm, " ") // list bullets, quotes
    .replace(/^[ \t]*\|.*\|[ \t]*$/gm, (row) => row.replace(/[|-]/g, " ")) // table pipes
    .replace(/[*_~]/g, " "); // emphasis

  return prose.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

// Spanish informational prose, read a bit more carefully than a novel because of
// the tables and step lists. Silent-reading research puts general Spanish text
// near 260 wpm; 200 is the deliberate discount for this material. One constant —
// change it here if the estimates feel off.
const WORDS_PER_MINUTE = 200;

/** How long an article is: words of real prose, and the reading time in whole
 * minutes (never below 1). Both come off one read of the file, because the
 * article routes need both — the minutes for the dateline, the words for the
 * Article JSON-LD.
 *
 * `extra` is prose that renders on the page but isn't in the body: the FAQ,
 * which lives in the `meta` block `mdxBody` strips, and (on a statistics page)
 * the chart captions the figures print. Callers already hold that text, so
 * threading it through beats re-parsing the meta block here. */
export function readingStats(
  source: string,
  extra: string[] = [],
): { words: number; minutes: number } {
  const words =
    countWords(mdxBody(source)) +
    extra.reduce((n, text) => n + countWords(text), 0);
  return { words, minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)) };
}

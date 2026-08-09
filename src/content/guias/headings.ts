import GithubSlugger from "github-slugger";

// The guide table of contents, derived from the article itself. Nothing is
// declared in an `.mdx` file: the `##` headings an author already writes *are*
// the contents, so a guide can't drift out of sync with its own outline.
//
// The ids have to match the ones in the rendered HTML exactly or every link
// points at nothing, and those come from `rehype-slug` (see next.config.ts),
// which slugs with this same `github-slugger`. Two rules keep the two in step:
// a fresh slugger per document, and *every* heading level fed through it in
// document order — the slugger dedupes by appending `-1`, `-2`, … so an h3
// sharing an h2's text shifts the suffix on a later duplicate. Filtering to h2
// before slugging would silently drift.

export type GuideHeading = {
  /** The `id` rehype-slug puts on the rendered heading. */
  id: string;
  /** Heading text, inline markdown removed. */
  text: string;
};

/** The FAQ block, which is a section of the article like any other but isn't in
 * the MDX body — the author drops in a bare `<Faq />` and the route feeds it
 * `meta.faq`. Its id is fixed rather than slugged because `Faq` has to render
 * the same one; `guideHeadings` skips the entry outright in the (unlikely) case
 * that a real heading already claimed it. */
export const FAQ_SECTION = {
  id: "preguntas-frecuentes",
  text: "Preguntas frecuentes",
} as const;

/** ATX heading: `## Text`, with markdown's optional closing run of `#`. */
const HEADING_RE = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;

/** Opening or closing fence of a code block. */
const FENCE_RE = /^[ \t]*(```|~~~)/;

/** The text a reader sees, given a heading's markdown source. Mirrors what
 * rehype-slug slugs, which is the *text content* of the compiled heading —
 * emphasis markers and link targets are gone by then, link text is not. */
function headingText(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images → alt text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → their text
    .replace(/`([^`]*)`/g, "$1") // inline code
    .replace(/[*_~]/g, "") // emphasis
    .replace(/\s+/g, " ")
    .trim();
}

/** The h2 headings of a guide body, in document order, with the ids they carry
 * in the rendered page.
 *
 * Expects the body with its `export const meta` block already stripped; see
 * `guideBody` in ./guides.ts. */
export function extractHeadings(body: string): GuideHeading[] {
  const slugger = new GithubSlugger();
  const headings: GuideHeading[] = [];
  let fenced = false;

  for (const line of body.split("\n")) {
    if (FENCE_RE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;

    const match = HEADING_RE.exec(line);
    if (!match) continue;

    const text = headingText(match[2]);
    if (!text) continue;

    // Every level is slugged, only h2 is kept — see the note at the top.
    const id = slugger.slug(text);
    if (match[1].length === 2) headings.push({ id, text });
  }

  return headings;
}

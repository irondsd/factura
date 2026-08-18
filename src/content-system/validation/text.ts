// Spanish keyword matching, shared by the content validators.
//
// Moved out of `scripts/lib/content.ts` in Phase 4 so the same code serves the
// CLI, the CMS and the MCP — the alternative was two implementations of "does
// the title contain this keyword", which would drift and produce different
// warnings for the same guide depending on who asked.
//
// Pure string work: no I/O, no filesystem, no MDX.

/** Lowercase, strip accents — so "cómo leer la factura" matches a keyword
 * written "como leer la factura". */
export const fold = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

// Spanish function words, dropped before matching a keyword against the copy:
// they're the words a search phrase omits and a written sentence keeps. Words of
// three characters or fewer are dropped too, which covers de/la/el/en/y/al.
const KEYWORD_STOPWORDS = new Set([
  "como",
  "con",
  "cual",
  "del",
  "las",
  "los",
  "mas",
  "para",
  "por",
  "que",
  "sus",
  "una",
  "uno",
]);

// Spanish inflection, crudely. A keyword is a noun phrase ("aumento de gas en
// mendoza") and a sentence conjugates it ("cuánto aumentaron … el gas"), so the
// two say the same word in different shapes and a substring match sees none of
// it. Longest ending first, and only when what's left is still long enough to be
// the word — "bajar" minus "ar" is "baj", which matches half the dictionary,
// which is why the stem has a floor and that keyword is still reported.
const KEYWORD_SUFFIXES = [
  "aciones",
  "acion",
  "amiento",
  "imiento",
  "iendo",
  "ieron",
  "ando",
  "aron",
  "ados",
  "adas",
  "idos",
  "idas",
  "ado",
  "ido",
  "es",
  "os",
  "as",
  "ar",
  "er",
  "ir",
  "a",
  "e",
  "o",
  "s",
];
const MIN_STEM = 5;

const stem = (w: string): string => {
  for (const suffix of KEYWORD_SUFFIXES) {
    if (w.endsWith(suffix) && w.length - suffix.length >= MIN_STEM) {
      return w.slice(0, -suffix.length);
    }
  }
  return w;
};

/** The words of `keyword` that appear in none of `shown` (the rendered title and
 * the description — the two things a search result puts on screen). Matched word
 * by word rather than as a phrase: "deuda de patentes caba" is the same target
 * as "Deuda de patentes en CABA", and a phrase match would flag every one of
 * those and teach everyone to ignore the warning. Each word is matched on its
 * stem for the same reason. */
export function missingKeywordWords(
  keyword: string,
  ...shown: string[]
): string[] {
  const haystack = fold(shown.join(" "));
  return fold(keyword)
    .split(/\s+/)
    .filter((w) => w.length > 2 && !KEYWORD_STOPWORDS.has(w))
    .filter((w) => !haystack.includes(stem(w)));
}

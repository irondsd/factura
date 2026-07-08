/** The built-in, translatable parser categories. Stored as a canonical
 * lowercase key on `parser_configs.category`; human labels are resolved through
 * i18n (`parsers.categories.<key>`), so the app stays es-first.
 *
 * `category` is a free-text column, so users can also store an arbitrary custom
 * string (picked via the builder's "Other" option) — those render literally and
 * are NOT translatable, by design. A null category is treated as "Other". */
export const PARSER_CATEGORIES = [
  "electricity",
  "gas",
  "water",
  "expensas",
  "internet",
  "tv",
  "mobile",
  "tax",
  "insurance",
  "rent",
] as const;

export type ParserCategory = (typeof PARSER_CATEGORIES)[number];

export function isParserCategory(v: unknown): v is ParserCategory {
  return (
    typeof v === "string" &&
    (PARSER_CATEGORIES as readonly string[]).includes(v)
  );
}

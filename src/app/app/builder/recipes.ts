// Regex toolkit recipes (left column of the builder) plus the match helpers
// the toolkit uses to live-probe the active bill text.

// `id` keys the display label + hint in the dictionary (builder.toolkit.items);
// `groupId` keys the group title (builder.toolkit.groups). Patterns stay here.
export type Recipe = {
  id: string;
  pattern: string;
  flags?: string;
};

export const REGEX_RECIPES: { groupId: string; items: Recipe[] }[] = [
  {
    groupId: "Amounts",
    items: [
      {
        id: "latam",
        pattern: "(?:\\$\\s*)?((?:\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:,\\d{2})?)",
      },
      {
        id: "intl",
        pattern: "(?:\\$\\s*)?((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{2})?)",
      },
      {
        id: "whole",
        pattern: "\\$?\\s*(\\d{1,3}(?:\\.\\d{3})+)",
      },
      {
        id: "afterLabel",
        pattern: "Total\\s*a\\s*pagar\\s*:?\\s*\\$?\\s*([\\d.,]+)",
        flags: "i",
      },
    ],
  },
  {
    groupId: "Dates",
    items: [
      { id: "ddmmyyyy", pattern: "(\\d{2}/\\d{2}/\\d{4})" },
      { id: "yyyymmdd", pattern: "(\\d{4}-\\d{2}-\\d{2})" },
      { id: "mmyyyy", pattern: "(\\d{2})[/-](\\d{4})" },
      {
        id: "spanishMonth",
        pattern: "(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)",
        flags: "i",
      },
    ],
  },
  {
    groupId: "Identifiers",
    items: [
      { id: "cuit", pattern: "(\\d{2}-\\d{8}-\\d)" },
      {
        id: "accountNo",
        pattern: "(?:cliente|cuenta|n[°º])\\s*:?\\s*(\\d{4,})",
        flags: "i",
      },
      { id: "anyDigits", pattern: "(\\d+)" },
    ],
  },
];

export function recipeMatch(text: string, r: Recipe): string | undefined {
  if (!text) return undefined;
  try {
    const m = new RegExp(r.pattern, r.flags || undefined).exec(text);
    return m ? (m[1] ?? m[0]) : undefined;
  } catch {
    return undefined;
  }
}

export function testerMatches(
  text: string,
  pattern: string,
  flags: string,
): { count: number; first?: string } | null {
  if (!pattern.trim() || !text) return { count: 0 };
  try {
    const g = flags.includes("g") ? flags : `${flags}g`;
    const all = [...text.matchAll(new RegExp(pattern, g))];
    return { count: all.length, first: all[0]?.[1] ?? all[0]?.[0] };
  } catch {
    return null;
  }
}

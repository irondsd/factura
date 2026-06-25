// Regex toolkit recipes (left column of the builder) plus the match helpers
// the toolkit uses to live-probe the active bill text.

export type Recipe = {
  label: string;
  pattern: string;
  flags?: string;
  hint?: string;
};

export const REGEX_RECIPES: { group: string; items: Recipe[] }[] = [
  {
    group: "Amounts",
    items: [
      {
        label: "LatAm · 1.234.567,89",
        pattern: "(?:\\$\\s*)?((?:\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:,\\d{2})?)",
        hint: "→ AR number (AR/UY/BR)",
      },
      {
        label: "US / intl · 1,234,567.89",
        pattern: "(?:\\$\\s*)?((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{2})?)",
        hint: "→ US number",
      },
      {
        label: "Whole units · 1.234.567",
        pattern: "\\$?\\s*(\\d{1,3}(?:\\.\\d{3})+)",
        hint: "no decimals (CLP) → AR number",
      },
      {
        label: "After a label · “Total a pagar”",
        pattern: "Total\\s*a\\s*pagar\\s*:?\\s*\\$?\\s*([\\d.,]+)",
        flags: "i",
        hint: "swap the label text for yours",
      },
    ],
  },
  {
    group: "Dates",
    items: [
      {
        label: "DD/MM/YYYY",
        pattern: "(\\d{2}/\\d{2}/\\d{4})",
        hint: "→ date DD/MM/YYYY",
      },
      { label: "YYYY-MM-DD", pattern: "(\\d{4}-\\d{2}-\\d{2})" },
      {
        label: "MM/YYYY",
        pattern: "(\\d{2})[/-](\\d{4})",
        hint: "month + year",
      },
      {
        label: "Spanish month name",
        pattern: "(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)",
        flags: "i",
      },
    ],
  },
  {
    group: "Identifiers",
    items: [
      { label: "CUIT · 20-12345678-9", pattern: "(\\d{2}-\\d{8}-\\d)" },
      {
        label: "Account / client no.",
        pattern: "(?:cliente|cuenta|n[°º])\\s*:?\\s*(\\d{4,})",
        flags: "i",
      },
      { label: "Any run of digits", pattern: "(\\d+)" },
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

import type { ParsedResult } from "@/parsers/engine/types";

/** A custom field a parser defines, so the modal can label extracted values. */
export type SuggestionField = {
  name: string;
  unit: string | null;
  type: string;
};

/** One adoptable parser that recognized a bill, with what it extracted from
 * THIS bill so the user can verify correctness before adopting. */
export type Suggestion = {
  configId: string;
  versionId: string;
  slug: string;
  displayName: string;
  vendorSlug: string;
  verified: boolean;
  adoptionCount: number;
  /** Extraction succeeded (all four roles resolved). */
  ok: boolean;
  /** ParseError message when the parser detected the bill but couldn't extract. */
  error: string | null;
  result: ParsedResult | null;
  customDefs: SuggestionField[];
  /** Detection specificity — higher is a tighter match. */
  score: number;
};

/** Order suggestions best-first: official parsers, then ones that cleanly
 * extracted, then the most specific detection, then the most-adopted, then by
 * name for stability. Pure — unit-tested in rank.test.ts. */
export function rankSuggestions(items: Suggestion[]): Suggestion[] {
  return [...items].sort(
    (a, b) =>
      Number(b.verified) - Number(a.verified) ||
      Number(b.ok) - Number(a.ok) ||
      b.score - a.score ||
      b.adoptionCount - a.adoptionCount ||
      a.displayName.localeCompare(b.displayName),
  );
}

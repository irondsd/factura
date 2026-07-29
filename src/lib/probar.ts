import type { ParsedResult } from "@/parsers/engine/types";

/** Wire types for the public /probar endpoints, shared by the route handlers and
 * the browser. Dependency-free (like limits.ts) so the client island can import
 * it without dragging in server-only code. */

export type Tier = "official" | "verified" | "community";

/** Cascade order: the most trusted parsers get first refusal on a bill. */
export const TIERS: readonly Tier[] = ["official", "verified", "community"];

export type CustomFieldDef = {
  name: string;
  unit: string | null;
  type: string;
};

/** One parser that recognized a bill, with what it extracted from it. */
export type TierMatch = {
  configId: string;
  versionId: string;
  slug: string;
  displayName: string;
  vendorSlug: string;
  tier: Tier;
  /** Detection specificity — higher is a tighter match. */
  score: number;
  /** Extraction succeeded (all four roles resolved). */
  ok: boolean;
  result: ParsedResult | null;
  /** ParseError message when the parser recognized the bill but couldn't read it. */
  error: string | null;
  customDefs: CustomFieldDef[];
};

export type SubmitResponse =
  | {
      submissionId: string;
      /** A readable PDF with no extractable text — a scan or a photo. */
      outcome: "no_text";
      pageCount: number;
    }
  | {
      submissionId: string;
      outcome: "pending";
      pageCount: number;
      /** Extraction stopped at the page cap; the text is partial. */
      truncated: boolean;
      charCount: number;
      /** First slice of the normalized text, for the "what we read" panel. */
      textPreview: string;
    };

export type ParseResponse = {
  tier: Tier;
  matched: boolean;
  /** Two parsers claimed the bill equally well — not a match, but a different
   * story than "nothing recognized it". */
  ambiguous: boolean;
  evaluated: number;
  best: TierMatch | null;
  alternatives: TierMatch[];
};

export type ClaimResponse = {
  results: {
    submissionId: string;
    status: "claimed" | "already" | "invalid";
    outcome?: string;
    billId?: string;
  }[];
};

/** How much normalized text the "what we read" panel shows. Long enough to
 * recognize your own bill, short enough not to dump a whole document. */
export const TEXT_PREVIEW_CHARS = 1200;

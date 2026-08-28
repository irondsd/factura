/** Wire types for the public /probar endpoints, shared by the route handlers and
 * the browser. These mirror the app API's JSON contract without importing the
 * parser engine that now lives in the app repository. */

export type TypedValue = string | number | { value: number; unit: string };

export type ParsedResult = {
  identity: string;
  amount: number;
  period: string;
  dueDate: string;
  custom: Record<string, TypedValue>;
};

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

/** Ceiling on the visitor's "who is this bill from?" answer. A vendor name, not
 * a paragraph — enforced on the server, mirrored on the input's maxLength so the
 * field stops accepting characters it would silently drop. */
export const VENDOR_GUESS_MAX = 120;

/** Ceiling on a "you read this wrong" report. Room to name a field, quote the
 * wrong value and the right one, without becoming a place to paste a document. */
export const REPORT_MESSAGE_MAX = 2000;

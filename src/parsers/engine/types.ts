/**
 * Config-driven parser engine — the data model.
 *
 * A `ParserConfig` is pure data (JSON-serializable) that the engine interprets.
 * It is vendor-agnostic by construction: nothing here names a specific vendor or
 * country. The five Argentine parsers under `configs/` are the first instances;
 * later these live in the DB and a builder UI emits them.
 *
 * Pipeline (see evaluate.ts): region-slice → captures → compute → validations →
 * roles + custom fields. Every stage reads/writes a flat string-keyed `scope`.
 */

/** A value living in the evaluation scope. Dates are ISO strings. */
export type ScopeValue = string | number | undefined;

// ── Transforms ──────────────────────────────────────────────────────────────
// Unary, pure string→value ops applied as an ordered pipeline to a captured
// group. Locale lives in params (numberAR vs numberUS), never in vendor names.
export type TransformOp =
  | "numberAR" // "6.778,10" -> 6778.1
  | "numberUS" // "22,590.52" -> 22590.52
  | "centsToAmount" // "00002259052" -> 22590.52
  | "stripLeadingZeros" // "01234567" -> "1234567"
  | "monthOf" // ISO date -> first of its month
  | "monthYear" // "09-2025" / "09/2025" / "2025-09" -> "2025-09-01"
  | "toInt" // "04" -> 4
  | "lowercase"
  | { slice: number } // first N chars
  | { parseDate: "DMY" | "YYMMDD" }
  | { lookup: Record<string, string | number> };

// ── Captures ────────────────────────────────────────────────────────────────
/** One regex over the text. Each output maps a (named or positional) group to a
 * scope key, with its own transform pipeline. A capture whose regex does not
 * match writes nothing — its outputs stay undefined, which downstream stages
 * treat as "absent" (this is how optional barcodes / dialects work). */
export type Capture = {
  pattern: string;
  flags?: string;
  outputs: Record<
    string,
    { group: number | string; transform?: TransformOp[] }
  >;
};

// ── Compute steps ───────────────────────────────────────────────────────────
// Ordered named steps over the scope. `expr` is a tiny safe arithmetic/ternary
// language (see expr.ts); the rest are structured date/string ops. Any step
// whose inputs are undefined yields undefined and propagates.
export type ComputeStep = { name: string } & (
  | { expr: string }
  | { datePart: { date: string; part: "year" | "month" | "day" } }
  | { dateFromParts: { year: string; month: string; day: string | number } }
  | { addMonths: { date: string; delta: number } }
  | { formatDate: { date: string; format: "YYMMDD" } }
  | { round: string }
  | { template: string } // "{cuit}:{unit}" — undefined if any ref is absent
  | { coalesce: string[] } // first defined ref
);

// ── Validations ─────────────────────────────────────────────────────────────
// Cross-checks between scope values. Failure throws -> the bill goes to review.
// "Only if both present" is intentional: absent optional sources skip the check.
export type Validation =
  | { type: "agree"; a: string; b: string; label: string } // numeric, to the cent
  | { type: "equals"; a: string; b: string; label: string }
  | {
      // At least one text region matching `linePattern` contains every value.
      // Passes when no region matches at all (e.g. no payment barcode present).
      type: "lineContainsAll";
      linePattern: string;
      flags?: string;
      values: string[];
      label: string;
    };

// ── Output mapping ──────────────────────────────────────────────────────────
/** The four semantic roles every config must resolve. They land in typed DB
 * columns and power matching / FX / dedup / YoY. `sources` coalesce in order;
 * `mustAgree` rejects when multiple present sources disagree. */
export type FieldRule = { sources: string[]; mustAgree?: boolean };

export type FieldType = "money" | "number" | "date" | "string" | "quantity";

/** Anything beyond the four roles — fully user-defined, stored in bills.extra. */
export type CustomField = {
  name: string;
  source: string;
  type: FieldType;
  unit?: string; // for type "quantity"
  includeWhen?: string; // expr; field omitted when falsy/undefined
};

export type Signature = { pattern: string; flags?: string; weight?: number };

export type ParserConfig = {
  slug: string;
  vendor: { slug: string; displayName: string };
  version: number;
  /** Restrict captures to a slice of the text (e.g. drop an embedded prior
   * receipt). Detection still runs against the full text. */
  region?: { before?: string; after?: string; flags?: string };
  /** Step 1: vendor matching. `allOf` must all match, `noneOf` none, and if
   * `anyOf` is present at least one must match. */
  detect: { allOf?: Signature[]; anyOf?: Signature[]; noneOf?: Signature[] };
  // Step 2: data extraction.
  captures: Capture[];
  compute?: ComputeStep[];
  validations?: Validation[];
  roles: {
    identity: FieldRule;
    amount: FieldRule;
    period: FieldRule;
    dueDate: FieldRule;
  };
  custom?: CustomField[];
};

export type TypedValue = string | number | { value: number; unit: string };

export type ParsedResult = {
  identity: string;
  amount: number;
  period: string;
  dueDate: string;
  custom: Record<string, TypedValue>;
};

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

/**
 * The structured builder model — the editor's source of truth.
 *
 * This is a near-mirror of the engine body (`captures` → multi-output captures,
 * `derives` → compute steps, `roles` → coalescing role sources, `custom`), but
 * shaped for direct editing: every reference is a value *name*, derives are
 * friendly typed cards rather than raw compute steps, and roles carry a primary
 * + fallback chain instead of a flat `sources` array. `generateBody` (see
 * generate.ts) compiles it down to a real `ParserConfig` body; `evaluateConfig`
 * (evaluate.ts) runs it live for the builder's chips, highlights and preview.
 *
 * Detection (step 1) and the slug/vendor metadata stay in the page's own state;
 * this model covers only step 2 (extraction).
 */

import type { FieldType, TransformOp } from "../engine/types";

let counter = 0;
/** Stable-ish ids for list rows. Builder-session scoped; never persisted. */
export function uid(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter}`;
}

/** One named output of a capture: a regex group + an ordered transform pipeline.
 * Transforms are the dropdown's string form ("numberAR", "parseDate:DMY", …);
 * object ops (slice/lookup) only arrive via the JSON escape hatch. */
export type CaptureOutput = {
  id: string;
  name: string;
  group: string;
  transforms: (string | TransformOp)[];
};

/** One regex over the bill, producing one or more named values. */
export type BuilderCapture = {
  id: string;
  pattern: string;
  flags: string;
  outputs: CaptureOutput[];
};

export type DeriveKind =
  | "fallback" // first present of `sources`            → coalesce
  | "math" // an arithmetic/ternary expression          → expr
  | "dateParts" // year + month (+day, ±shift) → a date → dateFromParts/addMonths
  | "datePart" // pull year|month|day out of a date      → datePart
  | "constWhen"; // `use` N when `whenRef` is present     → when/use

/** A computed value. Only the fields for its `kind` are meaningful; the rest are
 * carried so switching kinds in the UI doesn't lose prior input. */
export type BuilderDerive = {
  id: string;
  name: string;
  kind: DeriveKind;
  // fallback
  sources?: string[];
  // math
  expr?: string;
  // dateParts
  yearRef?: string;
  monthRef?: string;
  day?: number;
  shift?: number;
  // datePart
  dateRef?: string;
  part?: "year" | "month" | "day";
  // constWhen
  whenRef?: string;
  constValue?: number;
};

/** A required role: a primary value name, an ordered fallback chain (coalesce),
 * and an optional cross-check that flags review when present sources disagree. */
export type RoleDef = {
  primary: string;
  fallbacks: string[];
  mustAgree: boolean;
};

export type RoleKey = "identity" | "amount" | "period" | "dueDate";

export type BuilderRoles = Record<RoleKey, RoleDef>;

export type CustomDef = {
  id: string;
  name: string;
  source: string;
  type: FieldType;
  unit: string;
  includeWhen: string;
};

/** The full step-2 model. */
export type BuilderConfig = {
  captures: BuilderCapture[];
  derives: BuilderDerive[];
  roles: BuilderRoles;
  custom: CustomDef[];
};

export const ROLE_KEYS: RoleKey[] = ["identity", "amount", "period", "dueDate"];

export const ROLE_LABEL: Record<RoleKey, string> = {
  identity: "Account / unique ID",
  amount: "Amount",
  period: "Period",
  dueDate: "Due date",
};

export function emptyRole(): RoleDef {
  return { primary: "", fallbacks: [], mustAgree: false };
}

export function emptyConfig(): BuilderConfig {
  return {
    captures: [],
    derives: [],
    roles: {
      identity: emptyRole(),
      amount: emptyRole(),
      period: emptyRole(),
      dueDate: emptyRole(),
    },
    custom: [],
  };
}

export function newCapture(): BuilderCapture {
  return {
    id: uid("cap"),
    pattern: "",
    flags: "i",
    outputs: [{ id: uid("out"), name: "", group: "1", transforms: [] }],
  };
}

export function newOutput(): CaptureOutput {
  return { id: uid("out"), name: "", group: "1", transforms: [] };
}

export function newDerive(): BuilderDerive {
  return { id: uid("der"), name: "", kind: "fallback", sources: [""] };
}

export function newCustom(): CustomDef {
  return {
    id: uid("cf"),
    name: "",
    source: "",
    type: "money",
    unit: "",
    includeWhen: "",
  };
}

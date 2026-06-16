import { addMonths } from "../helpers";
import { evalExpr, type Scope } from "./expr";
import { applyTransforms } from "./transforms";
import {
  type ComputeStep,
  type FieldRule,
  ParseError,
  type ParsedResult,
  type ParserConfig,
  type ScopeValue,
  type Validation,
} from "./types";

// ── Detection (step 1) ───────────────────────────────────────────────────────
/** Score a config against text. `null` = disqualified (a required signature is
 * missing or a `noneOf` matched). Higher score = more specific match. */
export function detectScore(config: ParserConfig, text: string): number | null {
  const { allOf = [], anyOf = [], noneOf = [] } = config.detect;
  const hit = (p: { pattern: string; flags?: string }) =>
    new RegExp(p.pattern, p.flags).test(text);

  for (const sig of allOf) if (!hit(sig)) return null;
  for (const sig of noneOf) if (hit(sig)) return null;
  if (anyOf.length > 0 && !anyOf.some(hit)) return null;

  let score = 0;
  for (const sig of allOf) score += sig.weight ?? 1;
  for (const sig of anyOf) if (hit(sig)) score += sig.weight ?? 1;
  return score;
}

/** Pick the best-matching config. Returns undefined when nothing qualifies or
 * the top two tie (ambiguous → caller should send to review rather than guess). */
export function selectConfig(
  configs: ParserConfig[],
  text: string,
): ParserConfig | undefined {
  const scored = configs
    .map((c) => ({ c, s: detectScore(c, text) }))
    .filter((x): x is { c: ParserConfig; s: number } => x.s !== null)
    .sort((a, b) => b.s - a.s);

  if (scored.length === 0) return undefined;
  if (scored.length > 1 && scored[0].s === scored[1].s) return undefined;
  return scored[0].c;
}

// ── Extraction (step 2) ──────────────────────────────────────────────────────
function num(v: ScopeValue): number | undefined {
  if (v === undefined) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? undefined : n;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Strict YYYY-MM-DD with a real calendar check (rejects "09-2025-01"). */
function isIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [, y, mo, d] = m;
  const date = new Date(`${s}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() + 1 === Number(mo) &&
    date.getUTCDate() === Number(d)
  );
}

function runCompute(step: ComputeStep, scope: Scope): ScopeValue {
  if ("expr" in step) {
    const r = evalExpr(step.expr, scope);
    return typeof r === "boolean" ? (r ? 1 : 0) : r;
  }
  if ("datePart" in step) {
    const d = scope[step.datePart.date];
    if (d === undefined) return undefined;
    const s = String(d);
    const at = { year: [0, 4], month: [5, 7], day: [8, 10] }[step.datePart.part];
    return Number(s.slice(at[0], at[1]));
  }
  if ("dateFromParts" in step) {
    const y = num(scope[step.dateFromParts.year]);
    const m = num(scope[step.dateFromParts.month]);
    const d =
      typeof step.dateFromParts.day === "number"
        ? step.dateFromParts.day
        : num(scope[step.dateFromParts.day]);
    if (y === undefined || m === undefined || d === undefined) return undefined;
    return `${y}-${pad(m)}-${pad(d)}`;
  }
  if ("addMonths" in step) {
    const d = scope[step.addMonths.date];
    if (d === undefined) return undefined;
    return addMonths(String(d), step.addMonths.delta);
  }
  if ("formatDate" in step) {
    const d = scope[step.formatDate.date];
    if (d === undefined) return undefined;
    // "YYMMDD": "2026-06-10" -> "260610"
    return String(d).slice(2).replaceAll("-", "");
  }
  if ("round" in step) {
    const n = num(scope[step.round]);
    return n === undefined ? undefined : Math.round(n);
  }
  if ("template" in step) {
    let out = step.template;
    let ok = true;
    out = out.replace(/\{(\w+)\}/g, (_, key) => {
      const v = scope[key];
      if (v === undefined) ok = false;
      return v === undefined ? "" : String(v);
    });
    return ok ? out : undefined;
  }
  // coalesce
  for (const ref of step.coalesce) {
    if (scope[ref] !== undefined) return scope[ref];
  }
  return undefined;
}

function runValidation(v: Validation, scope: Scope, text: string): void {
  if (v.type === "agree") {
    const a = num(scope[v.a]);
    const b = num(scope[v.b]);
    if (a === undefined || b === undefined) return; // only when both present
    if (Math.round(a * 100) !== Math.round(b * 100)) {
      throw new ParseError(`${v.label}: ${a} vs ${b} disagree — needs review`);
    }
    return;
  }
  if (v.type === "equals") {
    const a = scope[v.a];
    const b = scope[v.b];
    if (a === undefined || b === undefined) return;
    if (String(a) !== String(b)) {
      throw new ParseError(`${v.label}: "${a}" vs "${b}" disagree — needs review`);
    }
    return;
  }
  // lineContainsAll
  const re = new RegExp(v.linePattern, v.flags ? `${v.flags}g` : "g");
  const lines = [...text.matchAll(re)].map((m) => m[0]);
  if (lines.length === 0) return; // nothing to cross-check against
  const needles = v.values
    .map((ref) => scope[ref])
    .filter((x): x is ScopeValue => x !== undefined)
    .map(String);
  const confirmed = lines.some((line) => needles.every((n) => line.includes(n)));
  if (!confirmed) {
    throw new ParseError(`${v.label}: no line confirms the values — needs review`);
  }
}

function resolveRole(rule: FieldRule, scope: Scope, name: string): ScopeValue {
  const present = rule.sources
    .map((s) => scope[s])
    .filter((v): v is ScopeValue => v !== undefined);
  if (present.length === 0) {
    throw new ParseError(`Could not resolve ${name}`);
  }
  if (rule.mustAgree && present.length > 1) {
    const nums = present.map(num);
    const first = nums[0];
    if (
      first !== undefined &&
      nums.some((n) => n === undefined || Math.round(n * 100) !== Math.round(first * 100))
    ) {
      throw new ParseError(`${name}: sources disagree — needs review`);
    }
  }
  return present[0];
}

/** Run a config against already-normalized bill text. Throws ParseError on a
 * failed validation or an unresolvable role (→ caller routes to review). */
export function runConfig(config: ParserConfig, normalizedText: string): ParsedResult {
  // Region slice (captures only); detection already ran on the full text.
  let text = normalizedText;
  if (config.region?.before) {
    text = text.split(new RegExp(config.region.before, config.region.flags ?? "i"))[0];
  }
  if (config.region?.after) {
    const parts = text.split(new RegExp(config.region.after, config.region.flags ?? "i"));
    text = parts.length > 1 ? parts.slice(1).join("") : text;
  }

  const scope: Scope = {};

  for (const capture of config.captures) {
    const m = text.match(new RegExp(capture.pattern, capture.flags));
    if (!m) continue;
    for (const [key, out] of Object.entries(capture.outputs)) {
      const raw =
        typeof out.group === "string" ? m.groups?.[out.group] : m[out.group];
      if (raw === undefined) continue;
      scope[key] = applyTransforms(raw, out.transform);
    }
  }

  for (const step of config.compute ?? []) {
    scope[step.name] = runCompute(step, scope);
  }

  for (const v of config.validations ?? []) {
    runValidation(v, scope, text);
  }

  const identity = String(resolveRole(config.roles.identity, scope, "identity"));
  const amount = num(resolveRole(config.roles.amount, scope, "amount"));
  const period = String(resolveRole(config.roles.period, scope, "period"));
  const dueDate = String(resolveRole(config.roles.dueDate, scope, "dueDate"));

  // Validate the four roles before they reach typed DB columns — a bad transform
  // (e.g. monthOf over an "MM-YYYY" capture) otherwise yields a string like
  // "09-2025-01" that only blows up at the database. Surfaces in the builder
  // preview and routes real bills to review instead of 500-ing.
  if (amount === undefined || !Number.isFinite(amount)) {
    throw new ParseError(`Amount isn't a number — check its transform`);
  }
  if (!identity) throw new ParseError("Account / unique ID is empty");
  if (!isIsoDate(period)) {
    throw new ParseError(`Period "${period}" isn't a valid date (expected YYYY-MM-DD)`);
  }
  if (!isIsoDate(dueDate)) {
    throw new ParseError(`Due date "${dueDate}" isn't a valid date (expected YYYY-MM-DD)`);
  }

  const result: ParsedResult = { identity, amount, period, dueDate, custom: {} };

  for (const field of config.custom ?? []) {
    if (field.includeWhen && !evalExpr(field.includeWhen, scope)) continue;
    const v = scope[field.source];
    if (v === undefined) continue;
    if (field.type === "quantity") {
      result.custom[field.name] = { value: Number(v), unit: field.unit ?? "" };
    } else if (field.type === "money" || field.type === "number") {
      result.custom[field.name] = num(v)!;
    } else {
      result.custom[field.name] = String(v);
    }
  }

  return result;
}

/**
 * The named-value pipeline that drives the builder UI.
 *
 * Unlike the engine's `runConfig` (which throws on the first problem and returns
 * only the four roles + custom), this evaluates leniently and returns a record
 * per value — its live result, any error, and the source span(s) that produced
 * it. That map is what the chips, the bill-text highlight and every Value Picker
 * read from. It reuses the engine's transforms / expr / date helpers so the
 * preview matches what `runConfig` will ultimately do.
 */

import { addMonths } from "../helpers";
import { evalExpr } from "../engine/expr";
import { applyTransforms } from "../engine/transforms";
import type { ScopeValue, TransformOp } from "../engine/types";
import type { Body } from "./generate";
import type { BuilderConfig, BuilderDerive, RoleKey } from "./model";
import { ROLE_KEYS, ROLE_LABEL } from "./model";
import { groupOf, isIsoDate, num, pad, toTransformOp } from "./util";

export type Span = { start: number; end: number };
export type ValueOrigin = "capture" | "derive";
export type ValueRec = {
  value: ScopeValue;
  error: string | null;
  spans: Span[];
  origin: ValueOrigin;
};
export type ValueMap = Record<string, ValueRec>;
type Scope = Record<string, ScopeValue>;

export type RoleResult = {
  value: ScopeValue;
  chosen: string | null;
  refs: string[];
  disagree: boolean;
};
export type Issue = { type: "error" | "review"; label: string; detail?: string };
export type CustomRow = {
  name: string;
  value: ScopeValue;
  type: string;
  unit?: string;
};
export type EvalResult = {
  values: ValueMap;
  scope: Scope;
  roleOut: Record<RoleKey, RoleResult>;
  custom: CustomRow[];
  issues: Issue[];
  resolved: boolean;
};

/** Identifiers referenced by an expression — for math validation + span tracing.
 * A loose scan (good enough; numbers can't start with a letter). */
export function exprIds(src: string): string[] {
  const out = new Set<string>();
  for (const m of (src || "").matchAll(/[A-Za-z_][A-Za-z0-9_.]*/g)) out.add(m[0]);
  return [...out];
}

function spansOf(names: string[], values: ValueMap): Span[] {
  const out: Span[] = [];
  for (const n of names) {
    const r = values[n];
    if (r?.spans) out.push(...r.spans);
  }
  return out;
}

function evalDerive(d: BuilderDerive, scope: Scope, values: ValueMap): ValueRec {
  const base: ValueRec = { value: undefined, error: null, spans: [], origin: "derive" };
  try {
    if (d.kind === "fallback") {
      const refs = (d.sources ?? []).filter(Boolean);
      for (const ref of refs) {
        if (scope[ref] !== undefined) {
          return { ...base, value: scope[ref], spans: spansOf([ref], values) };
        }
      }
      return base;
    }
    if (d.kind === "math") {
      const expr = d.expr ?? "";
      if (!expr.trim()) return base;
      const ids = exprIds(expr);
      const unknown = ids.find((id) => !(id in scope));
      if (unknown) return { ...base, error: `unknown value: ${unknown}` };
      const r = evalExpr(expr, scope);
      const value = typeof r === "boolean" ? (r ? 1 : 0) : r;
      return { ...base, value, spans: spansOf(ids, values) };
    }
    if (d.kind === "dateParts") {
      const refs = [d.yearRef, d.monthRef].filter(Boolean) as string[];
      const y = num(scope[d.yearRef ?? ""]);
      const mo = num(scope[d.monthRef ?? ""]);
      if (y === undefined || mo === undefined) return base;
      const day = typeof d.day === "number" ? d.day : 1;
      let iso = `${y}-${pad(mo)}-${pad(day)}`;
      if (d.shift) iso = addMonths(iso, d.shift);
      return { ...base, value: iso, spans: spansOf(refs, values) };
    }
    if (d.kind === "datePart") {
      const date = scope[d.dateRef ?? ""];
      if (date === undefined) return base;
      const at = { year: [0, 4], month: [5, 7], day: [8, 10] }[d.part ?? "year"];
      return {
        ...base,
        value: Number(String(date).slice(at[0], at[1])),
        spans: spansOf([d.dateRef ?? ""], values),
      };
    }
    if (d.kind === "constWhen") {
      const present = scope[d.whenRef ?? ""] !== undefined;
      return {
        ...base,
        value: present ? d.constValue : undefined,
        spans: present ? spansOf([d.whenRef ?? ""], values) : [],
      };
    }
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : String(e) };
  }
  return base;
}

/** Run captures then derives over the text, producing the named-value map. */
function runPipeline(text: string, config: BuilderConfig): { values: ValueMap; scope: Scope } {
  const values: ValueMap = {};
  const scope: Scope = {};
  const set = (name: string, rec: ValueRec) => {
    values[name] = rec;
    scope[name] = rec.value;
  };

  for (const cap of config.captures) {
    let m: RegExpExecArray | null = null;
    let invalid = false;
    if (cap.pattern.trim()) {
      try {
        m = new RegExp(cap.pattern, `${cap.flags || ""}d`).exec(text);
      } catch {
        invalid = true;
      }
    }
    for (const o of cap.outputs) {
      if (!o.name) continue;
      if (invalid) {
        set(o.name, { value: undefined, error: "invalid regex", spans: [], origin: "capture" });
        continue;
      }
      if (!m) {
        set(o.name, { value: undefined, error: null, spans: [], origin: "capture" });
        continue;
      }
      const g = groupOf(o.group);
      const raw = typeof g === "number" ? m[g] : m.groups?.[g];
      let span: Span | null = null;
      const indices = (m as RegExpExecArray & { indices?: { [k: number]: [number, number]; groups?: Record<string, [number, number]> } }).indices;
      if (indices) {
        const gi = typeof g === "number" ? indices[g] : indices.groups?.[g];
        if (gi) span = { start: gi[0], end: gi[1] };
      }
      if (raw === undefined) {
        set(o.name, { value: undefined, error: null, spans: [], origin: "capture" });
        continue;
      }
      let value: ScopeValue;
      let error: string | null = null;
      try {
        value = applyTransforms(raw, (o.transforms ?? []).map(toTransformOp) as TransformOp[]);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      set(o.name, { value, error, spans: span ? [span] : [], origin: "capture" });
    }
  }

  for (const d of config.derives) {
    if (!d.name) continue;
    set(d.name, evalDerive(d, scope, values));
  }

  return { values, scope };
}

/** Resolve a coalescing list; flag review when `mustAgree` and present values
 * disagree to the cent. */
function resolveRefs(refs: string[], mustAgree: boolean | undefined, scope: Scope): RoleResult {
  const list = refs.filter(Boolean);
  const present = list.map((r) => scope[r]).filter((v) => v !== undefined);
  if (present.length === 0) return { value: undefined, chosen: null, refs: list, disagree: false };
  let disagree = false;
  if (mustAgree && present.length > 1) {
    const nums = present.map(num);
    const first = nums[0];
    disagree =
      first !== undefined &&
      nums.some((n) => n === undefined || Math.round(n * 100) !== Math.round(first * 100));
  }
  const chosen = list.find((r) => scope[r] !== undefined) ?? null;
  return { value: present[0], chosen, refs: list, disagree };
}

type RoleRefs = (key: RoleKey) => { refs: string[]; mustAgree?: boolean };

/** Shared assessment over a scope: roles, custom rows, review/error issues, and
 * the overall resolved flag. Works for both the structured config and a raw body
 * (the JSON escape hatch) via the `roleRefs` adapter. */
function assess(scope: Scope, roleRefs: RoleRefs, customDefs: BuilderConfig["custom"] | Body["custom"]): Omit<EvalResult, "values" | "scope"> {
  const issues: Issue[] = [];
  const roleOut = {} as Record<RoleKey, RoleResult>;
  for (const key of ROLE_KEYS) {
    const { refs, mustAgree } = roleRefs(key);
    const r = resolveRefs(refs, mustAgree, scope);
    roleOut[key] = r;
    if (r.value === undefined) {
      issues.push({ type: "error", label: `${ROLE_LABEL[key]} can’t resolve`, detail: "no source value matched" });
    } else if (r.disagree) {
      issues.push({
        type: "review",
        label: `${ROLE_LABEL[key]}: sources disagree`,
        detail: refs.filter((x) => scope[x] !== undefined).map((x) => `${x} = ${scope[x]}`).join(" vs "),
      });
    }
  }
  const amountN = num(roleOut.amount.value);
  if (roleOut.amount.value !== undefined && (amountN === undefined || !Number.isFinite(amountN))) {
    issues.push({ type: "error", label: "Amount isn’t a number", detail: "check its transform" });
  }
  if (roleOut.period.value !== undefined && !isIsoDate(String(roleOut.period.value))) {
    issues.push({ type: "error", label: "Period isn’t a valid date", detail: `got “${roleOut.period.value}”` });
  }
  if (roleOut.dueDate.value !== undefined && !isIsoDate(String(roleOut.dueDate.value))) {
    issues.push({ type: "error", label: "Due date isn’t a valid date", detail: `got “${roleOut.dueDate.value}”` });
  }

  const custom: CustomRow[] = [];
  for (const cf of customDefs ?? []) {
    if (!cf.name || !cf.source) continue;
    const includeWhen = "includeWhen" in cf ? cf.includeWhen : undefined;
    if (includeWhen && String(includeWhen).trim()) {
      try {
        if (!evalExpr(includeWhen, scope)) continue;
      } catch {
        // a broken includeWhen keeps the field rather than dropping it silently
      }
    }
    custom.push({ name: cf.name, value: scope[cf.source], type: cf.type, unit: "unit" in cf ? cf.unit : undefined });
  }

  const resolved =
    roleOut.identity.value !== undefined &&
    amountN !== undefined &&
    roleOut.period.value !== undefined &&
    roleOut.dueDate.value !== undefined &&
    issues.every((i) => i.type !== "error");

  return { roleOut, custom, issues, resolved };
}

/** Evaluate the structured config against one bill. */
export function evaluateConfig(text: string, config: BuilderConfig): EvalResult {
  const { values, scope } = runPipeline(text, config);
  const roleRefs: RoleRefs = (key) => {
    const r = config.roles[key];
    return { refs: [r.primary, ...(r.fallbacks ?? [])], mustAgree: r.mustAgree };
  };
  return { values, scope, ...assess(scope, roleRefs, config.custom) };
}

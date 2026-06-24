/**
 * Reverse map: an engine body → the structured builder model, so an existing
 * saved parser reopens in the structured editor. Returns `null` when the body
 * uses something the model can't faithfully hold (region slicing, an
 * unrecognized compute step, or a validation that doesn't reduce to a role's
 * must-agree) — the page then opens it in the JSON tab instead. The pairing is
 * the exact inverse of `generateBody`, so a config the structured editor itself
 * produced always round-trips.
 */

import type { ComputeStep, TransformOp } from "../engine/types";
import { exprIds } from "./evaluate";
import type { Body } from "./generate";
import type { BuilderConfig, BuilderDerive, BuilderRoles } from "./model";
import { ROLE_KEYS, uid } from "./model";

/** Engine transform → the dropdown's editable string form where one exists;
 * structured ops (slice / lookup) stay as objects (shown read-only). */
function transformToBuilder(op: TransformOp): string | TransformOp {
  if (typeof op === "string") return op;
  if ("parseDate" in op) return `parseDate:${op.parseDate}`;
  return op;
}

// `ref * 0 + N` — the old presence-gate trick — reads back as a constWhen card.
const CONST_WHEN = /^([A-Za-z_][\w.]*)\s*\*\s*0\s*\+\s*(-?\d+(?:\.\d+)?)$/;

/** Names a single compute step reads from. */
function stepRefs(step: ComputeStep): string[] {
  if ("coalesce" in step) return step.coalesce;
  if ("expr" in step) return exprIds(step.expr);
  if ("datePart" in step) return [step.datePart.date];
  if ("dateFromParts" in step) {
    const r = [step.dateFromParts.year, step.dateFromParts.month];
    if (typeof step.dateFromParts.day === "string") r.push(step.dateFromParts.day);
    return r;
  }
  if ("addMonths" in step) return [step.addMonths.date];
  if ("formatDate" in step) return [step.formatDate.date];
  if ("round" in step) return [step.round];
  if ("template" in step) return [...step.template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  if ("when" in step) return [step.when];
  return [];
}

/** Is `name` read by anything other than compute step `exceptIdx`? Used to know
 * whether a dateFromParts → addMonths intermediate is safe to fold away. */
function referencedElsewhere(name: string, body: Body, exceptIdx: number): boolean {
  const compute = body.compute ?? [];
  for (let i = 0; i < compute.length; i++) {
    if (i !== exceptIdx && stepRefs(compute[i]).includes(name)) return true;
  }
  for (const k of ROLE_KEYS) if ((body.roles[k]?.sources ?? []).includes(name)) return true;
  for (const c of body.custom ?? []) {
    if (c.source === name) return true;
    if (c.includeWhen && exprIds(c.includeWhen).includes(name)) return true;
  }
  return false;
}

function computeToDerives(steps: ComputeStep[], body: Body): BuilderDerive[] | null {
  const out: BuilderDerive[] = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if ("coalesce" in s) {
      out.push({ id: uid("der"), name: s.name, kind: "fallback", sources: s.coalesce.slice() });
    } else if ("when" in s) {
      out.push({ id: uid("der"), name: s.name, kind: "constWhen", whenRef: s.when, constValue: s.use });
    } else if ("datePart" in s) {
      out.push({ id: uid("der"), name: s.name, kind: "datePart", dateRef: s.datePart.date, part: s.datePart.part });
    } else if ("dateFromParts" in s) {
      if (typeof s.dateFromParts.day !== "number") return null; // a value-ref day can't be edited here
      const next = steps[i + 1];
      // Shifted form: a dateFromParts immediately followed by an addMonths over
      // it, where the intermediate isn't read anywhere else — fold into one
      // dateParts(+shift) named after the addMonths step. (Naming-agnostic, so
      // both `p_parts`/`period` and `period_parts`/`period` collapse.)
      if (
        next &&
        "addMonths" in next &&
        next.addMonths.date === s.name &&
        !referencedElsewhere(s.name, body, i + 1)
      ) {
        out.push({
          id: uid("der"),
          name: next.name,
          kind: "dateParts",
          yearRef: s.dateFromParts.year,
          monthRef: s.dateFromParts.month,
          day: s.dateFromParts.day,
          shift: next.addMonths.delta,
        });
        i++; // consume the addMonths step
      } else {
        out.push({
          id: uid("der"),
          name: s.name,
          kind: "dateParts",
          yearRef: s.dateFromParts.year,
          monthRef: s.dateFromParts.month,
          day: s.dateFromParts.day,
          shift: 0,
        });
      }
    } else if ("expr" in s) {
      const m = CONST_WHEN.exec(s.expr);
      if (m) {
        out.push({ id: uid("der"), name: s.name, kind: "constWhen", whenRef: m[1], constValue: Number(m[2]) });
      } else {
        out.push({ id: uid("der"), name: s.name, kind: "math", expr: s.expr });
      }
    } else {
      // addMonths (standalone), formatDate, round, template — no derive kind.
      return null;
    }
  }
  return out;
}

export function bodyToConfig(body: Body): BuilderConfig | null {
  if (body.region) return null;

  const captures = (body.captures ?? []).map((cap) => ({
    id: uid("cap"),
    pattern: cap.pattern,
    flags: cap.flags ?? "",
    outputs: Object.entries(cap.outputs).map(([name, out]) => ({
      id: uid("out"),
      name,
      group: String(out.group),
      transforms: (out.transform ?? []).map(transformToBuilder),
    })),
  }));

  const derives = computeToDerives(body.compute ?? [], body);
  if (derives === null) return null;

  const roles = {} as BuilderRoles;
  for (const key of ROLE_KEYS) {
    const r = body.roles[key];
    const sources = r?.sources ?? [];
    roles[key] = {
      primary: sources[0] ?? "",
      fallbacks: sources.slice(1),
      mustAgree: Boolean(r?.mustAgree),
    };
  }

  // Reduce agree/equals cross-checks to a role's must-agree when their operands
  // are exactly that role's two sources; bail on anything else (lineContainsAll,
  // or a check that doesn't line up with a role — e.g. over raw inputs).
  for (const v of body.validations ?? []) {
    if (v.type !== "agree" && v.type !== "equals") return null;
    const pair = [v.a, v.b];
    const key = ROLE_KEYS.find((k) => {
      const set = [roles[k].primary, ...roles[k].fallbacks].filter(Boolean);
      return set.length === 2 && pair.every((x) => set.includes(x));
    });
    if (!key) return null;
    roles[key].mustAgree = true;
  }

  const custom = (body.custom ?? []).map((c) => ({
    id: uid("cf"),
    name: c.name,
    source: c.source,
    type: c.type,
    unit: c.unit ?? "",
    includeWhen: c.includeWhen ?? "",
  }));

  return { captures, derives, roles, custom };
}

/**
 * Compile the structured builder model down to a real engine body
 * (`ParserConfig` minus slug/version/vendor). This is the bridge: the editor
 * works in the friendly model, but what we store and run is a standard config
 * the server schema validates and the engine executes unchanged.
 */

import type {
  Capture,
  ComputeStep,
  ParserConfig,
  TransformOp,
} from "../engine/types";
import type { BuilderConfig, RoleDef } from "./model";
import { ROLE_KEYS } from "./model";
import { groupOf, toTransformOp } from "./util";

export type Body = Omit<ParserConfig, "slug" | "version" | "vendor">;
export type Sig = { pattern: string; flags: string };
export type DetectInput = { allOf: Sig[]; noneOf: Sig[] };

function roleSources(role: RoleDef): string[] {
  return [role.primary, ...(role.fallbacks ?? [])].filter(Boolean);
}

/** Build the captures array, dropping incomplete rows (no pattern / no name). */
function buildCaptures(config: BuilderConfig): Capture[] {
  const out: Capture[] = [];
  for (const cap of config.captures) {
    if (!cap.pattern.trim()) continue;
    const outputs: Capture["outputs"] = {};
    for (const o of cap.outputs) {
      if (!o.name.trim()) continue;
      const transform = (o.transforms ?? []).map(toTransformOp);
      outputs[o.name] = transform.length
        ? { group: groupOf(o.group), transform }
        : { group: groupOf(o.group) };
    }
    if (Object.keys(outputs).length === 0) continue;
    out.push({
      pattern: cap.pattern,
      ...(cap.flags ? { flags: cap.flags } : {}),
      outputs,
    });
  }
  return out;
}

/** Build the compute steps from the derive cards. Each kind maps to one (or, for
 * a shifted date, two) engine compute steps. */
function buildCompute(config: BuilderConfig): ComputeStep[] {
  const out: ComputeStep[] = [];
  for (const d of config.derives) {
    if (!d.name.trim()) continue;
    switch (d.kind) {
      case "fallback":
        out.push({ name: d.name, coalesce: (d.sources ?? []).filter(Boolean) });
        break;
      case "math":
        out.push({ name: d.name, expr: d.expr ?? "" });
        break;
      case "datePart":
        out.push({
          name: d.name,
          datePart: { date: d.dateRef ?? "", part: d.part ?? "year" },
        });
        break;
      case "constWhen":
        out.push({
          name: d.name,
          when: d.whenRef ?? "",
          use: d.constValue ?? 0,
        });
        break;
      case "dateParts": {
        const parts = {
          year: d.yearRef ?? "",
          month: d.monthRef ?? "",
          day: d.day ?? 1,
        };
        if (d.shift) {
          out.push({ name: `${d.name}_parts`, dateFromParts: parts });
          out.push({
            name: d.name,
            addMonths: { date: `${d.name}_parts`, delta: d.shift },
          });
        } else {
          out.push({ name: d.name, dateFromParts: parts });
        }
        break;
      }
    }
  }
  return out;
}

export function generateBody(config: BuilderConfig, detect: DetectInput): Body {
  const compute = buildCompute(config);
  const custom = config.custom
    .filter((c) => c.name.trim() && c.source.trim())
    .map((c) => ({
      name: c.name,
      source: c.source,
      type: c.type,
      ...(c.unit ? { unit: c.unit } : {}),
      ...(c.includeWhen ? { includeWhen: c.includeWhen } : {}),
    }));

  const roles = {} as Body["roles"];
  for (const key of ROLE_KEYS) {
    const role = config.roles[key];
    const sources = roleSources(role);
    roles[key] = role.mustAgree ? { sources, mustAgree: true } : { sources };
  }

  const allOf = detect.allOf.filter((s) => s.pattern.trim());
  const noneOf = detect.noneOf.filter((s) => s.pattern.trim());

  return {
    detect: { allOf, ...(noneOf.length ? { noneOf } : {}) },
    captures: buildCaptures(config),
    ...(compute.length ? { compute } : {}),
    roles,
    ...(custom.length ? { custom } : {}),
  };
}

export type { TransformOp };

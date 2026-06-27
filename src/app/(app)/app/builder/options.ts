// Builds the list of selectable upstream values for the pickers — captures
// first, then any derived values defined above the current point.

import type { EvalResult } from "@/parsers/builder/evaluate";
import type { BuilderConfig } from "@/parsers/builder/model";
import type { ValueOption } from "./cards";

function captureOptions(
  config: BuilderConfig,
  values: EvalResult["values"],
): ValueOption[] {
  const opts: ValueOption[] = [];
  for (const cap of config.captures)
    for (const o of cap.outputs)
      if (o.name)
        opts.push({ name: o.name, origin: "capture", rec: values[o.name] });
  return opts;
}

export function optionsBeforeDerive(
  config: BuilderConfig,
  values: EvalResult["values"],
  idx: number,
): ValueOption[] {
  const opts = captureOptions(config, values);
  for (let i = 0; i < idx; i++) {
    const d = config.derives[i];
    if (d.name)
      opts.push({ name: d.name, origin: "derive", rec: values[d.name] });
  }
  return opts;
}

export function allOptions(
  config: BuilderConfig,
  values: EvalResult["values"],
): ValueOption[] {
  return optionsBeforeDerive(config, values, config.derives.length);
}

export function moveArr<T>(arr: T[], i: number, dir: number): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const n = arr.slice();
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}

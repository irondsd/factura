import { check } from "recheck";
import type { ParserConfig } from "@/parsers/engine/types";

// Force recheck's pure-JS backend: the default ("auto") tries to spawn a native
// binary or a worker thread, both fragile under serverless bundling. Pure runs
// the analysis on the request thread, which is fine for a rare, owner-triggered
// publish — each pattern is bounded by CHECK_TIMEOUT_MS. `??=` keeps an
// operator override possible.
process.env.RECHECK_BACKEND ??= "pure";

/** Per-pattern analysis budget. A timeout yields `unknown`, which blocks the
 * publish, so this also bounds worst-case publish latency. Safe-but-wordy
 * real patterns need a few seconds on the pure backend (telecom ~2.6s), so
 * this can't be tight. */
const CHECK_TIMEOUT_MS = 10_000;

export type PatternSite = { path: string; pattern: string; flags: string };

/** Every regex the engine will compile from this config, with the exact flags
 * evaluate.ts uses at runtime (region defaults to "i"; lineContainsAll gets "g"
 * appended). `path` names the field in the publish rejection message. Pure
 * (unit-tested in redos.test.ts). */
export function collectPatterns(config: ParserConfig): PatternSite[] {
  const sites: PatternSite[] = [];
  for (const key of ["allOf", "anyOf", "noneOf"] as const) {
    (config.detect[key] ?? []).forEach((s, i) =>
      sites.push({
        path: `detect.${key}[${i}]`,
        pattern: s.pattern,
        flags: s.flags ?? "",
      }),
    );
  }
  if (config.region?.before)
    sites.push({
      path: "region.before",
      pattern: config.region.before,
      flags: config.region.flags ?? "i",
    });
  if (config.region?.after)
    sites.push({
      path: "region.after",
      pattern: config.region.after,
      flags: config.region.flags ?? "i",
    });
  config.captures.forEach((c, i) =>
    sites.push({
      path: `captures[${i}] (${Object.keys(c.outputs).join(", ")})`,
      pattern: c.pattern,
      flags: c.flags ?? "",
    }),
  );
  (config.validations ?? []).forEach((v, i) => {
    if (v.type === "lineContainsAll")
      sites.push({
        path: `validations[${i}] "${v.label}"`,
        pattern: v.linePattern,
        flags: `${v.flags ?? ""}g`,
      });
  });
  return sites;
}

/** Patterns recheck cannot prove safe. `vulnerable` means a crafted bill text
 * makes the regex backtrack super-linearly (ReDoS); `unknown` means the
 * analysis timed out or the pattern doesn't even parse. Both block publishing:
 * published patterns run against other users' uploads, and ingest/reparse are
 * not worker-isolated. */
export async function findUnsafeRegexes(
  config: ParserConfig,
): Promise<{ path: string; reason: string }[]> {
  const unsafe: { path: string; reason: string }[] = [];
  for (const site of collectPatterns(config)) {
    const d = await check(site.pattern, site.flags, {
      timeout: CHECK_TIMEOUT_MS,
    });
    if (d.status === "vulnerable")
      unsafe.push({
        path: site.path,
        reason: `can be forced into ${d.complexity.summary} backtracking (ReDoS)`,
      });
    else if (d.status === "unknown")
      unsafe.push({
        path: site.path,
        reason: `could not be verified as safe (${d.error.kind})`,
      });
  }
  return unsafe;
}

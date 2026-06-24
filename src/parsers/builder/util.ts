/** Small shared helpers for the builder layer (generate + evaluate). */

import type { ScopeValue, TransformOp } from "../engine/types";

/** The transform dropdown's string form -> engine TransformOp. Object ops
 * (slice/lookup) are passed through untouched (they arrive only via JSON). */
export function toTransformOp(v: string | TransformOp): TransformOp {
  if (typeof v !== "string") return v;
  if (v === "parseDate:DMY") return { parseDate: "DMY" };
  if (v === "parseDate:YYMMDD") return { parseDate: "YYMMDD" };
  return v as TransformOp;
}

/** A capture group spec is a number ("1") or a named group. */
export function groupOf(s: string): number | string {
  const t = String(s).trim();
  return /^\d+$/.test(t) ? Number(t) : t;
}

export function num(v: ScopeValue): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? undefined : n;
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Strict YYYY-MM-DD with a real calendar check (mirrors engine/evaluate). */
export function isIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const date = new Date(`${s}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === Number(m[1]) &&
    date.getUTCMonth() + 1 === Number(m[2]) &&
    date.getUTCDate() === Number(m[3])
  );
}

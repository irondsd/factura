import {
  monthOf,
  parseAmountAR,
  parseAmountUS,
  parseDateDMY,
  parseDateYYMMDD,
} from "../helpers";
import { ParseError, type ScopeValue, type TransformOp } from "./types";

/** Apply one transform to a value. Throws ParseError on malformed input so the
 * bill routes to review (same contract as the hand-written helpers). */
function applyOne(op: TransformOp, value: ScopeValue): ScopeValue {
  if (value === undefined) return undefined;
  const s = String(value);
  if (typeof op === "string") {
    switch (op) {
      case "numberAR":
        return parseAmountAR(s);
      case "numberUS":
        return parseAmountUS(s);
      case "centsToAmount": {
        const n = Number(s);
        if (Number.isNaN(n)) throw new ParseError(`Bad cents value: "${s}"`);
        return n / 100;
      }
      case "stripLeadingZeros":
        return s.replace(/^0+/, "") || "0";
      case "monthOf":
        return monthOf(s);
      case "monthYear": {
        // A month/year period in any order/separator -> first of month.
        const nums = s.match(/\d+/g);
        if (!nums || nums.length < 2) {
          throw new ParseError(`Bad month-year: "${s}"`);
        }
        const yearFirst = nums[0].length === 4;
        const yearRaw = yearFirst ? nums[0] : nums[1];
        const monthRaw = yearFirst ? nums[1] : nums[0];
        const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
        const month = String(Number(monthRaw)).padStart(2, "0");
        return `${year}-${month}-01`;
      }
      case "toInt": {
        const n = parseInt(s, 10);
        if (Number.isNaN(n)) throw new ParseError(`Bad integer: "${s}"`);
        return n;
      }
      case "lowercase":
        return s.toLowerCase();
    }
  } else if ("slice" in op) {
    return s.slice(0, op.slice);
  } else if ("parseDate" in op) {
    return op.parseDate === "DMY" ? parseDateDMY(s) : parseDateYYMMDD(s);
  } else if ("lookup" in op) {
    return op.lookup[s];
  }
  throw new ParseError(`Unknown transform: ${JSON.stringify(op)}`);
}

export function applyTransforms(
  value: ScopeValue,
  ops: TransformOp[] | undefined,
): ScopeValue {
  let v = value;
  for (const op of ops ?? []) v = applyOne(op, v);
  return v;
}

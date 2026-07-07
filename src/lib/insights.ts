// Shared shaping for the vendor-share visuals on the Overview and Insights
// screens — keeps the donut + legend math in one place.

import { currentMonth, shiftMonth } from "@/lib/format";

// ── Range windows ─────────────────────────────────────────────────────────────
// The Insights screen no longer thinks in "last N months" but in an explicit
// month window. These pure, client-safe helpers (no DB/tRPC deps) are shared by
// the range control, the tRPC router and the demo fixtures so a window means the
// same thing everywhere.

/** An inclusive "YYYY-MM" → "YYYY-MM" window (both endpoints shown). */
export type InsightsWindow = { from: string; to: string };

/** Whole months between two "YYYY-MM" tags (signed; `to - from`). */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/** Inclusive "YYYY-MM" list from `lo` to `hi` (oldest → newest). Swaps the
 * endpoints if they arrive reversed so callers can't produce an empty list. */
export function monthRange(lo: string, hi: string): string[] {
  if (lo > hi) [lo, hi] = [hi, lo];
  const out: string[] = [];
  for (let m = lo; m <= hi; m = shiftMonth(m, 1)) out.push(m);
  return out;
}

/** The default window: the last 12 months ending at the current month. */
export function defaultWindow(): InsightsWindow {
  const to = currentMonth();
  return { from: shiftMonth(to, -11), to };
}

/** Longest window the router will aggregate — a pure abuse guard against a
 * hostile client (e.g. `from=1900-01`). Set far beyond any real history so the
 * "All" range never truncates. */
export const MAX_RANGE_MONTHS = 600;

/** Resolve an optional `{ from, to }` window into a concrete month list (oldest →
 * newest), given the caller's notion of "now". Clamps `to` to `now`, defaults a
 * missing `from` to a 12-month window, swaps a reversed pair, and caps the length.
 * Pure (takes `now` as an argument) so it's deterministic and unit-testable. */
export function resolveWindowMonths(
  from: string | undefined,
  to: string | undefined,
  now: string,
  max = MAX_RANGE_MONTHS,
): string[] {
  const hi = to && to < now ? to : now; // never aggregate past the current month
  let lo = from ?? shiftMonth(hi, -11);
  if (lo > hi) lo = hi;
  const count = Math.min(monthsBetween(lo, hi) + 1, max);
  return monthRange(shiftMonth(hi, -(count - 1)), hi);
}

// ── Range control chips ───────────────────────────────────────────────────────
// The "which chip is lit" logic, kept pure (span-index space, no React) so the
// range control stays a thin view over it and the edge cases are unit-testable.

/** Count presets offered by the range control, in chip order. */
export const RANGE_PRESETS = [6, 12, 24] as const;
export type RangePresetKey = "6" | "12" | "24";
export type RangeChip = RangePresetKey | "all" | "custom";

/** Which count preset a `[start, end]` span-index window matches (its end must
 * touch the newest month), or null when none does. */
export function presetForWindow(
  start: number,
  end: number,
  n: number,
): RangePresetKey | null {
  if (end !== n - 1) return null;
  for (const count of RANGE_PRESETS) {
    if (start === Math.max(0, n - count))
      return String(count) as RangePresetKey;
  }
  return null;
}

/** The chip to highlight for a window: an open panel is always CUSTOM; a window
 * spanning everything is ALL (it wins over a count preset when little data makes
 * them coincide); otherwise the matched preset, falling back to CUSTOM. */
export function activeRangeChip(
  start: number,
  end: number,
  n: number,
  panelOpen: boolean,
): RangeChip {
  if (panelOpen) return "custom";
  if (start === 0 && end === n - 1) return "all";
  return presetForWindow(start, end, n) ?? "custom";
}

export type Slice = {
  id: string;
  label: string;
  value: number;
  color: string;
};

/** Turn a `{ vendorId, value }[]` share list into renderable slices, resolving
 * each vendor's display name and color (with sensible fallbacks). */
export function toSlices(
  share: { vendorId: string; value: number }[],
  vendors: { id: string; displayName: string; color: string }[],
): Slice[] {
  const byId = new Map(vendors.map((v) => [v.id, v]));
  return share.map((s) => {
    const v = byId.get(s.vendorId);
    return {
      id: s.vendorId,
      label: v?.displayName ?? "—",
      value: s.value,
      color: v?.color ?? "var(--muted)",
    };
  });
}

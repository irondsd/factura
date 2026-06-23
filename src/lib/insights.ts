// Shared shaping for the vendor-share visuals on the Overview and Insights
// screens — keeps the donut + legend math in one place.

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

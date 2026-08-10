// Geometry shared by the site's *static* SVG figures — the ones the guides and
// the statistics pages render on the server, without recharts. See the note at
// the top of `components/guides/InflacionChart.tsx` for why those pages draw
// their own charts instead of shipping a charting library to a reader.
//
// Pure arithmetic, no React and no styling: everything here takes numbers in
// viewBox units and gives back numbers or a path string.

export type Point = { x: number; y: number };

/**
 * A smooth path through the points, using Fritsch–Carlson monotone cubic
 * interpolation — the same curve recharts draws for `type="monotone"`, so the
 * static figures and the in-app charts bend alike.
 *
 * Monotone, specifically: a plain cubic spline overshoots after a flat stretch
 * and invents a dip the series never had, which on a price index reads as
 * "prices fell". This one passes through every point and stays within them.
 */
export function smoothPath(points: Point[]): string {
  const n = points.length;
  if (n === 0) return "";
  const r = (v: number) => Math.round(v * 100) / 100;
  const start = `M${r(points[0].x)} ${r(points[0].y)}`;
  if (n === 1) return start;

  // Secant slope of each segment, then a tangent per point: the average of the
  // two neighbouring secants, flattened to 0 wherever the series turns.
  const secant = points
    .slice(1)
    .map((p, i) => (p.y - points[i].y) / (p.x - points[i].x));
  const tangent = points.map((_, i) =>
    i === 0
      ? secant[0]
      : i === n - 1
        ? secant[n - 2]
        : secant[i - 1] * secant[i] <= 0
          ? 0
          : (secant[i - 1] + secant[i]) / 2,
  );

  // Fritsch–Carlson: clamp each tangent pair into the circle of radius 3 around
  // its secant. That bound is what keeps the segment monotone.
  for (let i = 0; i < n - 1; i++) {
    if (secant[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / secant[i];
    const b = tangent[i + 1] / secant[i];
    const s = a * a + b * b;
    if (s > 9) {
      const scale = 3 / Math.sqrt(s);
      tangent[i] = scale * a * secant[i];
      tangent[i + 1] = scale * b * secant[i];
    }
  }

  let d = start;
  for (let i = 0; i < n - 1; i++) {
    const p = points[i];
    const q = points[i + 1];
    const h = (q.x - p.x) / 3;
    d +=
      ` C${r(p.x + h)} ${r(p.y + tangent[i] * h)}` +
      ` ${r(q.x - h)} ${r(q.y - tangent[i + 1] * h)}` +
      ` ${r(q.x)} ${r(q.y)}`;
  }
  return d;
}

/** The gridline values for a series that can go either side of zero.
 *
 * Both ends are rounded outward to a multiple of a 1/2/5-style step, so the
 * ticks land on numbers a reader recognises and zero — which is the line that
 * matters on a variation chart — is always one of them. `target` is how many
 * intervals to aim for; the step chosen is the smallest "nice" one that doesn't
 * exceed it, so the axis never ends up with twenty labels on a phone. */
export function niceTicks(
  min: number,
  max: number,
  target = 4,
): { ticks: number[]; lo: number; hi: number } {
  // A flat series would give a zero-height span and a division by zero below.
  const span = Math.max(max - min, 1e-9);
  const rough = span / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    magnitude *
    ([1, 2, 5, 10].find((m) => magnitude * m >= rough - 1e-9) ?? 10);

  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;

  const ticks: number[] = [];
  // Count the steps rather than accumulating: adding 0.1 twenty times lands on
  // 2.0000000000000004, and that renders as an axis label.
  for (let i = 0; lo + i * step <= hi + step / 2; i++) {
    ticks.push(Math.round((lo + i * step) * 1e6) / 1e6);
  }
  return { ticks, lo, hi };
}

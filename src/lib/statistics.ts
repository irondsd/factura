// Small, dependency-free statistical primitives shared by the derived content
// datasets. These functions know nothing about barrios, prices or bills; domain
// modules remain responsible for deciding which observations belong in a fit.

/** Percentile rank of every value, 0–1 ascending, with ties sharing the
 * average position they span. The output stays aligned with the input. */
export function percentileRanks(values: readonly number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [0.5];

  const order = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const out = new Array<number>(n);

  let start = 0;
  while (start < n) {
    let end = start;
    while (end + 1 < n && order[end + 1].value === order[start].value) {
      end++;
    }
    const rank = (start + end) / 2 / (n - 1);
    for (let i = start; i <= end; i++) out[order[i].index] = rank;
    start = end + 1;
  }

  return out;
}

export type LinearFit = {
  slope: number;
  intercept: number;
  /** Pearson correlation, −1 to 1. */
  r: number;
  /** Share of y variance accounted for by x, 0 to 1. */
  r2: number;
  n: number;
};

/** Ordinary least-squares fit of y on x. Returns null for mismatched arrays,
 * fewer than two observations, or a constant x/y series. */
export function linearFit(
  xs: readonly number[],
  ys: readonly number[],
): LinearFit | null {
  if (xs.length !== ys.length || xs.length < 2) return null;

  const n = xs.length;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / n;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;

  for (let i = 0; i < n; i++) {
    covariance += (xs[i] - meanX) * (ys[i] - meanY);
    varianceX += (xs[i] - meanX) ** 2;
    varianceY += (ys[i] - meanY) ** 2;
  }
  if (varianceX === 0 || varianceY === 0) return null;

  const slope = covariance / varianceX;
  const r = covariance / Math.sqrt(varianceX * varianceY);
  return {
    slope,
    intercept: meanY - slope * meanX,
    r,
    r2: r * r,
    n,
  };
}

/** Median of a non-empty list. Domain callers decide how an empty sample
 * should be represented, so the primitive returns null rather than inventing a
 * value. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

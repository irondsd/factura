/**
 * Quarter arithmetic for the IDECBA refreshes, and the one function that reads
 * a period axis out of a sheet title.
 *
 * Separated from the script that uses it because this is where a silent error
 * would live: every other failure in that pipeline throws, but an axis that is
 * off by one quarter relabels the whole series and still looks like data. It
 * has tests next door for that reason, and the rent refresh will reuse it.
 *
 * A period is `YYYYQn` — "2026Q2".
 */

const QUARTER: Record<string, number> = {
  "1er": 1,
  "2do": 2,
  "3er": 3,
  "4to": 4,
};

/** Quarters since year 0 — the only thing period arithmetic needs. */
export const ordinal = (period: string): number =>
  Number(period.slice(0, 4)) * 4 + Number(period.slice(5)) - 1;

export const fromOrdinal = (n: number): string =>
  `${Math.floor(n / 4)}Q${(n % 4) + 1}`;

/** Every quarter from `start` to `end` inclusive, oldest first. */
export function quarters(start: string, end: string): string[] {
  const out: string[] = [];
  for (let n = ordinal(start); n <= ordinal(end); n++) out.push(fromOrdinal(n));
  return out;
}

/**
 * The range an IDECBA sheet states in its own title, e.g.
 * "… por barrio. Ciudad de Buenos Aires. 1er. trimestre de 2017/2do. trimestre
 * de 2026" → `{ start: "2017Q1", end: "2026Q2" }`.
 *
 * The title is used rather than the sheet's header rows on purpose. Those files
 * carry a merged year row whose values do not sit at their own merge anchors,
 * so walking it column by column yields an axis several quarters out of step.
 * The title says the range in words, and the caller checks the implied length
 * against the actual column count.
 */
export function titleRange(title: string): { start: string; end: string } {
  const found = [
    ...title.matchAll(/(1er|2do|3er|4to)\.?\s*trimestre de (\d{4})/g),
  ].map((m) => `${m[2]}Q${QUARTER[m[1]]}`);
  if (found.length !== 2) {
    throw new Error(`could not read a quarter range from the title: ${title}`);
  }
  if (ordinal(found[0]) > ordinal(found[1])) {
    throw new Error(`title range runs backwards: ${found[0]}→${found[1]}`);
  }
  return { start: found[0], end: found[1] };
}

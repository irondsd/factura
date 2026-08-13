/**
 * Month arithmetic for the IDECBA refreshes, and the one function that reads a
 * monthly period axis out of a sheet title.
 *
 * The monthly sibling of `quarters.ts`, and separated for the same reason: an
 * axis that is off by one relabels the whole series and still looks like data,
 * so it is the one piece of that pipeline that gets tests of its own.
 *
 * The superficie tables need this because they are published *monthly* — 157
 * columns where the price tables have 38 — and their titles say so in words:
 * "… por barrio. Ciudad de Buenos Aires. Julio de 2013/julio de 2026". There is
 * no ordinal to key on, only the Spanish month name, and the case is not
 * consistent: the first is capitalised because it opens the range, the second is
 * not.
 *
 * A period is `YYYY-MM` — "2026-07". Hyphenated rather than the quarterly
 * `YYYYQn` because it is already the ISO 8601 month schema.org's
 * `temporalCoverage` wants, so nothing downstream has to convert it.
 */

/** Lowercased, unaccented month name → 1-12. The unaccenting matters for
 * exactly one month: `marzo` is fine, `Marzo` is fine, but IDECBA writes the
 * range as "Marzo de 2010/julio de 2026" and elsewhere as "Julio", so the
 * lookup is done on a folded key rather than on what the sheet happens to say. */
const MONTH: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

/** Months since year 0 — the only thing period arithmetic needs. */
export const ordinal = (period: string): number =>
  Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7)) - 1;

export const fromOrdinal = (n: number): string =>
  `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;

/** Every month from `start` to `end` inclusive, oldest first. */
export function months(start: string, end: string): string[] {
  const out: string[] = [];
  for (let n = ordinal(start); n <= ordinal(end); n++) out.push(fromOrdinal(n));
  return out;
}

/**
 * The range an IDECBA sheet states in its own title, e.g.
 * "Superficie total (metros cuadrados) de departamentos publicados en alquiler
 * de 2 ambientes (usados y a estrenar) por barrio. Ciudad de Buenos Aires.
 * Julio de 2013/julio de 2026" → `{ start: "2013-07", end: "2026-07" }`.
 *
 * The title is used rather than the sheet's header rows for the same reason
 * `titleRange` in `quarters.ts` is: those files carry a merged year row whose
 * values do not sit at their own merge anchors, so walking it column by column
 * yields an axis several periods out of step. Worse here than there — a monthly
 * sheet has thirteen years of merged year cells to get wrong. The title says
 * the range in words, and the caller checks the implied length against the
 * actual column count.
 *
 * Anchored on "<mes> de <año>" rather than on the two ends of the slash,
 * because the sheet titles put other four-digit numbers nowhere near the range
 * but do vary in whether they leave a space around it.
 */
export function titleMonths(title: string): { start: string; end: string } {
  const names = Object.keys(MONTH).join("|");
  const found = [
    ...title.matchAll(new RegExp(`(${names})\\s+de\\s+(\\d{4})`, "gi")),
  ].map((m) => `${m[2]}-${String(MONTH[m[1].toLowerCase()]).padStart(2, "0")}`);
  if (found.length !== 2) {
    throw new Error(`could not read a month range from the title: ${title}`);
  }
  if (ordinal(found[0]) > ordinal(found[1])) {
    throw new Error(`title range runs backwards: ${found[0]}→${found[1]}`);
  }
  return { start: found[0], end: found[1] };
}

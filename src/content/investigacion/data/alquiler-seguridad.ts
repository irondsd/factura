import * as alquiler from "../../estadisticas/data/alquiler-caba";
import * as delitos from "../../estadisticas/data/delitos-caba";
import { linearFit, median, percentileRanks } from "@/lib/statistics";

// Rent against recorded crime, barrio by barrio and comuna by comuna — the
// dataset behind /investigacion/barrios-seguros-baratos-caba.
//
// Like `rentabilidad-caba.ts`, this module publishes no source figures at all.
// It is a *join*: two official series that already live under
// `content/estadisticas/data`, lined up on the same 48 barrios and 15 comunas,
// plus the arithmetic that lets one be read against the other. That makes the
// arithmetic the thing to get right and to write down, which is what most of
// this header is.
//
// ── The problem: crimes are not pesos ─────────────────────────────────────
// "Cheap and safe" asks for one ordering out of two quantities in incompatible
// units — pesos per m² a month, and recorded events per 1.000 residents a year.
// There is no conversion that isn't a choice. This module makes the choice
// twice, in two different ways, because the two answer different questions and
// each one covers the other's weakness:
//
//   1. `rows()` — **percentile ranks, averaged.** Each region gets a 0-100
//      score on each axis (100 = cheapest / calmest of the regions being
//      compared) and the two are averaged with a weight the reader picks.
//      Answers "where do I get the most of both", and is the map.
//
//   2. `fit()` — **the market's own exchange rate.** Regress rent per m² on the
//      crime rate across regions. The slope is what the rental market already
//      discounts for a barrio's recorded crime, in pesos, derived rather than
//      invented. Answers "is safety something I'm already paying for", and is
//      the scatter.
//
// ── Why ranks and not the values themselves ───────────────────────────────
// Min–max normalising the two levels looks more informative and is much worse
// here, because the two distributions are shaped nothing alike. Rent per m²
// spans about 1,4× across the city; the crime rate spans more than 6×, with a
// long right tail — San Nicolás alone sits at three and a half times the city
// average. Scaled to their own ranges, every residential barrio would land in
// the top few percent of the safety axis, the differences between them would
// round away, and the "combined" score would be the rent ranking wearing a hat.
//
// Ranks give each axis the same say by construction. The cost is real and worth
// stating on the page: a rank says *where a barrio sits among the others*, not
// how far apart they are. Two barrios twenty rank-points apart may be a few
// hundred pesos and half a crime per 1.000 apart, which is why every table here
// prints the levels beside the score.
//
// ── Why the percentiles are taken over the *scored* regions ───────────────
// A region can only be scored if IDECBA published a rent for it, and for
// barrios that is about 31 of 48. Both percentiles are computed over that same
// surviving set, so the two halves of a score always describe one population.
// The alternative — ranking safety over all 48 and price over the 31 — would
// average two numbers that mean different things.
//
// The 17 barrios that drop out are NOT a random sample, and this is the single
// most important caveat on the page. IDECBA withholds a barrio when too few
// units are advertised there, which happens at both ends of the city: the very
// cheap periphery (Villa Soldati, Nueva Pompeya, Mataderos) and the very quiet
// small barrios (Agronomía, Parque Chas, Coghlan) alike. Several of the latter
// are among the calmest in the city and would score near the top if they could
// be priced. `coverage()` exists to name them, with their safety rank among all
// 48, so the page can show what its own ranking cannot see.
//
// ── Two vintages, one table ───────────────────────────────────────────────
// The rent series is quarterly and the crime series is annual, so a row here
// pairs the latest quarter of one with the latest closed year of the other.
// That is the only pairing available and it is fine for a ranking — barrios do
// not swap places on either axis within a year — but it is not a snapshot of a
// single instant, and every figure on the page says both dates.
//
// ── What this cannot be ───────────────────────────────────────────────────
// Not a risk model. `delitos-caba.ts` sets out at length why a rate per
// *resident* overstates barrios whose daytime population dwarfs their census
// one; that distortion arrives here intact, and it is why the crime axis can be
// switched to `personas` — lesiones, amenazas y homicidios — which tracks
// commercial footfall far less than a stolen phone in the microcentro does.
//
// ── Refreshing ────────────────────────────────────────────────────────────
// Nothing to refresh directly. Run `bun run data:caba` and `bun run data:delitos`
// and everything here follows.

export type Geo = "barrios" | "comunas";
export type SizeId = alquiler.SizeId;
export type CategoryId = delitos.CategoryId;

/** The three unit sizes, from the rent module. */
export const SIZES = alquiler.SIZES;
export const SIZE_IDS = alquiler.SIZE_IDS;

/** The size the page works in: the most advertised segment, and — with one
 * ambiente — the one with the widest barrio coverage. */
export const DEFAULT_SIZE: SizeId = "amb2";

/** The four cuts of the offence taxonomy, from the crime module. */
export const CATEGORIES = delitos.CATEGORIES;
export const DEFAULT_CATEGORY: CategoryId = "total";

/** Opens on comunas, for the rent page's reason: this map's coverage is the
 * rent map's coverage, which is about 31 of 48 barrios against 14 of 15
 * comunas. A map that is a third holes is a poor first impression of a join
 * that is fine. The barrio view is one click away. */
export const DEFAULT_GEO: Geo = "comunas";

/** Where the rent figure is from, and where the crime figure is from. Two
 * different vintages on purpose — see the header. */
export const RENT_PERIOD = alquiler.LAST_PERIOD;
export const RENT_PERIOD_LABEL = alquiler.LAST_UPDATED;
export const CRIME_YEAR = delitos.LAST_YEAR;

export const RENT_SOURCE = alquiler.SOURCE;
export const CRIME_SOURCE = delitos.SOURCE;

/** The surface each monthly rent assumes, in m² — IDECBA's own, which is what
 * makes the per-metre figure the source's rather than ours. */
export const REFERENCE_AREA = alquiler.REFERENCE_AREA;

/** The span the joined dataset covers, as the ISO 8601 interval schema.org's
 * `temporalCoverage` wants: from the start of the crime year to the quarter of
 * the rent snapshot. Derived, so it cannot claim a coverage the files no longer
 * have. */
export const TEMPORAL_COVERAGE = `${CRIME_YEAR}-01/${RENT_PERIOD.slice(0, 4)}-${String(
  (Number(RENT_PERIOD.slice(5)) - 1) * 3 + 1,
).padStart(2, "0")}`;

// ── How much each half counts ──────────────────────────────────────────────

/**
 * The three weightings the reader can switch between, as the weight on the
 * *price* half. Quarters rather than arbitrary decimals so the setting can be
 * said in words: three-quarters price, half and half, three-quarters safety.
 *
 * Offering the weight at all is the point. There is no correct one — it is a
 * preference, not a parameter — and a page that picked 50/50 silently would be
 * presenting a choice as a finding.
 */
export const PRIORITIES = [
  {
    id: "precio",
    label: "Prioriza el precio",
    short: "Precio",
    weight: 0.75,
    /** Used in a sentence: "ordenado {inTitle}". */
    inTitle: "dando tres cuartos del peso al precio",
  },
  {
    id: "equilibrado",
    label: "Equilibrado",
    short: "Equilibrio",
    weight: 0.5,
    inTitle: "con precio y seguridad pesando lo mismo",
  },
  {
    id: "seguridad",
    label: "Prioriza la seguridad",
    short: "Seguridad",
    weight: 0.25,
    inTitle: "dando tres cuartos del peso a la seguridad",
  },
] as const satisfies readonly {
  id: string;
  label: string;
  short: string;
  weight: number;
  inTitle: string;
}[];

export type PriorityId = (typeof PRIORITIES)[number]["id"];

export const DEFAULT_PRIORITY: PriorityId = "equilibrado";

export const weightOf = (priority: PriorityId): number =>
  PRIORITIES.find((p) => p.id === priority)!.weight;

// ── The join ───────────────────────────────────────────────────────────────

export type Row = {
  id: string;
  label: string;
  /** Secondary line — the comuna a barrio sits in, or the barrios a comuna
   * groups. What lets a reader find themselves on the map. */
  meta: string;
  /** IDECBA's asking rent, pesos a month for a flat of `REFERENCE_AREA[size]`.
   * `null` where it was withheld. */
  rentMonthly: number | null;
  /** The same rent per m², which is what compares across sizes. `null` with
   * `rentMonthly`. */
  rentPerMetre: number | null;
  /** Recorded events per 1.000 residents a year. Never `null`: a count is never
   * suppressed, so this half of the join is complete for all 48 and all 15. */
  crimeRate: number;
  /** The same as a multiple of the city's — how `delitos-caba` shades its own
   * map, carried through so a reader can cross-check against that page. */
  crimeRatio: number;
  /** 0-100, 100 = cheapest of the regions that can be scored. `null` where the
   * rent was withheld. */
  cheap: number | null;
  /** 0-100, 100 = calmest of the regions that can be scored. `null` alongside
   * `cheap` — see the header for why safety is not scored on its own. */
  safe: number | null;
  /** The weighted average of the two, 0-100. `null` alongside them. */
  score: number | null;
};

/**
 * Percentile rank of every value, 0-1, ascending, ties sharing the average of
 * the positions they span.
 *
 * Ties matter more here than they look: IDECBA's rents are quarterly averages
 * rounded to the peso, and two comunas can land on the same figure. Assigning
 * them consecutive ranks would order them by array position, which is
 * alphabetical, which is nothing.
 */
/** Every region of a map, in registry order, for one size, one crime category
 * and one weighting. Regions IDECBA withheld a rent for are present with `null`
 * scores rather than dropped — the map hatches them and the coverage note names
 * them. */
export function rows(
  geo: Geo,
  size: SizeId = DEFAULT_SIZE,
  category: CategoryId = DEFAULT_CATEGORY,
  weight = weightOf(DEFAULT_PRIORITY),
): Row[] {
  const crime = new Map(
    delitos.rows(geo, category).map((r) => [r.id, r] as const),
  );
  const base = alquiler.rows(geo, size).map((r) => {
    const c = crime.get(r.id);
    if (!c) {
      // The two series are built on the same registry, so this cannot happen
      // without one of them having been rebuilt against a changed geography.
      throw new Error(
        `alquiler-seguridad: no crime figure for ${geo} "${r.id}" — the two datasets disagree about the city`,
      );
    }
    return {
      id: r.id,
      label: r.label,
      meta: r.meta,
      rentMonthly: r.monthly,
      rentPerMetre: r.perMetre,
      crimeRate: c.rate,
      crimeRatio: c.ratio,
    };
  });

  const scorable = base.filter(
    (r): r is (typeof base)[number] & { rentPerMetre: number } =>
      r.rentPerMetre !== null,
  );
  // Both axes inverted: the highest score is the cheapest and the calmest.
  const cheap = percentileRanks(scorable.map((r) => r.rentPerMetre));
  const safe = percentileRanks(scorable.map((r) => r.crimeRate));
  const scores = new Map(
    scorable.map((r, i) => {
      const c = (1 - cheap[i]) * 100;
      const s = (1 - safe[i]) * 100;
      return [
        r.id,
        { cheap: c, safe: s, score: weight * c + (1 - weight) * s },
      ];
    }),
  );

  return base.map((r) => ({
    ...r,
    cheap: scores.get(r.id)?.cheap ?? null,
    safe: scores.get(r.id)?.safe ?? null,
    score: scores.get(r.id)?.score ?? null,
  }));
}

/** A row that survived the join — every field present. */
export type ScoredRow = Row & {
  rentMonthly: number;
  rentPerMetre: number;
  cheap: number;
  safe: number;
  score: number;
};

const isScored = (r: Row): r is ScoredRow => r.score !== null;

/** The regions that can be scored, **best first** — the opposite convention to
 * the two price pages, where first means dearest. Rank 1 here is the best
 * combination of the two, which is the only ordering a reader of this page
 * expects. */
export const ranked = (
  geo: Geo,
  size: SizeId = DEFAULT_SIZE,
  category: CategoryId = DEFAULT_CATEGORY,
  weight = weightOf(DEFAULT_PRIORITY),
): ScoredRow[] =>
  rows(geo, size, category, weight)
    .filter(isScored)
    .sort((a, b) => b.score - a.score);

/** The city's own two figures, for the line every region is read against.
 * IDECBA's weighted "Total" row rather than an average of the barrios, and the
 * city's real crime rate including the events no barrio could be assigned. */
export function ciudad(
  size: SizeId = DEFAULT_SIZE,
  category: CategoryId = DEFAULT_CATEGORY,
): {
  rentMonthly: number | null;
  rentPerMetre: number | null;
  crimeRate: number;
} {
  return {
    rentMonthly: alquiler.ciudad(size),
    rentPerMetre: alquiler.ciudadPerMetre(size),
    crimeRate: delitos.cityRate(category),
  };
}

// ── What the ranking cannot see ────────────────────────────────────────────

export type Missing = {
  id: string;
  label: string;
  meta: string;
  crimeRate: number;
  /** Position among *all* regions of this geography by crime rate, calmest
   * first. This is the number that matters: it is how the page can say that
   * several of the quietest barrios in the city are missing from its own
   * ranking. */
  safetyRank: number;
  of: number;
};

/** How many regions can be scored, and — named, with their safety rank — the
 * ones that cannot. The honesty line of the whole page. */
export function coverage(
  geo: Geo,
  size: SizeId = DEFAULT_SIZE,
  category: CategoryId = DEFAULT_CATEGORY,
): { withData: number; total: number; missing: Missing[] } {
  const all = rows(geo, size, category);
  const byCrime = [...all].sort((a, b) => a.crimeRate - b.crimeRate);
  const rankOf = new Map(byCrime.map((r, i) => [r.id, i + 1]));
  const missing = all
    .filter((r) => r.rentPerMetre === null)
    .map((r) => ({
      id: r.id,
      label: r.label,
      meta: r.meta,
      crimeRate: r.crimeRate,
      safetyRank: rankOf.get(r.id)!,
      of: all.length,
    }))
    .sort((a, b) => a.safetyRank - b.safetyRank);
  return { withData: all.length - missing.length, total: all.length, missing };
}

// ── The market's own exchange rate ─────────────────────────────────────────

/**
 * What the rental market discounts for a barrio's recorded crime.
 *
 * An ordinary least-squares fit of rent per m² on the crime rate, across the
 * regions that have both. `slope` is the answer to the question the page is
 * named after, in the only currency both quantities share: pesos.
 *
 *   slope < 0  rent falls as recorded crime rises — the market prices safety;
 *   slope ≈ 0  the two are unrelated and "cheap and safe" costs nothing to ask
 *              for;
 *   slope > 0  the dearest barrios record the most crime, which is what a rate
 *              per resident does in a city with a commercial core.
 *
 * Levels rather than logs, unlike the elasticity on the rentability page. The
 * question there was about proportions ("twice as expensive to buy, how much
 * more to rent?"); the question here is about a price per unit, and the unit —
 * one recorded crime per 1.000 residents a year — is meaningful on its own.
 *
 * `r2` is the part that must be quoted with it. A slope with an R² of 0,15 says
 * the market leans that way and that most of what moves rent is something else
 * entirely, which is exactly why the scatter is worth drawing: the residuals
 * are where the barrios worth finding live.
 */
export type Fit = {
  /** Pesos per m² a month, per extra recorded crime per 1.000 residents. */
  slope: number;
  intercept: number;
  /** Pearson correlation, −1 to 1. */
  r: number;
  /** Share of the variance in rent the crime rate accounts for, 0-1. */
  r2: number;
  /** Regions behind it. */
  n: number;
  /** The slope on a whole flat of the size's reference surface — the same fact
   * in the unit a renter thinks in, pesos a month. Negative when the market
   * discounts. */
  perFlat: number;
  /** The surface that conversion uses, m². */
  area: number;
  /** The fitted rent at the calmest and at the most crime-heavy region in the
   * sample, per m². The gap between them is the whole discount the market
   * applies across the observed range. */
  atCalmest: number;
  atWorst: number;
  /** The crime rates those two are evaluated at. */
  calmestRate: number;
  worstRate: number;
};

export function fit(
  geo: Geo,
  size: SizeId = DEFAULT_SIZE,
  category: CategoryId = DEFAULT_CATEGORY,
): Fit | null {
  const points = rows(geo, size, category).filter(isScored);
  // Two points fit a line exactly and report a meaningless R².
  if (points.length < 5) return null;

  const xs = points.map((p) => p.crimeRate);
  const ys = points.map((p) => p.rentPerMetre);
  const regression = linearFit(xs, ys);
  if (!regression) return null;
  const { slope, intercept, r, r2, n } = regression;
  const calmestRate = Math.min(...xs);
  const worstRate = Math.max(...xs);
  return {
    slope,
    intercept,
    r,
    r2,
    n,
    perFlat: slope * REFERENCE_AREA[size],
    area: REFERENCE_AREA[size],
    atCalmest: intercept + slope * calmestRate,
    atWorst: intercept + slope * worstRate,
    calmestRate,
    worstRate,
  };
}

export type Point = ScoredRow & {
  /** Actual rent minus the rent the fit predicts for this crime rate, in pesos
   * per m². Negative = cheaper than the city's own pricing of its crime level
   * would suggest, which is the interesting direction. */
  residual: number;
};

/** Everything the scatter needs, computed once on the server so the drawn line
 * and the quoted slope can never describe different fits. */
export function dispersion(
  geo: Geo,
  size: SizeId = DEFAULT_SIZE,
  category: CategoryId = DEFAULT_CATEGORY,
): {
  points: Point[];
  fit: Fit;
  /** The fitted line as its two endpoints — it is straight in these axes, so
   * two points are the whole of it. */
  line: { crimeRate: number; rentPerMetre: number }[];
  /** Medians of the plotted points, which is where the quadrant lines go. The
   * median rather than the city average: the city figures are weighted by how
   * many units were advertised and by where crime is recorded, so neither of
   * them splits *these points* in half, which is what a quadrant line claims to
   * do. */
  median: { crimeRate: number; rentPerMetre: number };
} | null {
  const f = fit(geo, size, category);
  if (!f) return null;
  const points = rows(geo, size, category)
    .filter(isScored)
    .map((r) => ({
      ...r,
      residual: r.rentPerMetre - (f.intercept + f.slope * r.crimeRate),
    }));
  return {
    points,
    fit: f,
    line: [
      { crimeRate: f.calmestRate, rentPerMetre: f.atCalmest },
      { crimeRate: f.worstRate, rentPerMetre: f.atWorst },
    ],
    median: {
      crimeRate: median(points.map((p) => p.crimeRate))!,
      rentPerMetre: median(points.map((p) => p.rentPerMetre))!,
    },
  };
}

// ── Does the answer survive the assumptions ────────────────────────────────

export type Combination = {
  size: SizeId;
  sizeLabel: string;
  category: CategoryId;
  categoryLabel: string;
  /** How many regions this combination can score — it changes with the size,
   * because IDECBA's coverage does. */
  n: number;
  top: ScoredRow[];
};

/**
 * The same ranking recomputed under every unit size and a choice of crime
 * category, so a reader can see which names survive the assumptions and which
 * are artefacts of one.
 *
 * This is the figure that keeps the page honest. A combined index built from
 * two arbitrary choices — which flat, which crimes — is worth exactly as much
 * as its stability under those choices, and the only way to show that is to
 * change them and look. Note that the sample changes too: three-ambiente rents
 * are published for far fewer barrios, so a name can disappear from a column by
 * not being priced rather than by scoring badly.
 */
export function sensitivity(
  geo: Geo,
  weight = weightOf(DEFAULT_PRIORITY),
  categories: readonly CategoryId[] = ["total", "personas"],
  topN = 5,
): { combinations: Combination[]; consensus: ScoredRow[] } {
  const combinations: Combination[] = [];
  for (const size of SIZE_IDS) {
    for (const category of categories) {
      const order = ranked(geo, size, category, weight);
      combinations.push({
        size,
        sizeLabel: SIZES.find((s) => s.id === size)!.short,
        category,
        categoryLabel: CATEGORIES.find((c) => c.id === category)!.short,
        n: order.length,
        top: order.slice(0, topN),
      });
    }
  }

  // Named in every single column. Ordered by the default combination's ranking
  // so the list reads the same way as the map above it.
  const counts = new Map<string, number>();
  for (const c of combinations) {
    for (const r of c.top) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
  }
  const everywhere = new Set(
    [...counts].filter(([, n]) => n === combinations.length).map(([id]) => id),
  );
  const consensus = ranked(geo, DEFAULT_SIZE, DEFAULT_CATEGORY, weight).filter(
    (r) => everywhere.has(r.id),
  );

  return { combinations, consensus };
}

// ── The colour scale ───────────────────────────────────────────────────────

/**
 * Upper bounds of the six shading classes, in score points.
 *
 * Fixed rather than quantiles, and one scale for every view. The scores are
 * percentile-based, so they are roughly uniform over 0-100 by construction and
 * a fixed cut spreads the city evenly without repainting it every refresh.
 *
 * **Note the direction.** On the price maps dark means expensive; here dark
 * means a *higher* score, which is the better place to look. The legend says so
 * and so does the page, because a map that inverts the reader's habit and stays
 * quiet about it is worse than no map.
 */
export const BREAKS = [35, 45, 55, 65, 75] as const;

// ── Formatting ─────────────────────────────────────────────────────────────

const WHOLE = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const ONE_DP = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const TWO_DP = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** The combined score, whole. The inputs are two ranks over a few dozen
 * regions; a decimal would claim a resolution the arithmetic doesn't have. */
export const formatScore = (value: number): string => WHOLE.format(value);

/** Pesos a month, whole — IDECBA's own precision is an artefact of averaging. */
export const formatArs = alquiler.formatArs;

/** Pesos per m², rounded to the hundred, for a *level*: a rent is tens of
 * thousands and its last two digits are noise. */
export const formatArsPerMetre = alquiler.formatArsPerMetre;

/**
 * Pesos per m² for the fitted **slope**, whole rather than rounded to the
 * hundred.
 *
 * A separate formatter and not an oversight: the slope is a few tens of pesos —
 * the discount for *one* extra recorded crime per 1.000 residents — so
 * `formatArsPerMetre` rounds it to "$ 0/m²" and prints the page's central
 * finding as nothing. The two are different quantities that happen to share a
 * unit, and rounding that suits a rent destroys a rate of change.
 */
export const formatArsPerMetreRate = (value: number): string =>
  `$ ${WHOLE.format(Math.round(value))}/m²`;

/** "38,9" — a crime rate with the unit left to the column header. */
export const formatRate = (value: number): string => ONE_DP.format(value);
export const formatRateLong = (value: number): string =>
  `${ONE_DP.format(value)} cada 1.000 hab.`;

/** A correlation or an R², which are read to two decimals or not at all. */
export const formatCoefficient = (value: number): string =>
  TWO_DP.format(value);

export const NO_DATA = "Sin dato";

export const display = (value: number | null): string | null =>
  value === null ? null : formatScore(value);

/** The legend, lowest class first. Score points, like the shading. */
export const LEGEND: { label: string }[] = [
  { label: `menos de ${BREAKS[0]}` },
  ...BREAKS.slice(1).map((b, i) => ({ label: `${BREAKS[i]} – ${b}` })),
  { label: `${BREAKS[BREAKS.length - 1]} o más` },
];

import * as alquiler from "./alquiler-caba";
import { BARRIOS } from "@/content/shared/caba";
import { rate, type RateId, RATE } from "./dolar";
import * as venta from "./venta-caba";
import { linearFit } from "@/lib/statistics";

// Gross rental yield for CABA — what a flat returns a year, as a percentage of
// what it costs to buy. The dataset behind
// /estadisticas/rentabilidad-alquiler-caba.
//
// Unlike every other module in this directory, this one publishes no source
// figures at all. It is a *derived* dataset: three files joined on a quarter,
// and one division. That makes the arithmetic the thing to get right and to
// write down, which is what most of this header is.
//
// ── The formula, and why the reference surface is IDECBA's ────────────────
// IDECBA publishes sale as dollars per m² and rent as pesos a month for a flat
// of a stated surface. To divide one by the other, both have to describe the
// same object. So the yield here prices *one flat of IDECBA's own reference
// surface*:
//
//               12 × (monthly rent in pesos ÷ ARS-per-USD)
//   yield  =  ──────────────────────────────────────────────  × 100
//                (dollars per m²) × (reference surface)
//
// with the reference surface being `alquiler.REFERENCE_AREA` — 30 m² for one
// ambiente, 43 for two, 70 for three — because that is the surface the rent
// figure in the numerator already assumes. IDECBA states it in each sheet's
// footnote and the refresh script reads it out; it is the source's own
// methodology, not a number anyone here picked.
//
// **`venta.REFERENCE_AREA` must never be used here.** That one is 35/50/70 and
// is explicitly ours — round sizes chosen to illustrate what a whole flat costs
// on the sale page. Substituting it would price a 50 m² flat against the rent
// of a 43 m² one and inflate every yield on this page by about 16 %, silently,
// because the result would still look entirely plausible.
//
// ── What the two constants do and do not move ─────────────────────────────
// The exchange rate and the reference surface are both *constants within a
// quarter and a size*. Every region is divided by the same pair. So they set
// the level of the series and have no effect whatsoever on the ordering of
// barrios — the map and every ranking on the page are arithmetically identical
// under any rate and any surface. That is worth knowing before reading the
// argument about which rate to use, because it settles what the argument is
// actually about: the height of the curve, not the shape of the map. The rate
// itself is argued in `dolar.ts`.
//
// ── Asking prices on both sides ───────────────────────────────────────────
// Numerator and denominator are both prices *asked* in listings, never prices
// agreed. The two biases do not cancel: sale asking prices are negotiated down
// harder than rents are, so the true yield is somewhat above what this computes.
// The page says so rather than pretending the ratio launders the problem.
//
// It is also a **gross** yield. Expensas, ABL, income tax, insurance, vacancy,
// agency fees and maintenance all come out of the numerator in real life, and
// none of them are in any of these three files. The net figure is materially
// lower and this dataset cannot produce it.
//
// ── Refreshing ────────────────────────────────────────────────────────────
// Nothing to refresh directly. Run `bun run data:caba` and `bun run data:dolar`
// and this follows. The period axis is the intersection of the three, so a
// dataset that lags a quarter shortens this series rather than corrupting it.

export type SizeId = alquiler.SizeId;
export type Geo = alquiler.Geo;

/** The three sizes, from the rent module — its labels are the ones that carry
 * the reference surface, which is the number this page's arithmetic uses. */
export const SIZES = alquiler.SIZES;
export const SIZE_IDS = alquiler.SIZE_IDS;
export const DEFAULT_SIZE: SizeId = "amb2";

/** Opens on comunas, for the rent page's reason: a yield needs *both* a sale
 * price and a rent, so this map's coverage is the rent map's coverage or worse
 * — about 30 of 48 barrios against 14 of 15 comunas. */
export const DEFAULT_GEO: Geo = "comunas";

/** The surface each yield prices, in m². IDECBA's, re-exported so a reader of
 * this module never has to wonder which of the two `REFERENCE_AREA`s in this
 * directory is in play. */
export const REFERENCE_AREA = alquiler.REFERENCE_AREA;

/** Quarters where all three inputs exist, oldest first. The intersection, not
 * the union: a quarter missing any one of them has no yield, and carrying it as
 * a hole would put gaps in the middle of a line chart. */
export const PERIODS: readonly string[] = alquiler.PERIODS.filter(
  (p) => venta.PERIODS.includes(p) && rate(p) !== null,
);

if (PERIODS.length === 0) {
  throw new Error(
    "rentabilidad-caba: the sale, rent and exchange-rate series share no quarter — check that all three were refreshed against the same axis",
  );
}

export const LAST_PERIOD = PERIODS[PERIODS.length - 1];

/** Provisional if *either* IDECBA series flags the quarter. A yield is only as
 * settled as its least settled input. */
export const PROVISIONAL: ReadonlySet<string> = new Set(
  PERIODS.filter(
    (p) => venta.PROVISIONAL.has(p) || alquiler.PROVISIONAL.has(p),
  ),
);

export const periodLabel = alquiler.periodLabel;
export const LAST_UPDATED = periodLabel(LAST_PERIOD);

/** "2026Q2" → "2T 26", for axis ticks. Thirty-four quarters on a phone-width
 * axis leaves about six characters a label. */
export const periodTick = (period: string): string =>
  `${period.slice(5)}T ${period.slice(2, 4)}`;

const isoQuarter = (period: string): string =>
  `${period.slice(0, 4)}-${String((Number(period.slice(5)) - 1) * 3 + 1).padStart(2, "0")}`;

export const TEMPORAL_COVERAGE = `${isoQuarter(PERIODS[0])}/${isoQuarter(LAST_PERIOD)}`;

// ── The calculation ────────────────────────────────────────────────────────

/** Annual gross yield, as a percentage, from the three raw figures. The single
 * place the formula exists; everything below routes through it. */
function computeYield(
  monthlyArs: number | null,
  perMetreUsd: number | null,
  size: SizeId,
  fx: number | null,
): number | null {
  if (monthlyArs === null || perMetreUsd === null || fx === null) return null;
  const annualUsd = (monthlyArs / fx) * 12;
  const flatUsd = perMetreUsd * REFERENCE_AREA[size];
  return (annualUsd / flatUsd) * 100;
}

/** Years of gross rent to recoup the purchase price — the same fact as the
 * yield, in the unit the Argentine press quotes ("años de repago"). Exactly its
 * reciprocal, so the two can never rank a barrio differently. */
export const payback = (yieldPct: number): number => 100 / yieldPct;

/** One region of one map. `value` is the yield; the rest is the arithmetic
 * behind it, so a table can show its own working. */
export type Row = {
  id: string;
  label: string;
  meta: string;
  /** Gross annual yield, %. `null` where either IDECBA figure was withheld. */
  value: number | null;
  /** Years of rent to recoup, the reciprocal. `null` together with `value`. */
  payback: number | null;
  /** Asking price, USD/m². */
  price: number | null;
  /** Asking rent, ARS a month, for a flat of `REFERENCE_AREA[size]`. */
  rentArs: number | null;
  /** The same rent in dollars at the quarter's average rate. */
  rentUsd: number | null;
  /** What the whole flat is asked for, USD — the denominator, made visible. */
  flatUsd: number | null;
};

function buildRow(
  id: string,
  label: string,
  meta: string,
  monthlyArs: number | null,
  perMetreUsd: number | null,
  size: SizeId,
  fx: number | null,
): Row {
  const value = computeYield(monthlyArs, perMetreUsd, size, fx);
  return {
    id,
    label,
    meta,
    value,
    payback: value === null ? null : payback(value),
    price: perMetreUsd,
    rentArs: monthlyArs,
    rentUsd: monthlyArs === null || fx === null ? null : monthlyArs / fx,
    flatUsd: perMetreUsd === null ? null : perMetreUsd * REFERENCE_AREA[size],
  };
}

/** Every region of a map, in registry order, for one size and one quarter. */
export function rows(
  geo: Geo,
  size: SizeId,
  period = LAST_PERIOD,
  which: RateId = RATE,
): Row[] {
  if (!PERIODS.includes(period)) {
    throw new Error(`rentabilidad-caba: no quarter ${period}`);
  }
  const fx = rate(period, which);
  const rentRows = alquiler.rows(geo, size, period);
  const saleRows = venta.rows(geo, size, period);
  const sale = new Map(saleRows.map((r) => [r.id, r.value]));
  return rentRows.map((r) =>
    buildRow(
      r.id,
      r.label,
      r.meta,
      r.monthly,
      sale.get(r.id) ?? null,
      size,
      fx,
    ),
  );
}

/** The city-wide yield: IDECBA's own two "Total" rows divided by each other,
 * not an average of the regions. Both totals are weighted by how many units
 * were advertised, which we cannot reproduce — but they are weighted the same
 * way, so their ratio is a figure the source's own methodology supports. */
export function ciudad(
  size: SizeId,
  period = LAST_PERIOD,
  which: RateId = RATE,
): number | null {
  return computeYield(
    alquiler.ciudad(size, period),
    venta.ciudad(size, period),
    size,
    rate(period, which),
  );
}

/** The city series, oldest first, for a line chart. `null` for a quarter one of
 * the totals is missing — the chart draws a gap rather than a straight line
 * across it. */
export const ciudadSeries = (
  size: SizeId,
  which: RateId = RATE,
): (number | null)[] => PERIODS.map((p) => ciudad(size, p, which));

/** How many regions of a map have a yield, and which do not. Tighter than
 * either source page's coverage, since a region needs both figures. */
export function coverage(
  geo: Geo,
  size: SizeId,
  period = LAST_PERIOD,
): { withData: number; total: number; missing: string[] } {
  const all = rows(geo, size, period);
  const missing = all.filter((r) => r.value === null);
  return {
    withData: all.length - missing.length,
    total: all.length,
    missing: missing.map((r) => r.label),
  };
}

/** Regions with a yield, **most profitable first** — the opposite convention to
 * the two price pages, where first means dearest. Rank 1 here is the best
 * return, which is the only ordering a reader of this page expects. */
export const ranked = (
  geo: Geo,
  size: SizeId,
  period = LAST_PERIOD,
): (Row & { value: number; payback: number })[] =>
  rows(geo, size, period)
    .filter(
      (r): r is Row & { value: number; payback: number } => r.value !== null,
    )
    .sort((a, b) => b.value - a.value);

/** One barrio, with its rank among the barrios that have a yield this quarter.
 * `null` where either input was withheld — common here, so callers must handle
 * it. */
export function barrio(
  id: string,
  size: SizeId,
  period = LAST_PERIOD,
): (Row & { value: number; payback: number; rank: number; of: number }) | null {
  const order = ranked("barrios", size, period);
  const at = order.findIndex((r) => r.id === id);
  if (at < 0) {
    if (!BARRIOS.some((b) => b.id === id)) {
      throw new Error(`rentabilidad-caba: no barrio "${id}"`);
    }
    return null;
  }
  return { ...order[at], rank: at + 1, of: order.length };
}

// ── Why cheap barrios yield more ───────────────────────────────────────────

/**
 * The page's central finding, as a number.
 *
 * Regress log(rent per m²) on log(sale price per m²) across the regions that
 * have both. The slope is an elasticity: how many percent the rent rises for
 * each percent the sale price does.
 *
 *   β = 1  the two move together and the yield is the same everywhere;
 *   β < 1  rent lags price, so the yield falls as a barrio gets dearer;
 *   β = 0  rent is flat across the city and the yield is purely the inverse of
 *          the price.
 *
 * Logs rather than levels because the question is about proportions — "twice as
 * expensive to buy, how much more to rent?" — and because a level regression
 * would be dragged by the dearest barrio. The rate and the reference surface
 * both drop out of β entirely: they scale the rent series by a constant, which
 * moves the intercept and leaves the slope alone. So this is the one figure on
 * the page that no methodological choice here can influence.
 */
export type Elasticity = {
  /** The slope. */
  beta: number;
  /** Share of the variance in rent the price explains, 0-1. */
  r2: number;
  /** Regions behind it. */
  n: number;
  /** How much more the dearest region costs to buy than the cheapest. */
  priceSpread: number;
  /** The same for rent. The gap between the two is the finding, in one pair. */
  rentSpread: number;
  /** What a region twice as expensive rents for, as a multiple: 2^β. */
  doubling: number;
};

export function elasticity(
  geo: Geo,
  size: SizeId,
  period = LAST_PERIOD,
): Elasticity | null {
  const points = rows(geo, size, period).filter(
    (r): r is Row & { price: number; rentArs: number } =>
      r.price !== null && r.rentArs !== null,
  );
  // Two points would fit a line exactly and report a meaningless R².
  if (points.length < 5) return null;

  // Rent per m². The rate is deliberately not applied — it is a constant here
  // and would only add a term to the intercept.
  const rentPerMetre = points.map((p) => p.rentArs / REFERENCE_AREA[size]);
  const xs = points.map((p) => Math.log(p.price));
  const ys = rentPerMetre.map(Math.log);
  const regression = linearFit(xs, ys);
  if (!regression) return null;
  const { slope: beta, r2, n } = regression;
  const prices = points.map((p) => p.price);
  return {
    beta,
    r2,
    n,
    priceSpread: Math.max(...prices) / Math.min(...prices),
    rentSpread: Math.max(...rentPerMetre) / Math.min(...rentPerMetre),
    doubling: 2 ** beta,
  };
}

// ── No zone cut, deliberately ──────────────────────────────────────────────
// The two price pages summarise the city by zone (`zonas()` in each). This one
// does not, and the reason is coverage rather than taste: a yield needs both
// figures, and in the latest quarter the south has one barrio of seven that has
// them. A "Zona sur" median computed from a single barrio would be the most
// quoted number on the page and the least supported — and the south is exactly
// where the story is, since it is the cheap end of the city. The map shows the
// barrios that do have a figure and the coverage note names the ones missing;
// that is as far as this dataset can honestly be aggregated.

// ── The colour scale ───────────────────────────────────────────────────────

/** Upper bounds of the six shading classes, in percent a year.
 *
 * Round half-points, fixed rather than quantiles, one scale for all six maps —
 * the same reasoning as the sale page. Unlike the rent scale these should not
 * drift with inflation: a yield is a ratio of two prices and both are in the
 * numerator's and denominator's own currency. They will still need re-cutting
 * if the market moves a long way, which since 2020 it has: the city went from
 * 1,7 % to over 6 %. When the top class starts swallowing the map, re-cut and
 * say so on the page.
 *
 * Note the direction. On the two price pages dark means expensive; here dark
 * means a *higher* return, which is the cheaper barrio. The legend has to be
 * read, and the page says which way round it is. */
export const BREAKS = [5.5, 6, 6.5, 7, 7.5] as const;

/** Which class a value falls in, 0-5. */
export const classOf = (value: number): number =>
  BREAKS.findIndex((b) => value < b) === -1
    ? BREAKS.length
    : BREAKS.findIndex((b) => value < b);

// ── Formatting ─────────────────────────────────────────────────────────────

const pct = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const years = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const whole = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** One decimal. The inputs are quarterly averages of asking prices; a second
 * decimal would claim a precision three noisy series cannot support. */
export const formatYield = (value: number): string => `${pct.format(value)} %`;

/** Years, whole. "13 años" is the sentence people say. */
export const formatPayback = (value: number): string =>
  `${years.format(Math.round(value))} años`;

export const formatUsd = (value: number): string =>
  `US$ ${whole.format(Math.round(value))}`;

export const NO_DATA = "Sin dato";

export const display = (value: number | null): string | null =>
  value === null ? null : formatYield(value);

export const displayPayback = (value: number | null): string | null =>
  value === null ? null : formatPayback(value);

/** The legend, bottom class first. */
export const LEGEND: { label: string }[] = [
  { label: `menos de ${pct.format(BREAKS[0])} %` },
  ...BREAKS.slice(1).map((b, i) => ({
    label: `${pct.format(BREAKS[i])} – ${pct.format(b)} %`,
  })),
  { label: `${pct.format(BREAKS[BREAKS.length - 1])} % o más` },
];

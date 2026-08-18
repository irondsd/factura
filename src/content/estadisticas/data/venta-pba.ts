import {
  partidosOfZona,
  PRICED,
  type PartidoId,
  type ZonaId,
  ZONAS,
} from "@/content/shared/pba";
import raw from "./venta-pba.json";

// Zonaprop's asking price per square metre for apartments, in US dollars,
// monthly, by partido. This is the dataset behind
// /estadisticas/precio-m2-provincia-buenos-aires.
//
// Editorial/reference data like `venta-caba.ts`, and deliberately shaped like
// it — series-major arrays aligned to a `periods` axis, `null` for "not
// published", the same `display`/`BREAKS`/`LEGEND` vocabulary so the shared map
// component can draw it without learning anything new. Three things differ, all
// forced by the source rather than chosen:
//
//   • **It is not an official statistic.** IDECBA publishes CABA's figures; no
//     agency publishes the province's. This is a listings portal's own index,
//     and every page that renders it has to say so. `SOURCE_KIND` exists to
//     stop that caveat being forgotten in a caption.
//   • **The history is ten months and cannot be extended backwards.** Zonaprop
//     deletes each PDF about eleven months after publishing it, so the series
//     begins where Factura started collecting rather than where the source
//     begins. `scripts/fetch-pba-inmobiliario.ts` accumulates; see its header.
//   • **A missing month is normal.** 2026-02 was never captured, and one report
//     failed to publish in 2026-04. `null` means "no figure for this partido
//     this month", never zero, and the gaps are not at the same place for every
//     partido.
//
// ── The aggregate that changed meaning ────────────────────────────────────
// Zonaprop restructured in 2026-02: what had been one "GBA Oeste y Sur" report
// became separate Oeste and Sur reports, and the Sur one started pricing La
// Plata. Their published zone index changed with it — "GBA OESTE" covered oeste
// *and* sur before, and oeste alone after.
//
// The two are stored under different keys (`oeste-sur` and `oeste`) and this
// module never joins them: `zonaSeries` returns whichever key covers the period
// asked for, and `ZONA_SERIES_BREAK` is the date a chart has to break its line
// at. Drawing 1.642 in January and 1.576 in March as one falling line would be
// reporting a change of definition as a change of price.
//
// Per-partido figures are unaffected — a partido's own number means the same
// thing on both sides — which is why the map, the table and the rankings all
// read partidos and not zones.
//
// ── Refreshing ─────────────────────────────────────────────────────────────
// Don't hand-edit venta-pba.json, and never delete it. Run
//
//   bun run data:pba
//
// every month, and commit the diff. The script merges into what is already
// there; a month missed is a month gone for good.

export type Metric = "usd" | "anual";

const DATA = raw as unknown as {
  periods: string[];
  partidos: Record<string, Record<Metric | "mes", (number | null)[]>>;
  zonas: Record<
    string,
    Record<Metric | "mes" | "amb2" | "amb3", (number | null)[]>
  >;
  source: string;
};

/** Every month in the dataset, oldest first, as `YYYY-MM`. */
export const PERIODS: readonly string[] = DATA.periods;

export const LAST_PERIOD = PERIODS[PERIODS.length - 1];

/** Named in every figure's source note, because "who says so" is the first
 * thing a reader has to know about a number nobody official publishes. */
export const SOURCE = DATA.source;

/**
 * What this dataset actually covers, in the words the page uses for it.
 *
 * The page is titled for the province because that is what people search, and
 * the province is genuinely the subject — but the data is not province-wide and
 * never will be, so every figure has to name its own scope. These two constants
 * exist so that scope is written once: a component that invents its own phrase
 * is a component that will still say "la provincia" after somebody tightens the
 * wording everywhere else.
 *
 * `SCOPE` is the short form for a heading. `SCOPE_LONG` is the one that has to
 * be exact, and it is exact about La Plata, which is not Gran Buenos Aires by
 * any definition — it is here because the source started publishing it.
 */
export const SCOPE = "el Gran Buenos Aires";
export const SCOPE_LONG = "el Gran Buenos Aires y La Plata";

/** The period from which the zone aggregate means "oeste alone". Before it,
 * `oeste-sur`. See the header. */
export const ZONA_SERIES_BREAK = "2026-03";

/**
 * Fail the build on a malformed refresh.
 *
 * The usual reason for one of these (see `assertConsecutive` in
 * `ipc-vivienda.ts`) is that a skipped month turns "a year earlier" into a lie.
 * Here months *are* legitimately skipped, so the check is different: what must
 * hold is that every array is exactly as long as the period axis, and that
 * every partido the registry says is priced has an entry. A short array reads
 * as a run of missing months at the end — which is to say, as the market having
 * stopped.
 */
function assertShape(): void {
  if (PERIODS.length === 0) throw new Error("venta-pba: no periods");
  const n = PERIODS.length;
  for (const p of PRICED) {
    const s = DATA.partidos[p.id];
    if (!s) {
      throw new Error(
        `venta-pba: no series for ${p.id}. The refresh dropped a partido — check the report's coverage before committing.`,
      );
    }
    for (const key of ["usd", "mes", "anual"] as const) {
      if (s[key].length !== n) {
        throw new Error(
          `venta-pba: ${p.id}.${key} has ${s[key].length} values for ${n} periods`,
        );
      }
    }
  }
  for (const [key, s] of Object.entries(DATA.zonas)) {
    for (const [field, arr] of Object.entries(s)) {
      if (arr.length !== n) {
        throw new Error(
          `venta-pba: zonas.${key}.${field} has ${arr.length} values for ${n} periods`,
        );
      }
    }
  }
}
assertShape();

const indexOf = (period: string): number => {
  const i = PERIODS.indexOf(period);
  if (i === -1) throw new Error(`venta-pba: unknown period ${period}`);
  return i;
};

/** One partido's value for a metric, or `null` where that month has none. */
export const value = (
  id: PartidoId | string,
  metric: Metric,
  period = LAST_PERIOD,
): number | null => DATA.partidos[id]?.[metric][indexOf(period)] ?? null;

export type Row = {
  id: string;
  label: string;
  zona: ZonaId;
  zonaLabel: string;
  usd: number | null;
  anual: number | null;
};

/** Every priced partido for a period, in registry order. */
export function rows(period = LAST_PERIOD): Row[] {
  return PRICED.map((p) => ({
    id: p.id,
    label: p.label,
    zona: p.zona as ZonaId,
    zonaLabel: ZONAS.find((z) => z.id === p.zona)!.label,
    usd: value(p.id, "usd", period),
    anual: value(p.id, "anual", period),
  }));
}

/** Dearest first, withheld last. The ranking flips between refreshes, which is
 * why nothing about it is ever written into prose. */
export const ranked = (period = LAST_PERIOD): Row[] => {
  const all = rows(period);
  const withValue = all.filter((r) => r.usd !== null);
  withValue.sort((a, b) => (b.usd as number) - (a.usd as number));
  return [...withValue, ...all.filter((r) => r.usd === null)];
};

/** A partido's place among those with a figure this month, 1-based, or `null`
 * if it has none. */
export const rankOf = (
  id: PartidoId | string,
  period = LAST_PERIOD,
): number | null => {
  const i = ranked(period)
    .filter((r) => r.usd !== null)
    .findIndex((r) => r.id === id);
  return i === -1 ? null : i + 1;
};

/** How much of the map a period can colour, and which partidos fall out.
 * Named rather than counted: a reader who can't find theirs deserves to see it
 * listed, and the ones that drop are never a random sample. */
export function coverage(period = LAST_PERIOD): {
  withData: number;
  total: number;
  missing: string[];
} {
  const all = rows(period);
  const missing = all.filter((r) => r.usd === null);
  return {
    withData: all.length - missing.length,
    total: all.length,
    missing: missing.map((r) => r.label),
  };
}

// ── Zones ──────────────────────────────────────────────────────────────────

export type ZonaRow = {
  id: ZonaId;
  label: string;
  /** The dearest and cheapest partido of the zone this month. */
  top: Row | null;
  bottom: Row | null;
  /** The middle partido by price. A median of partidos, *not* Zonaprop's own
   * index: theirs is weighted by how many units are advertised, so a zone of
   * one huge cheap partido and six small dear ones ranks differently under the
   * two. Both are true; this one answers "what is a typical partido here",
   * which is the question a table of partidos is already asking. */
  median: number | null;
  count: number;
};

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

export function zonas(period = LAST_PERIOD): ZonaRow[] {
  const byId = new Map(rows(period).map((r) => [r.id, r]));
  return ZONAS.map((z) => {
    const rs = partidosOfZona(z.id)
      .map((p) => byId.get(p.id)!)
      .filter((r) => r.usd !== null);
    const sorted = [...rs].sort(
      (a, b) => (b.usd as number) - (a.usd as number),
    );
    return {
      id: z.id,
      label: z.label,
      top: sorted[0] ?? null,
      bottom: sorted[sorted.length - 1] ?? null,
      median: median(rs.map((r) => r.usd as number)),
      count: rs.length,
    };
  });
}

/** Zonaprop's own index for a zone, and the key it was published under — which
 * changes at `ZONA_SERIES_BREAK`. Returns `null` where that zone had no
 * separately published aggregate for the period. */
export function zonaIndex(
  zona: ZonaId,
  period = LAST_PERIOD,
): { value: number | null; key: string } {
  const key =
    zona === "norte"
      ? "norte"
      : period < ZONA_SERIES_BREAK
        ? "oeste-sur"
        : zona;
  return {
    value: DATA.zonas[key]?.["usd"][indexOf(period)] ?? null,
    key,
  };
}

/** Price per m² of the zone's typical 2- and 3-ambiente unit. Worth showing
 * because the two do not move together: in the north the larger unit costs more
 * per metre, in the west it costs less, and that is a real difference in what
 * is being built rather than noise. */
export function unidadMedia(
  zona: ZonaId,
  period = LAST_PERIOD,
): { amb2: number | null; amb3: number | null } {
  const { key } = zonaIndex(zona, period);
  const i = indexOf(period);
  return {
    amb2: DATA.zonas[key]?.amb2[i] ?? null,
    amb3: DATA.zonas[key]?.amb3[i] ?? null,
  };
}

// ── Unit prices ────────────────────────────────────────────────────────────

/**
 * Reference covered areas, in m², for turning a price per metre into the price
 * of a flat. Zonaprop's own definition of its "unidad media" — 50 m² for two
 * ambientes, 70 m² for three — so the arithmetic on the page matches the
 * arithmetic behind the index it is multiplying.
 */
export const REFERENCE_AREA = { amb2: 50, amb3: 70 } as const;

export type UnitId = keyof typeof REFERENCE_AREA;

export const UNITS = [
  { id: "amb2" as const, label: "2 ambientes", inTitle: "dos ambientes" },
  { id: "amb3" as const, label: "3 ambientes", inTitle: "tres ambientes" },
];

/** Rounded to the nearest thousand dollars. The inputs are averages of asking
 * prices; printing US$ 116.432 would claim a precision two steps removed from
 * anything anybody will pay. */
export const totalPrice = (perMetre: number, area: number): number =>
  Math.round((perMetre * area) / 1000) * 1000;

// ── Shading ────────────────────────────────────────────────────────────────

/** Class bounds, in dollars per m². Deliberately *not* the CABA page's scale:
 * that one runs to 3.500 because Puerto Madero does, and on this data it would
 * put twenty of the twenty-seven partidos in one shade. These six steps split
 * the province's own range. */
export const BREAKS = [1200, 1500, 1800, 2200, 2700] as const;

export const classOf = (value: number): number =>
  BREAKS.findIndex((b) => value < b) === -1
    ? BREAKS.length
    : BREAKS.findIndex((b) => value < b);

// ── Formatting ─────────────────────────────────────────────────────────────

const NUMBER = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const SIGNED = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

export const formatUsd = (value: number): string =>
  `US$ ${NUMBER.format(Math.round(value))}`;

export const formatPct = (value: number): string => `${SIGNED.format(value)} %`;

export const NO_DATA = "Sin dato";

export const display = (value: number | null): string | null =>
  value === null ? null : formatUsd(value);

export const LEGEND: { label: string }[] = [
  { label: `menos de ${NUMBER.format(BREAKS[0])}` },
  ...BREAKS.slice(1).map((b, i) => ({
    label: `${NUMBER.format(BREAKS[i])} – ${NUMBER.format(b)}`,
  })),
  { label: `${NUMBER.format(BREAKS[BREAKS.length - 1])} o más` },
];

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** "junio de 2026". */
export const periodLabel = (period: string): string => {
  const [y, m] = period.split("-");
  return `${MONTHS[Number(m) - 1]} de ${y}`;
};

/** "jun 26" — for a chart axis, where the full form does not fit. */
export const periodShort = (period: string): string => {
  const [y, m] = period.split("-");
  return `${MONTHS[Number(m) - 1].slice(0, 3)} ${y.slice(2)}`;
};

export const LAST_UPDATED = periodLabel(LAST_PERIOD);

export const TEMPORAL_COVERAGE = `${PERIODS[0]}/${LAST_PERIOD}`;

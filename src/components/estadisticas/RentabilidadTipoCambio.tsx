import { DataFigure } from "@/components/figures/DataFigure";
import { RATES } from "@/content/estadisticas/data/dolar";
import {
  ciudad,
  DEFAULT_SIZE,
  formatYield,
  LAST_UPDATED,
  periodLabel,
  PERIODS,
  periodTick,
  REFERENCE_AREA,
  SIZES,
} from "@/content/estadisticas/data/rentabilidad-caba";
import { vendorColorVar } from "@/lib/vendorColors";
import {
  type RateRow,
  type RateSeries,
  TipoCambioChart,
} from "./RentabilidadChartBody";

// The methodology figure: the same city series computed three times, once per
// exchange rate.
//
// It shows the city series recalculated with each published exchange rate.
//
// The blue is drawn in the accent colour, because it is the series the rest of
// the page uses. The other two are neutral.

const SIZE = SIZES.find((s) => s.id === DEFAULT_SIZE)!;
const AREA = REFERENCE_AREA[DEFAULT_SIZE];

const COLOR: Record<string, string> = {
  blue: "var(--accent)",
  oficial: vendorColorVar("slate-teal"),
  mep: vendorColorVar("taupe"),
};

/** The exchange control, as the two quarters that bound it. September 2019 is
 * when the controls came back; they were lifted in April 2025.
 *
 * These are period keys and the x axis is keyed on the *tick label*, so they
 * have to go through `periodTick` before recharts can match them — otherwise
 * the band silently collapses to the left edge instead of failing. Same
 * conversion the markers on the history chart need. */
const BAND = { from: "2019Q3", to: "2025Q2", label: "Cepo cambiario" };

/** Clamped to the series, so a band bound that predates the data doesn't drop
 * the whole shading. */
function bandBounds(): { from: string; to: string; label: string } | null {
  const first = PERIODS.find((p) => p >= BAND.from) ?? PERIODS[0];
  const lastIn = [...PERIODS].reverse().find((p) => p <= BAND.to);
  if (!lastIn || first > lastIn) return null;
  return { from: periodTick(first), to: periodTick(lastIn), label: BAND.label };
}

/** The quarter where the choice of rate mattered most — found rather than
 * typed, so the sentence under the figure can't go stale. */
function widestGap(): { period: string; blue: number; oficial: number } | null {
  let worst: { period: string; blue: number; oficial: number } | null = null;
  for (const period of PERIODS) {
    const blue = ciudad(DEFAULT_SIZE, period, "blue");
    const oficial = ciudad(DEFAULT_SIZE, period, "oficial");
    if (blue === null || oficial === null) continue;
    if (!worst || oficial - blue > worst.oficial - worst.blue) {
      worst = { period, blue, oficial };
    }
  }
  return worst;
}

export function RentabilidadTipoCambio() {
  const rates: RateSeries[] = RATES.map((r) => ({
    id: r.id,
    label: r.label,
    color: COLOR[r.id] ?? "var(--muted)",
  }));

  const rows: RateRow[] = PERIODS.map((period) => {
    const row: RateRow = {
      key: period,
      label: periodTick(period),
      title: periodLabel(period),
    };
    for (const r of RATES) row[r.id] = ciudad(DEFAULT_SIZE, period, r.id);
    return row;
  });

  const worst = widestGap();
  const latestPeriod = PERIODS[PERIODS.length - 1];
  const latestValues = RATES.map((rate) =>
    ciudad(DEFAULT_SIZE, latestPeriod, rate.id),
  ).filter((value): value is number => value !== null);
  const latestRange = latestValues.length
    ? {
        low: Math.min(...latestValues),
        high: Math.max(...latestValues),
      }
    : null;

  return (
    <DataFigure
      header={{
        title: <>La misma serie con tres tipos de cambio</>,
        subtitle: (
          <>Departamentos usados de {SIZE.label} · promedio de la Ciudad</>
        ),
      }}
      caption={
        <>
          La misma cuenta de rentabilidad para un departamento usado de{" "}
          {SIZE.label} ({AREA} m²), recalculada con el promedio trimestral del
          blue, el oficial y el MEP.
        </>
      }
      note={
        <>
          {worst && (
            <>
              Mayor separación entre blue y oficial: {periodLabel(worst.period)}{" "}
              ({formatYield(worst.blue)} y {formatYield(worst.oficial)}).
            </>
          )}
          {latestRange && (
            <>
              {" "}En el último trimestre común ({periodLabel(latestPeriod)}),
              los tres cálculos van de {formatYield(latestRange.low)} a{" "}
              {formatYield(latestRange.high)}, una diferencia de{" "}
              {(latestRange.high - latestRange.low).toFixed(2).replace(".", ",")}{" "}
              puntos porcentuales.
            </>
          )}{" "}
          La página usa el blue para el mapa y la serie histórica. Cambiar la
          cotización ajusta el nivel de cada trimestre, pero no altera el orden
          entre barrios dentro de un mismo corte porque todos comparten el
          divisor. Fuentes: IDECBA y ArgentinaDatos; último período común: {LAST_UPDATED}.
        </>
      }
    >
      <TipoCambioChart rows={rows} rates={rates} band={bandBounds()} />
    </DataFigure>
  );
}

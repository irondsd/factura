import { DataFigure } from "@/components/figures/DataFigure";
import {
  costo,
  costoUsd,
  DEFAULT_MODEL,
  formatArs,
  formatPct,
  formatUsd,
  IS_PROVISIONAL,
  LAST_PERIOD,
  LAST_UPDATED,
  PERIODS,
  periodLabel,
  usdExtremes,
  yoy,
} from "@/content/estadisticas/data/costo-construccion-caba";
import { CostoChart, type CostoRow } from "./ConstruccionChartBody";

// The page's second figure: what a square metre has cost to build, every month
// since the series starts.
//
// The city total only. The four models track each other almost exactly — they
// are the same basket priced with different finishes — so four lines here would
// be four ways of drawing one curve. What each model costs *now* is the table
// above; this is the shape over time, and the shape is the same for all of them.
//
// The server half of the split (see AUTHORING.md §7): the <figure> shell, the
// caption, the source note, and every formatted string. The client half owns the
// currency switch and the plot.

const SPAN = `${PERIODS[0].slice(0, 4)}–${LAST_PERIOD.slice(0, 4)}`;

export function CostoConstruccionHistoria() {
  const rows: CostoRow[] = PERIODS.map((period) => {
    const usd = costoUsd(DEFAULT_MODEL, period);
    return {
      period,
      title: periodLabel(period),
      ars: costo(DEFAULT_MODEL, period),
      arsLabel: formatArs(costo(DEFAULT_MODEL, period)),
      usd,
      usdLabel: usd === null ? null : formatUsd(usd),
      provisional: period === LAST_PERIOD && IS_PROVISIONAL,
    };
  });

  const ext = usdExtremes(DEFAULT_MODEL);
  const change = yoy(DEFAULT_MODEL);

  return (
    <DataFigure
      caption={
        <>
          Costo directo mensual por metro cuadrado del modelo total de la
          Ciudad. El selector cambia entre el valor publicado en pesos y su
          conversión a dólares.
        </>
      }
      note={
        <>
          La serie en pesos son{" "}
          <strong className="font-medium">pesos corrientes</strong>: no está
          corregida por inflación. La vista en dólares es una conversión, no un
          ajuste por inflación: arranca en 2017 y divide cada dato mensual por
          el promedio trimestral del dólar blue. Ese promedio no tiene
          frecuencia mensual. Fuente: IDECBA, datos hasta {LAST_UPDATED}
          {IS_PROVISIONAL && " (provisorio)"}.
        </>
      }
    >
      <CostoChart
        title={`Costo de construcción del m² en CABA, ${SPAN}`}
        statUsd={
          ext ? (
            <>
              <span className="text-ink">{formatUsd(ext.last.value)}/m²</span>{" "}
              en {periodLabel(ext.last.period)}
              {/* Avoid repeating the same current value and date when they are
                  also the series maximum. */}
              {ext.high.period === ext.last.period ? (
                <>, el máximo de toda la serie</>
              ) : (
                <>
                  {" "}
                  · Máximo {formatUsd(ext.high.value)} (
                  {periodLabel(ext.high.period)})
                </>
              )}{" "}
              · Mínimo {formatUsd(ext.low.value)} ({periodLabel(ext.low.period)}
              )
            </>
          ) : (
            <>Sin tipo de cambio para convertir la serie.</>
          )
        }
        statArs={
          <>
            <span className="text-ink">
              {formatArs(costo(DEFAULT_MODEL))}/m²
            </span>{" "}
            en {LAST_UPDATED}
            {change !== null && <> · {formatPct(change)} interanual</>} · en
            pesos corrientes, sin corregir por inflación
          </>
        }
        rows={rows}
      />
    </DataFigure>
  );
}

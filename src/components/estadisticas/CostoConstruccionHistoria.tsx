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
          Cuánto costó construir un metro cuadrado en la Ciudad de Buenos Aires,
          mes a mes. En dólares se ve si construir está caro o barato; en pesos
          se ve el número que publica el organismo, que es el que sirve para
          presupuestar hoy.
        </>
      }
      note={
        <>
          La serie en pesos son{" "}
          <strong className="font-medium">pesos corrientes</strong>: no está
          corregida por inflación, así que sube todos los meses y no dice nada
          sobre si construir se encareció en términos reales. Para eso está la
          serie en dólares, que arranca en 2017 porque es desde donde tenemos el
          tipo de cambio: cada mes está convertido al promedio del dólar blue de
          su trimestre, que es una conversión más gruesa que el dato mensual y
          la única honesta para comparar contra precios de inmuebles, que se
          publican por trimestre. Costo directo, sin terreno ni honorarios ni
          impuestos. Fuente: IDECBA, datos hasta {LAST_UPDATED}
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
              {/* The last month has been the dearest of the series several
                  times running, and printing "Máximo US$ 1.082 (junio de 2026)"
                  beside "US$ 1.082/m² en junio de 2026" spends a line saying the
                  same thing twice — when the more interesting reading is that
                  the two coincide. */}
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

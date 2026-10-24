import { DataFigure } from "@/components/figures/DataFigure";
import {
  formatCount,
  hipotecas,
  hipotecaShare12,
  LAST_UPDATED,
  PERIODS,
  periodLabel,
  PROVISIONAL,
  SOURCE,
  SPAN,
} from "@/content/estadisticas/data/escrituras-pba";
import { HipotecasChart, type HipotecaRow } from "./EscriturasChartBody";

const ratePer100 = (fraction: number) =>
  (fraction * 100).toLocaleString("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

// The first view compares twelve-month sums; the second keeps monthly mortgage
// counts visible.

/** The peak and the floor of the rolled share, derived so the prose beside the
 * figure can name them without hardcoding a month. */
function shareExtremes() {
  const points = PERIODS.map((period) => ({
    period,
    value: hipotecaShare12(period),
  })).filter((p): p is { period: string; value: number } => p.value !== null);
  return {
    high: points.reduce((a, p) => (p.value > a.value ? p : a)),
    low: points.reduce((a, p) => (p.value < a.value ? p : a)),
    last: points[points.length - 1],
  };
}

export function EscriturasHipotecas() {
  const rows: HipotecaRow[] = PERIODS.map((period) => {
    const share = hipotecaShare12(period);
    return {
      period,
      title: periodLabel(period),
      share: share === null ? null : share * 100,
      shareLabel: share === null ? null : ratePer100(share),
      hipotecas: hipotecas(period),
      hipotecasLabel: formatCount(hipotecas(period)),
      note: PROVISIONAL.has(period)
        ? "Provisorio: todavía se corrige a medida que llegan presentaciones tardías."
        : null,
    };
  });

  const ext = shareExtremes();
  const counts = PERIODS.map((p) => ({ period: p, value: hipotecas(p) }));
  const countHigh = counts.reduce((a, p) => (p.value > a.value ? p : a));

  return (
    <DataFigure
      caption={
        <>
          La línea muestra hipotecas por cada 100 compraventas en los últimos
          doce meses; la vista mensual cuenta hipotecas.
        </>
      }
      note={
        <>
          La hipoteca es un acto distinto de la compraventa y el Colegio los
          cuenta por separado: el cociente resume la relación entre ambos
          recuentos, no la parte exacta de las compras que se financió. Hasta
          2011 la fuente publicaba las hipotecas
          abiertas en dos tramos por monto y aquí están sumadas, que es lo que
          permite que la serie sea continua. El cociente se calcula sobre doce
          meses móviles para reducir los efectos de la estacionalidad y de meses
          con muy pocas compraventas. Fuente: {SOURCE}, datos hasta {LAST_UPDATED}.
        </>
      }
    >
      <HipotecasChart
        title={`Relación entre hipotecas y compraventas en la Provincia de Buenos Aires, ${SPAN}`}
        statShare={
          <>
            <span className="text-ink">
              {ratePer100(ext.last.value)} hipotecas por cada 100 compraventas
            </span>{" "}
            en los últimos doce meses · Máximo {ratePer100(ext.high.value)} ({periodLabel(ext.high.period)}) ·
            Mínimo {ratePer100(ext.low.value)} ({periodLabel(ext.low.period)})
          </>
        }
        statCount={
          <>
            <span className="text-ink">
              {formatCount(hipotecas())} hipotecas
            </span>{" "}
            en {LAST_UPDATED} · el máximo de la serie fue{" "}
            {formatCount(countHigh.value)} en {periodLabel(countHigh.period)} ·
            dato mensual sin suavizar
          </>
        }
        rows={rows}
      />
    </DataFigure>
  );
}

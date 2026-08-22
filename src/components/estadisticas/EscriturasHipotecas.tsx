import {
  formatCount,
  formatShare,
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

// How much of the province's property market runs on credit, and how violently
// that has changed.
//
// This is the figure that makes the dataset worth twenty-one years rather than
// five. Argentina's mortgage market has been switched on and off twice inside
// the series: the UVA loans of 2017-2018 took it to roughly a third of every
// sale, the 2019 devaluation and then the pandemic took it to almost nothing,
// and the credit lines that reopened in 2024 have taken it back to a level
// last seen before the collapse. None of that is visible in a price series and
// all of it is visible here.
//
// ── Why the share is rolled and the count is not ──────────────────────────
// The share divides twelve months of hipotecas by twelve months of
// compraventas. A monthly ratio on this data has an April 2020 in it — three
// mortgages over one sale, which is 300 % and is not a fact about credit — and
// it inherits the December seasonality of both legs. The count view is the raw
// monthly figure because a count of anything is safe to print as it stands.
//
// The server half of the split: the <figure> shell, the caption, the source
// note and every formatted string.

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
      shareLabel: share === null ? null : formatShare(share),
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
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <HipotecasChart
        title={`Qué parte del mercado bonaerense se mueve con hipoteca, ${SPAN}`}
        statShare={
          <>
            <span className="text-ink">{formatShare(ext.last.value)}</span> de
            las compraventas de los últimos doce meses · Máximo{" "}
            {formatShare(ext.high.value)} ({periodLabel(ext.high.period)}) ·
            Mínimo {formatShare(ext.low.value)} ({periodLabel(ext.low.period)})
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

      <figcaption className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Hipotecas sobre compraventas, sumando doce meses de cada una. Es la
        forma más directa de ver el crédito hipotecario argentino prenderse y
        apagarse: el pico de los créditos UVA, el derrumbe posterior a 2019, y
        la vuelta que empezó en 2024. La otra vista es la cantidad de hipotecas
        mes a mes, sin dividir por nada.
      </figcaption>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        La hipoteca es un acto distinto de la compraventa y el Colegio los
        cuenta por separado, así que el cociente es una aproximación: mide
        cuánto crédito hay por cada operación, no la parte exacta de las compras
        que se financió. Hasta 2011 la fuente publicaba las hipotecas abiertas
        en dos tramos por monto y aquí están sumadas, que es lo que permite que
        la serie sea continua. El cociente se calcula sobre doce meses móviles a
        propósito: hecho mes a mes, abril de 2020 daría 300 % con tres hipotecas
        sobre una compraventa. Fuente: {SOURCE}, datos hasta {LAST_UPDATED}.
      </p>
    </figure>
  );
}

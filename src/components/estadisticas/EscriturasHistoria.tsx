import {
  compraventas,
  escriturasPhrase,
  extremes,
  FLAGGED,
  formatCount,
  formatPct,
  LAST_UPDATED,
  PERIODS,
  periodLabel,
  PROVISIONAL,
  rolling12,
  SOURCE,
  SPAN,
  yoy,
} from "@/content/estadisticas/data/escrituras-pba";
import {
  HistoriaChart,
  type HistoriaRow,
} from "./EscriturasChartBody";

// The spine of the page: every deed signed in the province, month by month,
// for twenty-one years.
//
// It opens on the twelve-month rolling total because the raw monthly series is
// a picket fence — December is four times January, every year — and a reader
// asked to subtract that by eye cannot. Rolled, the shape is legible and it is
// a history of the country: the 2018 credit boom, the collapse through 2019,
// the floor of 2020, and a climb back that overtook everything before it.
//
// Two months in it are not market signal and both are labelled in the tooltip
// rather than hidden: December 2007, when the Registro de la Propiedad was on
// strike, and April 2020, when the province signed one deed.
//
// The server half of the split (see AUTHORING.md §6): the <figure> shell, the
// caption, the source note, and every formatted string. The client half owns
// the view switch and the plot.

/** The last year before the 2019 slide — the honest baseline for "how does
 * today compare?", and the year the rolling series had to climb back past. */
const BASELINE = 2018;

export function EscriturasHistoria() {
  const rows: HistoriaRow[] = PERIODS.map((period) => {
    const roll = rolling12(period);
    const flag = FLAGGED.get(period);
    return {
      period,
      title: periodLabel(period),
      mensual: compraventas(period),
      mensualLabel: `${formatCount(compraventas(period))} escrituras`,
      rolling: roll,
      rollingLabel: roll === null ? null : `${formatCount(roll)} escrituras`,
      note: flag
        ? `${flag} — el mes está deprimido por eso, no por el mercado.`
        : PROVISIONAL.has(period)
          ? "Provisorio: todavía se corrige a medida que llegan presentaciones tardías."
          : null,
    };
  });

  const roll = extremes("rolling12");
  const month = extremes("compraventas");
  const change = yoy();

  // Where the rolling series last sat below its own December-2018 level, which
  // is how long the recovery actually took. Derived, never typed.
  const baselineAt = `${BASELINE}-12`;
  const baseline = rolling12(baselineAt);
  const recovered =
    baseline === null
      ? null
      : PERIODS.find(
          (p, i) =>
            i > PERIODS.indexOf(baselineAt) && (rolling12(p) ?? 0) >= baseline,
        );

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <HistoriaChart
        title={`Escrituras de compraventa en la Provincia de Buenos Aires, ${SPAN}`}
        statRolling={
          <>
            <span className="text-ink">{formatCount(roll.last.value)}</span> en
            los doce meses hasta {periodLabel(roll.last.period)} · Máximo{" "}
            {formatCount(roll.high.value)} ({periodLabel(roll.high.period)}) ·
            Mínimo {formatCount(roll.low.value)} (
            {periodLabel(roll.low.period)})
            {recovered && (
              <>
                {" "}
                · volvió al nivel de {BASELINE} en {periodLabel(recovered)}
              </>
            )}
          </>
        }
        statMensual={
          <>
            <span className="text-ink">
              {formatCount(month.last.value)} escrituras
            </span>{" "}
            en {LAST_UPDATED}
            {change !== null && <> · {formatPct(change)} interanual</>} · el
            máximo de la serie fue {formatCount(month.high.value)} en{" "}
            {periodLabel(month.high.period)}, un diciembre
          </>
        }
        rows={rows}
      />

      <figcaption className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Cuántas propiedades cambiaron de dueño en la provincia cada mes, desde
        2005. La vista de doce meses suma cada mes con los once anteriores: es
        la misma serie con la estacionalidad dividida, y es la que hay que mirar
        para saber si el mercado se mueve. La vista mensual es el dato crudo.
      </figcaption>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        Dos meses de la serie no son mercado y están señalados en el gráfico:
        diciembre de 2007, con el Registro de la Propiedad de paro, y abril de
        2020, cuando en toda la provincia se firmó{" "}
        {escriturasPhrase(compraventas("2020-04"))}. Los actos se cuentan
        por fecha de escritura, así que los últimos dos meses todavía se
        corrigen hacia arriba. Fuente: {SOURCE}, datos hasta {LAST_UPDATED}.
      </p>
    </figure>
  );
}

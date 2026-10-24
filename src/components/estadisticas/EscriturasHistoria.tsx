import { DataFigure } from "@/components/figures/DataFigure";
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
import { HistoriaChart, type HistoriaRow } from "./EscriturasChartBody";

// Monthly counts and rolling twelve-month totals. The source-flagged strike
// month and pandemic closure remain visible with context in the tooltips.

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

  // Compare the current rolling total with its December 2018 level. The
  // crossing date is derived from the full monthly series.
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
    <DataFigure
      caption={
        <>
          Conteo mensual de compraventas y suma móvil de doce meses para seguir
          la actividad con menos efecto estacional.
        </>
      }
      note={
        <>
          El gráfico señala diciembre de 2007, que la fuente marca por un paro
          en el Registro de la Propiedad, y abril de 2020, cuando se registró{" "}
          {escriturasPhrase(compraventas("2020-04"))}. Los actos se cuentan por
          fecha de escritura; los meses provisorios pueden cambiar con nuevas
          presentaciones. Fuente: {SOURCE}, datos hasta {LAST_UPDATED}.
        </>
      }
    >
      <HistoriaChart
        title={`Escrituras de compraventa en la Provincia de Buenos Aires, ${SPAN}`}
        statRolling={
          <>
            <span className="text-ink">{formatCount(roll.last.value)}</span> en
            los doce meses hasta {periodLabel(roll.last.period)} · Máximo{" "}
            {formatCount(roll.high.value)} ({periodLabel(roll.high.period)}) ·
            Mínimo {formatCount(roll.low.value)} ({periodLabel(roll.low.period)}
            )
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
            {periodLabel(month.high.period)}
          </>
        }
        rows={rows}
      />
    </DataFigure>
  );
}

import { DataFigure } from "@/components/figures/DataFigure";
import {
  CUMULATIVE_2026,
  changeBetween,
  FIRST_PERIOD,
  formatPct,
  formatPeriod,
  formatVm,
  LAST_STEP,
  MONTHS,
  PREVIOUS_STEP,
  SOURCE,
  STEPS,
} from "@/content/estadisticas/data/absa-tarifas";
import { TarifaChart, type TarifaRow } from "./AbsaChartBody";

// Server-rendered caption and values for the tariff staircase.

/** The step a given month belongs to, so a tooltip can name the norm that set
 * the value it is showing rather than only the months a decree landed on. */
const STEP_BY_PERIOD = new Map(STEPS.map((s) => [s.period, s]));

export function AbsaTarifaHistoria() {
  const rows: TarifaRow[] = MONTHS.map((m) => {
    const step = STEP_BY_PERIOD.get(m.period);
    const index = step ? STEPS.indexOf(step) : -1;
    const previous = index > 0 ? STEPS[index - 1] : null;
    return {
      period: m.period,
      title: formatPeriod(m.period),
      vm: m.vm,
      vmLabel: formatVm(m.vm),
      norm: step ? step.norm : null,
      changeLabel:
        step && previous ? formatPct((step.vm / previous.vm - 1) * 100) : null,
    };
  });

  const biggest = STEPS.reduce(
    (best, step, i) => {
      if (i === 0) return best;
      const change = step.vm / STEPS[i - 1].vm - 1;
      return change > best.change ? { step, change } : best;
    },
    { step: STEPS[1], change: -Infinity },
  );

  return (
    <DataFigure
      caption={
        <>
          El salto más alto ocurrió en {formatPeriod(biggest.step.period)}:
          {" "}
          {formatPct(biggest.change * 100)}.
        </>
      }
      note={
        <>
          Fuentes: {SOURCE}.
        </>
      }
    >
      <TarifaChart
        title={`Valor del m³ de agua de ABSA, ${formatPeriod(FIRST_PERIOD)} a ${formatPeriod(LAST_STEP.period)}`}
        stat={
          <>
            <span className="text-ink">{formatVm(LAST_STEP.vm)}</span> desde{" "}
            {formatPeriod(LAST_STEP.period)} ·{" "}
            {formatPct(changeBetween(PREVIOUS_STEP.period, LAST_STEP.period))}{" "}
            contra el valor anterior · {formatPct(CUMULATIVE_2026)} desde{" "}
            {formatPeriod("202512")}
          </>
        }
        rows={rows}
      />
    </DataFigure>
  );
}

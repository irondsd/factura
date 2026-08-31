import { DataFigure } from "@/components/figures/DataFigure";
import {
  FIRST_PERIOD,
  formatPct,
  formatPeriod,
  formatVm,
  LAST_STEP,
  MONTHS,
  PREVIOUS_STEP,
  SOURCE,
  STEPS,
  vmAt,
} from "@/content/estadisticas/data/absa-tarifas";
import { TarifaChart, type TarifaRow } from "./AbsaChartBody";

// The spine of the page: what a cubic metre of water has cost since the
// formula-driven regime started, month by month.
//
// It is drawn as a staircase because that is what it is. Seven decisions in
// twenty-one months, each holding flat until the next one — and the shape of
// the staircase is the argument. Four long shallow treads through 2025, then
// one riser in February 2026 taller than everything before it put together.
//
// The server half of the split: the <figure> shell, the caption, the source
// note and every formatted string.

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
          Cada escalón es un decreto o una resolución, y se mantiene plano hasta
          el siguiente: entre dos escalones la tarifa no se mueve, por mucho que
          se muevan los precios. El escalón más alto de la serie es{" "}
          {formatPeriod(biggest.step.period)}, de{" "}
          {formatPct(biggest.change * 100)}.
        </>
      }
      note={
        <>
          Es el valor del metro cúbico/módulo general para uso residencial, que
          es el número del que cuelga casi toda la factura: quien tiene medidor
          paga ese valor por m³ y quien no lo tiene paga ese valor multiplicado
          por los módulos que le asigna su Valuación Fiscal Inmobiliaria. No es
          el importe de una boleta, que además depende del consumo, de la
          categoría y de la tasa municipal. Fuente: {SOURCE}. Valores vigentes
          hasta {formatPeriod(LAST_STEP.period)}.
        </>
      }
    >
      <TarifaChart
        title={`Valor del m³ de agua de ABSA, ${formatPeriod(FIRST_PERIOD)} a ${formatPeriod(LAST_STEP.period)}`}
        stat={
          <>
            <span className="text-ink">{formatVm(LAST_STEP.vm)}</span> desde{" "}
            {formatPeriod(LAST_STEP.period)} ·{" "}
            {formatPct((LAST_STEP.vm / PREVIOUS_STEP.vm - 1) * 100)} contra el
            valor anterior ·{" "}
            {formatPct((LAST_STEP.vm / vmAt("202412") - 1) * 100)} desde el
            inicio de la serie
          </>
        }
        rows={rows}
      />
    </DataFigure>
  );
}

import { DataFigure } from "@/components/figures/DataFigure";
import {
  CURRENT_REAL,
  formatPct,
  formatPeriod,
  IPC_SOURCE,
  LAST_STEP,
  MONTHS,
  PEAK_REAL,
  REAL_THROUGH,
  SOURCE,
  WORST_LAG,
} from "@/content/estadisticas/data/absa-tarifas";
import { BrechaChart, type BrechaRow } from "./AbsaChartBody";

// The real-terms series ends at the last month both sources publish.

export function AbsaTarifaVsInflacion() {
  const hasUnmatchedTariff =
    Number(LAST_STEP.period) > Number(REAL_THROUGH);

  const rows: BrechaRow[] = MONTHS.map((m) => ({
    period: m.period,
    title: formatPeriod(m.period),
    tarifa: Number(m.nominalIndex.toFixed(1)),
    ipc: m.ipcIndex === null ? null : Number(m.ipcIndex.toFixed(1)),
    brecha: m.realGap === null ? null : Number(m.realGap.toFixed(1)),
    tarifaLabel: m.nominalIndex.toLocaleString("es-AR", {
      maximumFractionDigits: 1,
    }),
    ipcLabel:
      m.ipcIndex === null
        ? null
        : m.ipcIndex.toLocaleString("es-AR", { maximumFractionDigits: 1 }),
    brechaLabel: m.realGap === null ? null : formatPct(m.realGap),
  }));

  return (
    <DataFigure
      caption={
        hasUnmatchedTariff ? (
          <>
            La comparación no incluye los valores posteriores a{" "}
            {formatPeriod(CURRENT_REAL.period)}, sin IPC publicado.
          </>
        ) : (
          <>La comparación llega hasta {formatPeriod(CURRENT_REAL.period)}.</>
        )
      }
      note={
        <>
          La serie tarifaria llega hasta {formatPeriod(LAST_STEP.period)} y el
          IPC hasta {formatPeriod(REAL_THROUGH)}. Fuentes: {SOURCE} y{" "}
          {IPC_SOURCE}.
        </>
      }
    >
      <BrechaChart
        title="La tarifa de ABSA contra la inflación, con diciembre de 2024 = 100"
        stat={
          <>
            <span className="text-ink">{formatPct(CURRENT_REAL.realGap)}</span>{" "}
            contra los precios en general en {formatPeriod(CURRENT_REAL.period)}{" "}
            · mínimo {formatPct(WORST_LAG.realGap)} en{" "}
            {formatPeriod(WORST_LAG.period)} · máximo{" "}
            {formatPct(PEAK_REAL.realGap)} en {formatPeriod(PEAK_REAL.period)}
          </>
        }
        rows={rows}
      />
    </DataFigure>
  );
}

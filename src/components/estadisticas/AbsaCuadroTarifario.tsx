import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import {
  FIRST_PERIOD,
  formatPct,
  formatPeriod,
  formatVm,
  LAST_STEP,
  MONTHS,
  STEPS,
} from "@/content/estadisticas/data/absa-tarifas";

export function AbsaCuadroTarifario() {
  const rows = STEPS.map((step, i) => ({
    ...step,
    change: i === 0 ? null : (step.vm / STEPS[i - 1].vm - 1) * 100,
  }));

  return (
    <DataFigure
      header={{
        title: (
          <>
            Valores del m³, {formatPeriod(FIRST_PERIOD)} a{" "}
            {formatPeriod(LAST_STEP.period)}
          </>
        ),
        subtitle: (
          <>
            Valor residencial · {STEPS.length} valores en {MONTHS.length} meses
          </>
        ),
      }}
      note={
        <>
          El cuadro vigente de ABSA publica el valor actual; las normas citadas
            respaldan los valores anteriores. El valor de febrero siguió vigente
            hasta junio.
        </>
      }
    >
      <div className="overflow-x-auto">
        <DataTable
          rows={rows}
          rowKey={(row) => row.period}
          columns={[
            {
              header: "Vigencia",
              rowHeader: true,
              cell: (row) => formatPeriod(row.period),
            },
            {
              header: "Valor del m³",
              numeric: true,
              cell: (row) => formatVm(row.vm),
            },
            {
              header: "Variación",
              numeric: true,
              cell: (row) =>
                row.change === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  formatPct(row.change)
                ),
            },
            {
              header: "Norma",
              cell: (row) => row.norm,
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}

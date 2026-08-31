import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import {
  FIRST_PERIOD,
  formatPct,
  formatPeriod,
  formatVm,
  MONTHS,
  SOURCE,
  STEPS,
  type TariffStep,
} from "@/content/estadisticas/data/absa-tarifas";

// Every value the metro cúbico has taken, with the norm that set it and
// whether we could read it at the source.
//
// ── The «verificable» column is the point of the table ───────────────────
// ABSA publishes only the cuadro tarifario in force. There is no archive: the
// company's old news items 404 after a site redesign, and the PDFs of past
// cuadros sit behind a viewer that serves an application shell to anything that
// asks for the file. So the two most recent rows can be checked against the
// company's own page this afternoon, and the five before them cannot — they
// come from the Boletín Oficial as reported in the provincial press, which
// names the resolution each time.
//
// That is a real difference in how much weight a row carries, and hiding it
// would be the dishonest choice on a page whose whole subject is a series. The
// column says which is which, and the note says what «prensa» means. Cross-
// checks are what make the older rows usable at all: the February pair squares
// exactly with the coefficient change (see `AbsaComercialCoeficiente`), and the
// April 2025 value squares with the press describing that adjustment as
// negligible — 26 centavos is what «ínfima» turned out to mean.

export function AbsaCuadroTarifario() {
  const rows = STEPS.map((step, i) => ({
    ...step,
    change: i === 0 ? null : (step.vm / STEPS[i - 1].vm - 1) * 100,
  }));

  return (
    <DataFigure
      header={{
        title: <>Todos los valores del m³ desde {formatPeriod(FIRST_PERIOD)}</>,
        subtitle: (
          <>
            Valor residencial · {STEPS.length} actualizaciones en{" "}
            {MONTHS.length} meses
          </>
        ),
      }}
      caption={
        <>
          La serie completa, con la norma que fijó cada valor. La última columna
          dice si el valor todavía puede leerse hoy en el cuadro tarifario que
          publica ABSA o si viene del Boletín Oficial a través de la prensa
          provincial, que es el caso de todo lo anterior a junio de 2026.
        </>
      }
      note={
        <>
          ABSA publica únicamente el cuadro vigente, sin archivo, así que los
          valores anteriores se reconstruyeron a partir de las resoluciones
          publicadas en el Boletín Oficial tal como las citó la prensa
          provincial. Los marcamos como no verificables en el origen y conviene
          leerlos con esa reserva, aunque cierran entre sí: el salto de febrero
          coincide al centavo con el cambio de coeficiente comercial. No hay
          fila de abril de 2026 porque no hubo actualización ese mes —el valor
          de febrero se publicó tarde y se facturó con retroactivo en abril, y
          el esquema bimestral recién empezó a correr en junio—. Fuente:{" "}
          {SOURCE}.
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
            {
              header: "Verificable en ABSA",
              cell: (row: TariffStep) =>
                row.official ? (
                  "Sí"
                ) : (
                  <span className="text-muted">Prensa</span>
                ),
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}

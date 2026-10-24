import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import {
  compraventas,
  formatCount,
  formatPct,
  hipotecas,
  hipotecaShare,
  LAST_PERIOD,
  LAST_UPDATED,
  PERIODS,
  periodLabel,
  PROVISIONAL,
  rolling12,
  SOURCE,
  yoy,
} from "@/content/estadisticas/data/escrituras-pba";

const ratePer100 = (fraction: number) =>
  (fraction * 100).toLocaleString("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

// Twelve latest monthly rows, with each count compared to the same month a
// year earlier. This keeps the table readable without mixing in seasonality.

/** Twelve rows: a full seasonal cycle, so the table can be read down the
 * left-hand column without a December sticking out of a shorter window. */
const WINDOW = 12;

export function EscriturasResumen() {
  const rows = PERIODS.slice(-WINDOW).map((period) => ({
    period,
    label: periodLabel(period),
    actos: compraventas(period),
    change: yoy(period),
    hip: hipotecas(period),
    share: hipotecaShare(period),
    provisional: PROVISIONAL.has(period),
  }));

  const last12 = rolling12(LAST_PERIOD);
  const previous12 = rolling12(PERIODS[PERIODS.length - 13]);
  const roll = rolling12(LAST_PERIOD, "hipotecas");
  const shareNow = last12 && roll ? roll / last12 : null;

  return (
    <DataFigure
      header={{
        title: (
          <>
            Escrituras de compraventa en la Provincia de Buenos Aires, últimos{" "}
            {WINDOW} meses
          </>
        ),
        subtitle: (
          <>
            {last12 !== null && (
              <>
                <span className="text-ink">
                  {formatCount(last12)} escrituras
                </span>{" "}
                en los últimos doce meses
                {previous12 !== null && previous12 > 0 && (
                  <>
                    {" "}
                    · {formatPct(last12 / previous12 - 1)} contra los doce
                    anteriores
                  </>
                )}
              </>
            )}
            {shareNow !== null && (
              <> · {ratePer100(shareNow)} hipotecas por cada 100 compraventas</>
            )}
          </>
        ),
      }}
      caption={
        <>
          La variación interanual compara cada mes con el mismo mes del año
          anterior.
        </>
      }
      note={
        <>
          «Hipotecas por 100 compraventas» divide la cantidad de actos
          hipotecarios por la de compraventas del mismo mes. Son actos distintos
          y se cuentan por separado: el cociente describe su relación, no qué
          parte de las operaciones se financió. Las escrituras se ordenan por
          fecha de firma; los meses
          provisorios pueden cambiar con nuevas presentaciones. Fuente: {SOURCE},
          datos hasta {LAST_UPDATED}.
        </>
      }
    >
      <div className="overflow-x-auto">
        <DataTable
          rows={rows}
          rowKey={(r) => String(r.period)}
          columns={[
            {
              header: "Mes",
              cellClassName: "text-ink",
              cell: (r) => (
                <>
                  {r.label}
                  {r.provisional && (
                    <span className="text-muted"> · provisorio</span>
                  )}
                </>
              ),
            },
            {
              header: "Escrituras",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-ink",
              cell: (r) => formatCount(r.actos),
            },
            {
              header: "Interanual",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-muted",
              cell: (r) => (r.change === null ? "—" : formatPct(r.change)),
            },
            {
              header: "Hipotecas",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-ink/90",
              cell: (r) => formatCount(r.hip),
            },
            {
              header: "Hipotecas / 100 compraventas",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-muted",
              cell: (r) =>
                r.share === null ? "—" : ratePer100(r.share),
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}

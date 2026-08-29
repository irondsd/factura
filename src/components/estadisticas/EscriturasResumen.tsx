import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import {
  compraventas,
  formatCount,
  formatPct,
  formatShare,
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

// The page's opening figure: the last twelve months of the province's deed
// register, month by month, each one against the same month a year earlier.
//
// It is a table rather than a chart on purpose. This is the number a reader
// arriving from "cuántas escrituras se firmaron en provincia de Buenos Aires"
// came for, and they want to read it, not measure it off an axis — the charts
// below are for the shape.
//
// Every comparison in it is year-on-year. Month-on-month is unusable on this
// series: December is four times January in every year of the last twenty-one,
// so a table of monthly changes would say "+58 %" every December and "-66 %"
// every January and mean nothing by either.
//
// Every number here is read from the dataset; the prose around it quotes none,
// so a refresh moves the table and leaves the sentences alone.

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
            {shareNow !== null && <> · {formatShare(shareNow)} con hipoteca</>}
          </>
        ),
      }}
      caption={
        <>
          Cada mes con su propio mes del año anterior al lado, que es la única
          comparación que este dato admite: diciembre es siempre el pico del año
          y enero siempre el piso, así que un mes contra el anterior mide el
          calendario y no el mercado.
        </>
      }
      note={
        <>
          «Con hipoteca» es la cantidad de hipotecas dividida por la cantidad de
          compraventas del mismo mes. Son dos actos distintos y se cuentan por
          separado, así que el cociente es una aproximación a cuánto del mercado
          se mueve con crédito, no la parte exacta de las operaciones que se
          financió. Las escrituras se ordenan por fecha de escritura y los
          últimos dos meses todavía se corrigen a medida que llegan
          presentaciones tardías. Fuente: {SOURCE}, datos hasta {LAST_UPDATED}.
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
              header: "Con hipoteca",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-muted",
              cell: (r) => (r.share === null ? "—" : formatShare(r.share)),
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}

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
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Escrituras de compraventa en la Provincia de Buenos Aires, últimos{" "}
          {WINDOW} meses
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          {last12 !== null && (
            <>
              <span className="text-ink">
                {formatCount(last12)} escrituras
              </span>{" "}
              en los últimos doce meses
              {previous12 !== null && previous12 > 0 && (
                <> · {formatPct(last12 / previous12 - 1)} contra los doce anteriores</>
              )}
            </>
          )}
          {shareNow !== null && (
            <> · {formatShare(shareNow)} con hipoteca</>
          )}
        </p>
      </figcaption>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="fd-th">Mes</th>
              <th className="fd-th text-right pl-3">Escrituras</th>
              <th className="fd-th text-right pl-3">Interanual</th>
              <th className="fd-th text-right pl-3">Hipotecas</th>
              <th className="fd-th text-right pl-3">Con hipoteca</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.period}>
                <td className="fd-td text-ink">
                  {r.label}
                  {r.provisional && (
                    <span className="text-muted"> · provisorio</span>
                  )}
                </td>
                <td className="fd-td text-right pl-3 text-ink tabular-nums whitespace-nowrap">
                  {formatCount(r.actos)}
                </td>
                <td className="fd-td text-right pl-3 text-muted tabular-nums whitespace-nowrap">
                  {r.change === null ? "—" : formatPct(r.change)}
                </td>
                <td className="fd-td text-right pl-3 text-ink/90 tabular-nums whitespace-nowrap">
                  {formatCount(r.hip)}
                </td>
                <td className="fd-td text-right pl-3 text-muted tabular-nums whitespace-nowrap">
                  {r.share === null ? "—" : formatShare(r.share)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Cada mes con su propio mes del año anterior al lado, que es la única
        comparación que este dato admite: diciembre es siempre el pico del año y
        enero siempre el piso, así que un mes contra el anterior mide el
        calendario y no el mercado.
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        «Con hipoteca» es la cantidad de hipotecas dividida por la cantidad de
        compraventas del mismo mes. Son dos actos distintos y se cuentan por
        separado, así que el cociente es una aproximación a cuánto del mercado
        se mueve con crédito, no la parte exacta de las operaciones que se
        financió. Las escrituras se ordenan por fecha de escritura y los últimos
        dos meses todavía se corrigen a medida que llegan presentaciones
        tardías. Fuente: {SOURCE}, datos hasta {LAST_UPDATED}.
      </p>
    </figure>
  );
}

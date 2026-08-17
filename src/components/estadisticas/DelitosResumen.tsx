import {
  breakdown,
  CITY_POPULATION,
  cityCount,
  cityRate,
  formatCount,
  formatPct,
  formatPer100k,
  formatRateBare,
  LAST_YEAR,
  YEARS,
} from "@/content/estadisticas/data/delitos-caba";

// The page's opening figure in text form: what the city recorded last year, by
// type, with the change against the year before.
//
// It sits above the map because a reader arriving from a search for "estadística
// de delitos en CABA" wants the city's number before they want their barrio's,
// and because the map's colours mean nothing until you know what the average
// they are measured against is.
//
// Every number here is read from the dataset. Nothing in the prose around it
// quotes a figure — see AUTHORING.md §5 — so a refresh moves the table and
// leaves the sentences alone.

const HOMICIDIOS = "homicidios";

export function DelitosResumen() {
  const rows = breakdown();
  const total = cityCount();
  const previous = YEARS[YEARS.length - 2];
  const change = previous === undefined ? null : cityCount("total", previous);

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Delitos registrados en la Ciudad de Buenos Aires, {LAST_YEAR}
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          <span className="text-ink">{formatCount(total)} hechos</span> ·{" "}
          {formatRateBare(cityRate())} cada 1.000 habitantes
          {change !== null && (
            <>
              {" "}
              · {formatPct(total / change - 1)} contra {previous}
            </>
          )}
        </p>
      </figcaption>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="fd-th">Tipo de hecho</th>
              <th className="fd-th text-right pl-3">Hechos</th>
              <th className="fd-th text-right pl-3">Cada 1.000 hab.</th>
              <th className="fd-th text-right pl-3">Contra {previous}</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((r) => r.inTotal)
              .map((r) => (
                <tr key={r.id}>
                  <td className="fd-td text-ink">{r.label}</td>
                  <td className="fd-td text-right pl-3 text-ink tabular-nums whitespace-nowrap">
                    {formatCount(r.count)}
                  </td>
                  <td className="fd-td text-right pl-3 text-ink/90 tabular-nums whitespace-nowrap">
                    {/* Homicide is the one line nobody reads per 1.000: at 78 a
                        year in a city of three million it rounds to 0,0, and the
                        rate everyone quotes and compares internationally is per
                        100.000. */}
                    {r.id === HOMICIDIOS
                      ? formatPer100k(r.count, CITY_POPULATION)
                      : formatRateBare(r.rate)}
                  </td>
                  <td className="fd-td text-right pl-3 text-muted tabular-nums whitespace-nowrap">
                    {r.change === null ? "—" : formatPct(r.change)}
                  </td>
                </tr>
              ))}
            <tr>
              <td className="fd-td text-ink font-semibold">Total</td>
              <td className="fd-td text-right pl-3 text-ink font-semibold tabular-nums whitespace-nowrap">
                {formatCount(total)}
              </td>
              <td className="fd-td text-right pl-3 text-ink font-semibold tabular-nums whitespace-nowrap">
                {formatRateBare(cityRate())}
              </td>
              <td className="fd-td text-right pl-3 text-muted tabular-nums whitespace-nowrap">
                {change === null ? "—" : formatPct(total / change - 1)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto mt-6">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="fd-th">Aparte del total</th>
              <th className="fd-th text-right pl-3">Hechos</th>
              <th className="fd-th text-right pl-3">Cada 1.000 hab.</th>
              <th className="fd-th text-right pl-3">Contra {previous}</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((r) => !r.inTotal)
              .map((r) => (
                <tr key={r.id}>
                  <td className="fd-td text-ink">{r.label}</td>
                  <td className="fd-td text-right pl-3 text-ink tabular-nums whitespace-nowrap">
                    {formatCount(r.count)}
                  </td>
                  <td className="fd-td text-right pl-3 text-ink/90 tabular-nums whitespace-nowrap">
                    {formatRateBare(r.rate)}
                  </td>
                  <td className="fd-td text-right pl-3 text-muted tabular-nums whitespace-nowrap">
                    {r.change === null ? "—" : formatPct(r.change)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Todo lo que el sistema de seguridad de la Ciudad registró en {LAST_YEAR}
        , con cuánto se movió cada tipo de hecho contra el año anterior.
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        Las cinco primeras filas suman el total; las dos de abajo, no. El robo y
        el hurto de vehículos ya están contados dentro de robos y hurtos, y se
        muestran aparte porque son la pregunta de quien tiene auto. Los
        siniestros viales quedan fuera del total a propósito: la fuente los
        publica en el mismo archivo porque los registra el mismo sistema, pero
        un choque no es un delito y sumarlos movería el mapa por el motivo
        equivocado.
      </p>
    </figure>
  );
}

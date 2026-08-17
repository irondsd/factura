import {
  formatCount,
  formatRateBare,
  formatRatio,
  LAST_YEAR,
  zonas,
} from "@/content/estadisticas/data/delitos-caba";

// The same year, read by zone instead of by barrio.
//
// Almost nobody searches for "la Comuna 12": the city is thought of in four
// pieces, and four rows is the most compact way to say the thing the map takes
// 48 polygons to say. The grouping is ours — the city publishes barrios and
// comunas and nothing else — so each row names the comunas it covers, which is
// what makes it checkable. It is the same grouping the price pages use, so the
// two tables can be read against one another, which is the whole point of
// keeping the geography in one module.
//
// Unlike the price pages' zone tables, this one aggregates rather than taking a
// median: crimes and residents both add up, so a zone's real rate is its events
// over its people. There is no weighting here we can't reproduce.

export function DelitosPorZona() {
  const rows = zonas();

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Delitos por zona de la Ciudad
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          Hechos registrados cada 1.000 habitantes · {LAST_YEAR}
        </p>
      </figcaption>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="fd-th">Zona</th>
              <th className="fd-th text-right pl-3">Cada 1.000 hab.</th>
              <th className="fd-th text-right pl-3">Contra la Ciudad</th>
              <th className="fd-th text-left pl-3">
                Barrio más alto y más bajo
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((z) => (
              <tr key={z.id}>
                <td className="fd-td align-top">
                  <span className="text-ink">{z.label}</span>
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                    {z.comunas}
                  </span>
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                    {formatCount(z.count)} hechos · {formatCount(z.population)}{" "}
                    habitantes
                  </span>
                </td>
                <td className="fd-td text-right pl-3 align-top text-ink tabular-nums whitespace-nowrap">
                  {formatRateBare(z.rate)}
                </td>
                <td className="fd-td text-right pl-3 align-top text-ink/90 tabular-nums whitespace-nowrap">
                  {formatRatio(z.ratio)}
                </td>
                <td className="fd-td pl-3 align-top text-muted text-[11.5px] leading-[1.5]">
                  <span className="text-ink/90">{z.dearest.label}</span>{" "}
                  {formatRateBare(z.dearest.rate)}
                  <span className="block mt-0.5">
                    <span className="text-ink/90">{z.calmest.label}</span>{" "}
                    {formatRateBare(z.calmest.rate)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Las cuatro zonas de la Ciudad ordenadas por delitos registrados cada
        1.000 habitantes, con el barrio más alto y el más bajo de cada una — que
        es lo que muestra cuánto se parecen entre sí los barrios de una misma
        zona, y cuánto no.
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        Cada fila es la suma de los hechos de la zona dividida por la suma de
        sus habitantes, no un promedio de barrios: dentro de una misma zona
        conviven San Nicolás y Agronomía, y un promedio simple daría un número
        que no describe a ninguno de los dos. La agrupación en cuatro zonas es
        nuestra —la Ciudad publica barrios y comunas—, y por eso cada fila dice
        qué comunas incluye. Datos de {LAST_YEAR}.
      </p>
    </figure>
  );
}

import {
  CITY,
  COVERAGE,
  formatArs,
  formatParcels,
  formatUsd,
  clustersByGroup,
  PROVINCIAL_MEDIAN_2024_USD_M2,
  usdM2,
  VINTAGE,
} from "@/content/estadisticas/data/suelo-cordoba";

const GROUPS = [
  { id: "provincia", label: "Clústeres de la provincia" },
  { id: "gran-cordoba", label: "Gran Córdoba" },
  { id: "capital", label: "Córdoba Capital" },
] as const;

/**
 * The official report's accessible, province-first summary table. The official
 * parcel map is linked from the article; this table keeps the report's cluster
 * medians in the page HTML so the answer does not depend on a map or
 * client-side code.
 */
export function SueloCordobaResumen() {
  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Valor de la tierra urbana en la Provincia de Córdoba
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          {COVERAGE.localities} localidades · síntesis {VINTAGE} · VUT
          homogeneizado, libre de mejoras
        </p>
      </figcaption>

      <dl className="grid grid-cols-1 gap-3 border-y border-line/60 py-4 sm:grid-cols-3">
        <div>
          <dt className="font-mono text-[11.5px] uppercase tracking-label-wide text-muted">
            Mediana provincial publicada
          </dt>
          <dd className="font-mono text-lg text-ink tabular-nums mt-1">
            Cerca de {formatUsd(PROVINCIAL_MEDIAN_2024_USD_M2)}/m²
          </dd>
          <dd className="font-mono text-[11.5px] text-muted mt-0.5">
            edición 2024
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[11.5px] uppercase tracking-label-wide text-muted">
            Cobertura territorial
          </dt>
          <dd className="font-mono text-lg text-ink tabular-nums mt-1">
            {COVERAGE.localities} localidades
          </dd>
          <dd className="font-mono text-[11.5px] text-muted mt-0.5">
            mapa provincial
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[11.5px] uppercase tracking-label-wide text-muted">
            Parcelas en esta síntesis
          </dt>
          <dd className="font-mono text-lg text-ink tabular-nums mt-1">
            {formatParcels(COVERAGE.provinceParcels)}
          </dd>
          <dd className="font-mono text-[11.5px] text-muted mt-0.5">
            clústeres urbanos · {VINTAGE}
          </dd>
        </div>
      </dl>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        La mediana provincial cercana a {formatUsd(PROVINCIAL_MEDIAN_2024_USD_M2)}
        /m² corresponde a la edición 2024 de IDECOR. La tabla que sigue
        conserva la síntesis por clúster del informe {VINTAGE}; no se mezclan
        ambas ediciones para fabricar una única cifra de «Córdoba».
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th scope="col" className="fd-th">
                Área o clúster
              </th>
              <th scope="col" className="fd-th text-right pl-3">
                Parcelas
              </th>
              <th scope="col" className="fd-th text-right pl-3">
                Mediana ARS/m²
              </th>
              <th scope="col" className="fd-th text-right pl-3">
                Mediana US$/m²
              </th>
            </tr>
          </thead>
          {GROUPS.map((group) => (
            <tbody key={group.id}>
              <tr>
                <th
                  scope="rowgroup"
                  colSpan={4}
                  className="fd-th text-left pt-5 pb-1 border-b-0"
                >
                  {group.label}
                </th>
              </tr>
              {clustersByGroup(group.id).map((cluster) => {
                const isCity = cluster.id === CITY.id;
                return (
                  <tr key={cluster.id}>
                    <th
                      scope="row"
                      className={`fd-td text-left align-top font-normal ${isCity ? "text-ink" : "text-ink/90"}`}
                    >
                      {cluster.label}
                      {isCity && (
                        <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                          Capital provincial
                        </span>
                      )}
                    </th>
                    <td className="fd-td text-right pl-3 align-top text-muted tabular-nums whitespace-nowrap">
                      {formatParcels(cluster.parcelCount)}
                    </td>
                    <td className="fd-td text-right pl-3 align-top text-ink tabular-nums whitespace-nowrap">
                      {formatArs(cluster.arsM2)}
                    </td>
                    <td className="fd-td text-right pl-3 align-top text-ink tabular-nums whitespace-nowrap">
                      {formatUsd(usdM2(cluster.arsM2))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        La síntesis {VINTAGE} permite leer la provincia por zonas. Córdoba
        Capital marca {formatUsd(usdM2(CITY.arsM2))} por m², equivalente a{" "}
        {formatArs(CITY.arsM2)} al tipo de cambio del estudio; las grandes
        ciudades, las localidades serranas y los demás clústeres muestran por
        qué una cifra única necesita contexto. Sus medianas no se promedian
        entre sí ni se presentan como un único precio de «Córdoba».
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        La tabla reproduce la síntesis por clúster del informe oficial. En
        total, los clústeres suman {formatParcels(COVERAGE.provinceParcels)}{" "}
        parcelas urbanas; el mapa oficial permite explorar el VUT a nivel de
        parcela y de lote típico. La estimación es masiva y homogeneizada: sirve
        para leer la estructura del mercado, no para tasar un lote puntual.
      </p>
    </figure>
  );
}

import {
  CITY,
  COVERAGE,
  EXCHANGE_RATE_NOTE,
  formatArs,
  formatParcels,
  formatUsd,
  clustersByGroup,
  usdM2,
  VINTAGE,
} from "@/content/estadisticas/data/suelo-cordoba";

const GROUPS = [
  { id: "capital", label: "Córdoba Capital" },
  { id: "gran-cordoba", label: "Gran Córdoba" },
  { id: "provincia", label: "Contexto provincial" },
] as const;

/**
 * The official report's accessible summary table. The official parcel map is
 * linked from the article; this table keeps the report's cluster medians in
 * the page HTML so the answer does not depend on a map or client-side code.
 */
export function SueloCordobaResumen() {
  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Valor mediano de la tierra urbana en Córdoba
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          VUT homogeneizado, libre de mejoras · {VINTAGE} · {EXCHANGE_RATE_NOTE}
        </p>
      </figcaption>

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
                          Respuesta principal
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
        La mediana de Córdoba Capital es {formatUsd(usdM2(CITY.arsM2))} por m²,
        equivalente a {formatArs(CITY.arsM2)} al tipo de cambio del estudio. Las
        filas de Gran Córdoba y del resto de la provincia son contexto: no se
        promedian entre sí ni se presentan como un único precio de «Córdoba».
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

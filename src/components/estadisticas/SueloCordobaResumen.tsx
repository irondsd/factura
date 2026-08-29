import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import { cn } from "@/lib/cn";
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
    <DataFigure
      header={{
        title: <>Valor de la tierra urbana en la Provincia de Córdoba</>,
        subtitle: (
          <>
            {COVERAGE.localities} localidades · síntesis {VINTAGE} · VUT
            homogeneizado, libre de mejoras
          </>
        ),
      }}
    >
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
        La mediana provincial cercana a{" "}
        {formatUsd(PROVINCIAL_MEDIAN_2024_USD_M2)}
        /m² corresponde a la edición 2024 de IDECOR. La tabla que sigue conserva
        la síntesis por clúster del informe {VINTAGE}; no se mezclan ambas
        ediciones para fabricar una única cifra de «Córdoba».
      </p>

      <div className="overflow-x-auto">
        <DataTable
          groups={GROUPS.map((group) => ({
            key: group.id,
            label: group.label,
            rows: clustersByGroup(group.id),
          }))}
          rowKey={(cluster) => cluster.id}
          columns={[
            {
              header: "Área o clúster",
              rowHeader: true,
              cellClassName: (cluster) =>
                cn(
                  "text-left align-top font-normal",
                  cluster.id === CITY.id ? "text-ink" : "text-ink/90",
                ),
              cell: (cluster) => (
                <>
                  {cluster.label}
                  {cluster.id === CITY.id && (
                    <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                      Capital provincial
                    </span>
                  )}
                </>
              ),
            },
            {
              header: "Parcelas",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-muted",
              cell: (cluster) => formatParcels(cluster.parcelCount),
            },
            {
              header: "Mediana ARS/m²",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-ink",
              cell: (cluster) => formatArs(cluster.arsM2),
            },
            {
              header: "Mediana US$/m²",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-ink",
              cell: (cluster) => formatUsd(usdM2(cluster.arsM2)),
            },
          ]}
        />
      </div>

      <figcaption className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        La síntesis {VINTAGE} permite leer la provincia por zonas. Córdoba
        Capital marca {formatUsd(usdM2(CITY.arsM2))} por m², equivalente a{" "}
        {formatArs(CITY.arsM2)} al tipo de cambio del estudio; las grandes
        ciudades, las localidades serranas y los demás clústeres muestran por
        qué una cifra única necesita contexto. Sus medianas no se promedian
        entre sí ni se presentan como un único precio de «Córdoba».
      </figcaption>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        La tabla reproduce la síntesis por clúster del informe oficial. En
        total, los clústeres suman {formatParcels(COVERAGE.provinceParcels)}{" "}
        parcelas urbanas; el mapa oficial permite explorar el VUT a nivel de
        parcela y de lote típico. La estimación es masiva y homogeneizada: sirve
        para leer la estructura del mercado, no para tasar un lote puntual.
      </p>
    </DataFigure>
  );
}

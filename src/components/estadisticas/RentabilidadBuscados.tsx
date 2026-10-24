import { DataFigure } from "@/components/figures/DataFigure";
import { featuredBarrioColumn, featuredRows } from "./featuredBarrios";
import { DataTable } from "@/components/figures/DataTable";
import {
  barrio,
  DEFAULT_SIZE,
  formatPayback,
  formatUsd,
  formatYield,
  LAST_UPDATED,
  NO_DATA,
  REFERENCE_AREA,
  SIZES,
} from "@/content/estadisticas/data/rentabilidad-caba";

// The handful of barrios people actually type into a search box, pulled out of
// the 48-row table under the map.
//
// The same six as the sale and rent pages, so a reader can carry a comparison
// across all three — and here the list does something the other two can't. On
// the price pages these six run in a fairly narrow band. Ranked by return they
// come apart: the two at the top and the two at the bottom are the two ends of
// the whole city, and the ordering is close to the reverse of the one the
// sibling pages show. That reversal is the page's argument in six rows.

const SIZE = SIZES.find((s) => s.id === DEFAULT_SIZE)!;
const AREA = REFERENCE_AREA[DEFAULT_SIZE];

export function RentabilidadBuscados() {
  // Most profitable first, so the "puesto" column reads in order. Withheld
  // barrios have no rank and sort last.
  const rows = featuredRows(
    (id) => barrio(id, DEFAULT_SIZE),
    (d) => d.value,
  );

  return (
    <DataFigure
      header={{
        title: <>Qué rinde en los barrios más consultados</>,
        subtitle: (
          <>
            Departamentos usados de {SIZE.label} de {AREA} m² · {LAST_UPDATED}
          </>
        ),
      }}
      caption={
        <>
          Rentabilidad bruta estimada y años de repago para estos barrios. La
          tabla completa está debajo del mapa.
        </>
      }
      note={
        <>
          El puesto es entre los barrios que tienen los dos precios publicados
          en el corte {LAST_UPDATED}, del que más rinde al que menos —{" "}
          <strong className="font-medium">al revés</strong> que en las páginas
          de precio. El precio del departamento estima una unidad de {AREA} m²
          multiplicando esa superficie por el precio de venta publicado por m²;
          no representa un aviso concreto. Fuente: IDECBA sobre avisos de
          Argenprop y ArgentinaDatos.
        </>
      }
    >
      <div className="overflow-x-auto">
        <DataTable
          rows={rows}
          rowKey={({ id }) => id}
          columns={[
            featuredBarrioColumn(NO_DATA),
            {
              header: "Rentabilidad",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-ink",
              cell: ({ data }) => (data ? formatYield(data.value) : "—"),
            },
            {
              header: "Repago",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-ink/90",
              cell: ({ data }) => (data ? formatPayback(data.payback) : "—"),
            },
            {
              header: "Precio del depto.",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-ink/90",
              cell: ({ data }) =>
                data?.flatUsd ? formatUsd(data.flatUsd) : "—",
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}

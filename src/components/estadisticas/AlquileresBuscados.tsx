import { DataFigure } from "@/components/figures/DataFigure";
import { featuredBarrioColumn, featuredRows } from "./featuredBarrios";
import { DataTable } from "@/components/figures/DataTable";
import {
  barrio,
  DEFAULT_SIZE,
  formatArs,
  formatArsPerMetre,
  LAST_UPDATED,
  NO_DATA,
  REFERENCE_AREA,
  SIZES,
} from "@/content/estadisticas/data/alquiler-caba";

// The rent counterpart of `BarriosBuscados`: the handful of barrios people type
// into a search box, pulled out of the 48-row table so they can be read without
// hunting, each with its position among the barrios that have a figure.
//
// Same list as the sale page on purpose — these are the barrios that get looked
// up, and keeping them identical is what lets a reader carry a comparison
// between the two pages.
//
// The third column is the rent per m², which on this page is doing real work
// rather than decorating: it is the only figure here that compares across unit
// sizes, and it is IDECBA's own arithmetic (their monthly figure assumes a
// fixed surface, stated in the source and read out by the refresh script), not
// a reference number we picked. That is the difference from the sale page's
// third column, which *is* ours and has to say so.

const SIZE = SIZES.find((s) => s.id === DEFAULT_SIZE)!;
const AREA = REFERENCE_AREA[DEFAULT_SIZE];

/** "A, B y C" — Spanish has no serial comma. */
const list = (items: string[]): string =>
  items.length < 2
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;

export function AlquileresBuscados() {
  // Dearest first, so the "puesto" column reads in order. Withheld barrios have
  // no rank and go last — on this page that is a real possibility, not a
  // formality: IDECBA withholds rent for about a third of the barrios.
  const rows = featuredRows(
    (id) => barrio(id, DEFAULT_SIZE),
    (d) => d.monthly,
  );

  return (
    <DataFigure
      header={{
        title: <>El alquiler en los barrios más consultados</>,
        subtitle: (
          <>
            Departamentos usados de {SIZE.label} · {LAST_UPDATED}
          </>
        ),
      }}
      caption={
        <>
          Cuánto sale alquilar en {list(rows.map((r) => r.data?.label ?? r.id))}
          , con el precio del mes y el equivalente por metro cuadrado. El resto
          de los barrios de la Ciudad están en la tabla completa, debajo del
          mapa.
        </>
      }
      note={
        <>
          El puesto es entre los barrios con alquiler publicado este trimestre,
          del más caro al más barato; cuántos son cambia según cuántos avisos
          haya habido, y en alquiler son bastantes menos que en venta. El valor
          por m² es el precio del mes dividido por los {AREA} m² que IDECBA toma
          como superficie de referencia para un {SIZE.label}. Fuente: IDECBA
          sobre la base de Argenprop, datos hasta el {LAST_UPDATED}.
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
              header: "Alquiler por mes",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-ink",
              cell: ({ data }) => (data ? formatArs(data.monthly) : "—"),
            },
            {
              header: "Por m²",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-ink/90",
              cell: ({ data }) =>
                data ? formatArsPerMetre(data.perMetre) : "—",
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}

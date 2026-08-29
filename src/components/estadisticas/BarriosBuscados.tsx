import { DataFigure } from "@/components/figures/DataFigure";
import { featuredBarrioColumn, featuredRows } from "./featuredBarrios";
import { DataTable } from "@/components/figures/DataTable";
import {
  barrio,
  DEFAULT_SIZE,
  formatUsd,
  LAST_UPDATED,
  NO_DATA,
  REFERENCE_AREA,
  SIZES,
  totalPrice,
} from "@/content/estadisticas/data/venta-caba";

// The handful of barrios people actually type into a search box, pulled out of
// the 48-row table so they can be read without hunting.
//
// The table under the map already has every barrio, sorted by price. What it
// can't give is *position*: that Palermo is the third dearest of the city and
// Flores the thirty-somethingth is the fact that makes a number mean something,
// and it is not readable from a list you have to count down. So each row here
// carries its rank, and both the rank and the count it is out of are derived —
// the count moves every quarter, because it counts only the barrios IDECBA
// published a figure for.
//
// Editorial, and deliberately short: a row per barrio for all 48 would be the
// table above with extra columns.

const SIZE = SIZES.find((s) => s.id === DEFAULT_SIZE)!;
const AREA = REFERENCE_AREA[DEFAULT_SIZE];

/** "A, B y C" — Spanish has no serial comma. */
const list = (items: string[]): string =>
  items.length < 2
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;

export function BarriosBuscados() {
  // Dearest first, like every other table on the page — listing them in the
  // editorial order above would print the "puesto" column out of order, which
  // reads as a bug in the ranking rather than as a choice about the list.
  // Withheld barrios have no rank, so they go last.
  const rows = featuredRows(
    (id) => barrio(id, DEFAULT_SIZE),
    (d) => d.value,
  );

  return (
    <DataFigure
      header={{
        title: <>El valor del m² en los barrios más consultados</>,
        subtitle: (
          <>
            Departamentos usados de {SIZE.inTitle} · {LAST_UPDATED}
          </>
        ),
      }}
      caption={
        <>
          {/* The list is built from the rows so it can't fall out of step with
            them, and joined with a final "y" so it reads as a sentence. */}
          El valor del metro cuadrado en{" "}
          {list(rows.map((r) => r.data?.label ?? r.id))}, con el precio de un
          departamento de {SIZE.inTitle} de {AREA} m² en cada uno. El resto de
          los barrios de la Ciudad están en la tabla completa, debajo del mapa.
        </>
      }
      note={
        <>
          El puesto es entre los barrios con precio publicado este trimestre,
          del más caro al más barato; cuántos son cambia según cuántos avisos
          haya habido. Los {AREA} m² son una superficie de referencia, no un
          promedio del mercado. Fuente: IDECBA sobre la base de Argenprop, datos
          hasta el {LAST_UPDATED}.
        </>
      }
    >
      <div className="overflow-x-auto">
        {/* The rank rides in the barrio cell's second line rather than in a
            fourth column, for the reason given in PrecioDepartamento: two
            money columns are all a narrow phone has room for beside a name,
            and the rank is the one value here that isn't a price. */}
        <DataTable
          rows={rows}
          rowKey={({ id }) => id}
          columns={[
            featuredBarrioColumn(NO_DATA),
            {
              header: "US$ por m²",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-ink",
              cell: ({ data }) => (data ? formatUsd(data.value) : "—"),
            },
            {
              header: (
                <>
                  Un {SIZE.short} de {AREA} m²
                </>
              ),
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-ink/90",
              cell: ({ data }) =>
                data ? formatUsd(totalPrice(data.value, AREA)) : "—",
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}

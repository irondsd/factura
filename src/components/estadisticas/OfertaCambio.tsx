import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import {
  barrioChange,
  DEFAULT_SIZE,
  displayShort,
  formatIndex,
  LAST_UPDATED,
  WINDOWS,
} from "@/content/estadisticas/data/oferta-alquiler-caba";

// The city's history barrio by barrio, as an index against 2016–2019.
//
// ── Why an index and not a count ───────────────────────────────────────────
// Because the question is "did it come back", and that question is about each
// barrio's own past. Palermo advertises a hundred times what Villa Riachuelo
// does, so a table of counts sorts by size and answers a question the map on
// the sibling page already answers better. Against its own baseline, every
// barrio is on the same scale and the ranking is about recovery.
//
// ── Why every barrio and no ranking cut ────────────────────────────────────
// The single most informative row in this table is the last one. A "top ten
// recovered" would have dropped it, and it is the only barrio in the city that
// did not come back at all — a fact worth more than the nine barrios above it
// combined. Whatever the ends look like after the next refresh, they will
// still be here.

const [BASE, TROUGH, NOW] = WINDOWS;

export function OfertaCambio() {
  const rows = barrioChange(DEFAULT_SIZE);
  const recovered = rows.filter((r) => (r.index.at(-1) ?? 0) >= 100).length;

  return (
    <DataFigure
      header={{
        title: <>Cuánto cayó y cuánto volvió cada barrio</>,
        subtitle: (
          <>
            <span className="text-ink">Índice base 100 = {BASE.label}</span> ·{" "}
            {recovered} de {rows.length} barrios superan hoy su propio promedio
            de {BASE.label} · Ordenados por el índice, no por tamaño: la primera
            columna dice sobre qué base se mueve cada uno
          </>
        ),
      }}
      caption={
        <>
          Los 48 barrios de la Ciudad de Buenos Aires ordenados por cuánto se
          publica hoy en cada uno comparado con lo que se publicaba entre 2016 y
          2019. Un índice de 100 es exactamente el promedio de esos cuatro años;
          200, el doble; 50, la mitad.
        </>
      }
      note={
        <>
          Cada columna es el promedio mensual de su ventana: {BASE.label} son{" "}
          {BASE.note}, {TROUGH.label} es {TROUGH.note} y la última son los doce
          meses {NOW.note}. Un barrio chico se mueve mucho sobre una base chica,
          y los primeros puestos tienen bastante de eso: por eso la primera
          columna muestra de cuántos departamentos por mes parte cada uno, y
          conviene leerla antes que el índice. La base es {BASE.label} y no el
          arranque de la serie porque en 2015 cambió el proveedor de avisos del
          que sale el dato, y los años anteriores no son estrictamente
          comparables. La cantidad de departamentos es aproximada y está
          redondeada; el índice se calcula sobre los metros cuadrados
          publicados, sin redondear. Fuente: IDECBA, datos hasta {LAST_UPDATED}.
        </>
      }
    >
      <div className="overflow-x-auto">
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          columns={[
            {
              header: "Barrio",
              cellClassName: "align-top",
              cell: (row) => (
                <>
                  <span className="text-ink">{row.label}</span>
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                    {row.meta}
                  </span>
                </>
              ),
            },
            // The baseline column prints the count rather than the 100 every
            // row would otherwise carry: it is the size the two indices beside
            // it are percentages of, and without it a reader cannot tell a
            // barrio that doubled from four flats to eight from one that
            // doubled from four hundred.
            {
              header: (
                <>
                  {BASE.label}
                  <span className="block font-normal normal-case tracking-normal text-[10.5px] leading-[1.4] opacity-80">
                    deptos./mes
                  </span>
                </>
              ),
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-muted align-top",
              cell: (row) => displayShort(row.units[0]),
            },
            {
              header: (
                <>
                  {TROUGH.label}
                  <span className="block font-normal normal-case tracking-normal text-[10.5px] leading-[1.4] opacity-80">
                    índice
                  </span>
                </>
              ),
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-ink/90 align-top",
              cell: (row) => formatIndex(row.index[1]),
            },
            {
              header: (
                <>
                  {NOW.label}
                  <span className="block font-normal normal-case tracking-normal text-[10.5px] leading-[1.4] opacity-80">
                    índice
                  </span>
                </>
              ),
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-ink align-top",
              cell: (row) => (
                <>
                  {formatIndex(row.index[2])}
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5 font-normal">
                    {displayShort(row.units[2])}
                  </span>
                </>
              ),
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}

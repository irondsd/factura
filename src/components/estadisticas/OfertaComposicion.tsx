import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import {
  cityWindow,
  DEFAULT_SIZE,
  display,
  formatIndex,
  formatM2,
  LAST_UPDATED,
  cityIndex,
  sizeMix,
  WINDOWS,
} from "@/content/estadisticas/data/oferta-alquiler-caba";

// What came back is not quite what left.
//
// The chart above says how much is on offer; this says what it is made of. The
// market that recovered after 2023 is visibly smaller-grained than the one that
// went into the fall: the one-ambiente share of advertised square metres is up
// by most of half again, and the three-, four- and five-ambiente share is down.
//
// ── Shares of m², and why the last row has to be there ─────────────────────
// The published tables are "1 a 5 ambientes" plus separate ones for 1, 2 and 3.
// There is no table for four and five, so that band exists here only as the
// residual — and it is never small, which is exactly why it is printed. A table
// of three rows adding to about 88 % would leave the reader to assume the
// missing eighth is rounding.
//
// It also has to be m² rather than flats. IDECBA publishes an average surface
// for one, two and three ambientes and none at all for the "4 y 5" band, so
// that row has square metres and no count to give. In square metres the four
// rows are the whole market by construction.
//
// ── Windows, not the latest month ──────────────────────────────────────────
// Every column is twelve months or more, so nothing here turns on the season or
// on one noisy month. See `WINDOWS` in the data module.

export function OfertaComposicion() {
  const mix = sizeMix();

  return (
    <DataFigure
      header={{
        title: <>De qué está hecha la oferta, antes y después</>,
        subtitle: (
          <>
            Parte de los metros cuadrados publicados en alquiler en la Ciudad,
            por tamaño de departamento
          </>
        ),
      }}
      caption={
        <>
          Cómo se repartió la superficie publicada en alquiler en la Ciudad de
          Buenos Aires entre monoambientes, dos, tres, y cuatro y cinco
          ambientes, en los cuatro años previos a la caída, en el año más bajo
          de la serie y en los últimos doce meses.
        </>
      }
      note={
        <>
          Las columnas son promedios de {WINDOWS.map((w) => w.label).join(", ")}{" "}
          —{WINDOWS.map((w) => w.note).join("; ")}—, no meses sueltos. El
          reparto va en metros cuadrados y no en cantidad de departamentos
          porque el organismo publica una superficie promedio para uno, dos y
          tres ambientes, y ninguna para cuatro y cinco: esa fila es el resto, y
          es la única forma de que las cuatro sumen el mercado entero. El índice
          de la última fila toma {WINDOWS[0].label} como 100. Fuente: IDECBA,
          datos hasta {LAST_UPDATED}.
        </>
      }
    >
      <div className="overflow-x-auto">
        <DataTable
          rows={mix}
          rowKey={(row) => row.id}
          columns={[
            {
              header: "Tamaño",
              cellClassName: "text-ink align-top",
              cell: (row) => row.label,
            },
            ...WINDOWS.map((w, i) => ({
              header: w.label,
              headClassName: "text-right pl-3",
              numeric: true,
              cellClassName: "pl-3 text-ink/90 align-top",
              cell: (row: (typeof mix)[number]) => (
                <>
                  {row.shares[i].toLocaleString("es-AR", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}{" "}
                  %
                </>
              ),
            })),
          ]}
          // The size mix says nothing about how big the market was, and the
          // whole point of this table is that the mix changed while the size
          // changed far more. So the totals close it.
          footer={
            <tr>
              <td className="fd-td align-top">
                <span className="text-ink">Toda la oferta</span>
                <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                  promedio por mes
                </span>
              </td>
              {WINDOWS.map((w) => (
                <td key={w.id} className="fd-td fd-num pl-3 text-ink align-top">
                  {display(cityWindow(DEFAULT_SIZE, w.id).units)}
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5 font-normal">
                    {formatM2(cityWindow(DEFAULT_SIZE, w.id).m2)}
                  </span>
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5 font-normal">
                    índice {formatIndex(cityIndex(DEFAULT_SIZE, w.id))}
                  </span>
                </td>
              ))}
            </tr>
          }
        />
      </div>
    </DataFigure>
  );
}

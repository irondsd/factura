import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import {
  ciudad,
  formatUsd,
  LAST_UPDATED,
  REFERENCE_AREA,
  SIZES,
  totalPrice,
} from "@/content/estadisticas/data/venta-caba";

// "¿Y cuánto sale entonces un departamento?" — the question the map doesn't
// answer, on a page whose whole subject is the price per square metre.
//
// A price per metre is the right unit for comparing two barrios and the wrong
// one for picturing an actual purchase, so this table does the multiplication
// the reader would otherwise do in their head: the city's published metre,
// times a round surface for each layout. It is server-rendered ordinary markup,
// which is what puts the three figures into the HTML as text (AUTHORING.md §7).
//
// The surfaces are ours and the arithmetic is visible on purpose: both columns
// that go into the total are on screen next to it, so a reader looking at a
// 62 m² flat can redo the sum instead of trusting ours. See `REFERENCE_AREA`.

const AREA = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

export function PrecioDepartamento() {
  const rows = SIZES.map((s) => {
    const perMetre = ciudad(s.id);
    const area = REFERENCE_AREA[s.id];
    return {
      ...s,
      area,
      perMetre,
      total: perMetre === null ? null : totalPrice(perMetre, area),
    };
  });

  return (
    <DataFigure
      header={{
        title: <>Cuánto cuesta un departamento en la Ciudad de Buenos Aires</>,
        subtitle: <>Promedio de la Ciudad · {LAST_UPDATED}</>,
      }}
      caption={
        <>
          Cuánto sale un departamento en CABA, según el precio de publicación
          del metro cuadrado que releva IDECBA para toda la Ciudad. Para un
          barrio en particular, multiplica los metros cuadrados de la unidad por
          el valor de ese barrio en el mapa de arriba.
        </>
      }
      note={
        <>
          Las superficies son redondas y de referencia: IDECBA publica el precio
          del metro cuadrado, no el tamaño de los departamentos en venta. Si
          cambian los metros cambia el total, que es exactamente lo que pasa en
          el mercado. Son precios de publicación en dólares, no de
          escrituración. Fuente: IDECBA sobre la base de Argenprop, datos hasta
          el {LAST_UPDATED}.
        </>
      }
    >
      <div className="overflow-x-auto">
        {/* Three columns, with the surface on a second line under the layout
            rather than in a fourth. A price in dollars can't be broken across
            lines, so each money column costs ~90 px whatever the viewport —
            four of them can't fit a 375 px phone, and the surface is the one
            that reads just as well as a subtitle. */}
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            {
              header: "Departamento",
              cellClassName: "align-top",
              cell: (r) => (
                <>
                  <span className="text-ink whitespace-nowrap">{r.label}</span>
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                    {AREA.format(r.area)} m² de referencia
                  </span>
                </>
              ),
            },
            {
              header: "US$ por m²",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-ink/90",
              cell: (r) => (r.perMetre === null ? "—" : formatUsd(r.perMetre)),
            },
            {
              header: "Precio aproximado",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-ink",
              cell: (r) => (r.total === null ? "—" : formatUsd(r.total)),
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}

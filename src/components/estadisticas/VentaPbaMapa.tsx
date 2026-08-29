import { DataFigure } from "@/components/figures/DataFigure";
import { MapaAmba, type MapView } from "@/components/maps/MapaPba";
import { PARTIDOS } from "@/content/shared/pba";
import {
  BREAKS,
  coverage,
  display,
  formatPct,
  formatUsd,
  LAST_UPDATED,
  LEGEND,
  NO_DATA,
  ranked,
  rows,
  SCOPE,
  SCOPE_LONG,
  SOURCE,
} from "@/content/estadisticas/data/venta-pba";

// The map on /estadisticas/precio-m2-provincia-buenos-aires: asking price per
// square metre, in dollars, by partido.
//
// The server half of the figure, in the same split as the CABA maps (see
// VentaCabaMapa.tsx). It owns the <figure> shell, the caption and the source
// note, and turns the dataset into the plain views the interactive half draws —
// including every formatted string, so that component never learns these are
// dollars.
//
// ── Why there is no switch ────────────────────────────────────────────────
// The CABA maps carry two: a geography (barrios/comunas) and a unit size. This
// one has neither to offer. A partido is the smallest unit anything publishes a
// price for, and there is no second administrative level above it worth
// drawing; and the source publishes one figure per partido, not one per layout.
// A control with one option is worse than no control.
//
// What the map shows that the table cannot is *where* the dear partidos are:
// they are contiguous, along the river, rather than spread through the zone
// they are filed under. A ranked table can't say that. See the caption.

/** The line under the heading. Derived, never typed: the ranking flips between
 * refreshes and the extremes move. */
function stat(): string {
  const order = ranked().filter((r) => r.usd !== null);
  const top = order[0];
  const bottom = order[order.length - 1];
  // Argentine decimal comma: "2,9 veces", never "2.9".
  const RATIO = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const ratio =
    top && bottom ? (top.usd as number) / (bottom.usd as number) : null;
  return [
    top ? `Máximo ${top.label} ${formatUsd(top.usd as number)}/m²` : null,
    bottom ? `Mínimo ${bottom.label} ${formatUsd(bottom.usd as number)}` : null,
    ratio ? `${RATIO.format(ratio)} veces entre puntas` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The coverage sentence — the caveat that cannot wait, so it sits on the
 * figure rather than in the methodology section. It has two parts here and both
 * are computed: how many partidos are shaded, and the fact that the ones that
 * aren't on the map at all are most of the province. */
function note(): string {
  const { withData, total, missing } = coverage();
  const shaded =
    missing.length === 0
      ? `Los ${total} partidos con precio publicado están coloreados.`
      : `${withData} de los ${total} partidos tienen precio este mes; ${missing.join(", ")} ${missing.length === 1 ? "aparece rayado" : "aparecen rayados"}.`;
  // Derived, because the day a portal starts pricing another partido this
  // sentence has to shrink with the map rather than contradict it.
  const unpriced = PARTIDOS.length - total;
  return `${shaded} Este es ${SCOPE_LONG}, no la provincia entera: los otros ${unpriced} partidos no aparecen porque ningún portal publica un precio para ellos, así que el mapa termina donde termina el dato y no donde termina la provincia. La Ciudad de Buenos Aires se dibuja en gris porque no es parte de la provincia y tiene su propia página.`;
}

export function VentaPbaMapa() {
  const view: MapView = {
    geo: "partidos",
    regions: rows().map((r) => ({
      id: r.id,
      label: r.label,
      meta: r.zonaLabel,
      value: r.usd,
      display: display(r.usd),
      sub: r.anual === null ? null : `${formatPct(r.anual)} anual`,
    })),
    stat: stat(),
    note: note(),
  };

  return (
    <DataFigure
      caption={
        <>
          El valor del metro cuadrado de los departamentos en venta en los{" "}
          {rows().length} partidos de la provincia para los que hay dato —
          {SCOPE} y La Plata—, en dólares. El mapa no se ordena en bloques por
          zona: la franja más cara es continua y corre pegada al río hacia el
          norte, y a medida que uno se aleja de la Ciudad —en cualquier
          dirección— el valor cae. Dos partidos vecinos pueden estar al doble
          uno del otro, y eso se ve mejor acá que en la tabla.
        </>
      }
      note={
        <>
          Son precios de publicación —lo que se pide, no lo que se paga— y no
          hay una serie oficial equivalente: ningún organismo de estadística
          releva el precio del m² en la provincia. Fuente: {SOURCE}, datos hasta{" "}
          {LAST_UPDATED}. El delta de Tigre y San Fernando no se dibuja: son
          islas, y el precio que publica el portal es el de la parte
          continental.
        </>
      }
    >
      <MapaAmba
        title={`Precio del m² por partido en ${SCOPE_LONG}`}
        dimensions={[]}
        initial={{}}
        views={{ "": view }}
        breaks={[...BREAKS]}
        legend={LEGEND}
        noDataLabel={NO_DATA}
        dataDate={`Datos de ${LAST_UPDATED}`}
        columns={{
          region: "Partido",
          value: "US$ por m²",
          sub: "Variación anual",
        }}
        ariaLabel="Mapa de los partidos del Gran Buenos Aires y La Plata sombreados según el precio de publicación del metro cuadrado en venta. Los mismos valores están en la tabla que sigue."
      />
    </DataFigure>
  );
}

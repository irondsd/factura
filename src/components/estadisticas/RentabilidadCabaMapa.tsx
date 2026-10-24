import { DataFigure } from "@/components/figures/DataFigure";
import {
  BREAKS,
  ciudad,
  coverage,
  DEFAULT_GEO,
  DEFAULT_SIZE,
  display,
  displayPayback,
  formatPayback,
  formatYield,
  type Geo,
  LAST_PERIOD,
  LAST_UPDATED,
  LEGEND,
  NO_DATA,
  payback,
  PROVISIONAL,
  ranked,
  REFERENCE_AREA,
  rows,
  type SizeId,
  SIZES,
} from "@/content/estadisticas/data/rentabilidad-caba";
import { MapaCaba, type MapView } from "@/components/maps/MapaCaba";

// The map on /estadisticas/rentabilidad-alquiler-caba: gross annual rental
// yield, by barrio or comuna, for 1/2/3-ambiente used apartments.
//
// The server half of the figure, same split as the other two CABA maps. What
// differs here is only what the numbers mean, and two consequences of that:
//
//   • **the scale runs the other way.** On the sale and rent maps dark is
//     expensive. Here dark is a higher return, which is the *cheaper* barrio —
//     so the two maps of the same city come out close to photographic
//     negatives of each other. Nothing in `MapaCaba` needs to know; the note
//     under the legend says it, because a reader arriving from either sibling
//     page carries the opposite habit;
//   • **the shaded figure and the printed one are the same fact.** The map
//     shades by yield and the table's second column is the payback in years,
//     which is its reciprocal. They cannot disagree, which is why the years can
//     be shown at all — it is the unit people actually say.

const GEOS: {
  id: Geo;
  label: string;
  noun: string;
  article: string;
  striped: [string, string];
}[] = [
  {
    id: "barrios",
    label: "Barrios",
    noun: "barrios",
    article: "los",
    striped: ["aparece rayado", "aparecen rayados"],
  },
  {
    id: "comunas",
    label: "Comunas",
    noun: "comunas",
    article: "las",
    striped: ["aparece rayada", "aparecen rayadas"],
  },
];

/** The line under the heading: the city, then the two ends. "Máximo" here is
 * the best return, not the highest price — the opposite end of the city from
 * the one it names on the sibling pages. */
function stat(geo: Geo, size: SizeId): string {
  const city = ciudad(size);
  const order = ranked(geo, size);
  const best = order[0];
  const worst = order[order.length - 1];
  return [
    city === null
      ? null
      : `Promedio de la Ciudad ${formatYield(city)} anual · ${formatPayback(payback(city))} de repago`,
    best ? `Máxima ${best.label} ${formatYield(best.value)}` : null,
    worst ? `Mínima ${worst.label} ${formatYield(worst.value)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The note under the map: what the colour means, then the actual coverage. */
function note(geo: Geo, size: SizeId): string {
  const { withData, total, missing } = coverage(geo, size);
  const { noun, article, striped } = GEOS.find((g) => g.id === geo)!;
  const capitalised = article[0].toUpperCase() + article.slice(1);
  const label = SIZES.find((s) => s.id === size)!.label;
  const scale =
    `El tono más oscuro representa un porcentaje mayor de rentabilidad bruta. ` +
    `La tabla expresa el mismo cálculo como años de repago. ` +
    `La referencia es un departamento usado de ${label} y ${REFERENCE_AREA[size]} m², la superficie de IDECBA.`;
  const cover = !missing.length
    ? `${capitalised} ${total} ${noun} tienen los dos precios publicados en el trimestre ${LAST_PERIOD}.`
    : `${withData} de ${article} ${total} ${noun} tienen los dos precios —venta y alquiler— publicados en ${LAST_PERIOD}. ` +
      `El retorno requiere ambos datos de IDECBA. En el mapa quedan sin valor ${missing.join(", ")} ` +
      `(${missing.length === 1 ? striped[0] : striped[1]}). ` +
      `El corte corresponde a ${LAST_PERIOD}.`;
  return `${scale} ${cover}`;
}

export function RentabilidadCabaMapa() {
  const views: Record<string, MapView> = {};
  for (const size of SIZES) {
    for (const geo of GEOS) {
      views[`${size.id}-${geo.id}`] = {
        geo: geo.id,
        regions: rows(geo.id, size.id).map((r) => ({
          id: r.id,
          label: r.label,
          meta: r.meta,
          value: r.value,
          display: display(r.value),
          sub: displayPayback(r.payback),
        })),
        stat: stat(geo.id, size.id),
        note: note(geo.id, size.id),
      };
    }
  }

  const provisional = PROVISIONAL.has(LAST_PERIOD);

  return (
    <DataFigure
      caption={
        <>
          Rentabilidad bruta anual del alquiler de departamentos usados en la
          Ciudad de Buenos Aires, por barrio y comuna. La tabla presenta el
          porcentaje calculado y su equivalente en años de repago.
        </>
      }
      note={
        <>
          Es una rentabilidad <strong className="font-medium">bruta</strong>: no
          descuenta expensas, ABL, impuesto a las ganancias, seguro, comisiones,
          arreglos ni los meses sin inquilino; esta serie no calcula el valor
          neto. Se
          calcula sobre precios de{" "}
          <strong className="font-medium">publicación</strong> de los dos lados
          —lo que se pide, no lo que se firma— y el alquiler en pesos se pasa a
          dólares al promedio trimestral del dólar blue. Fuentes: IDECBA sobre
          la base de Argenprop y ArgentinaDatos, datos hasta el {LAST_UPDATED}
          {provisional ? " (provisorio)" : ""}.
        </>
      }
    >
      <MapaCaba
        title="Mapa de rentabilidad del alquiler en CABA"
        dimensions={[
          {
            name: "size",
            label: "Tamaño del departamento",
            options: SIZES.map((s) => ({ value: s.id, label: s.short })),
          },
          {
            name: "geo",
            label: "Nivel del mapa",
            options: GEOS.map((g) => ({ value: g.id, label: g.label })),
          },
        ]}
        initial={{ size: DEFAULT_SIZE, geo: DEFAULT_GEO }}
        views={views}
        breaks={[...BREAKS]}
        legend={LEGEND}
        noDataLabel={NO_DATA}
        dataDate={`Datos del ${LAST_UPDATED}${provisional ? " · dato provisorio" : ""}`}
        columns={{
          region: "Barrio o comuna",
          value: "Rentabilidad anual",
          sub: "Repago",
        }}
        ariaLabel="Mapa de la Ciudad de Buenos Aires sombreado según la rentabilidad bruta anual del alquiler. Los mismos valores están en la tabla que sigue."
      />
    </DataFigure>
  );
}

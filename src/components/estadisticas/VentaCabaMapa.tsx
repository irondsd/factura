import { DataFigure } from "@/components/figures/DataFigure";
import {
  BREAKS,
  ciudad,
  coverage,
  DEFAULT_SIZE,
  display,
  formatUsd,
  type Geo,
  LAST_PERIOD,
  LAST_UPDATED,
  LEGEND,
  NO_DATA,
  PROVISIONAL,
  ranked,
  rows,
  type SizeId,
  SIZES,
} from "@/content/estadisticas/data/venta-caba";
import { MapaCaba, type MapView } from "@/components/maps/MapaCaba";

// The map on /estadisticas/precio-m2-caba: asking price per square metre, in
// dollars, by barrio or comuna, for 1/2/3-ambiente used apartments.
//
// The server half of the figure, in the same split as the charts (see
// IpcViviendaChart.tsx). It owns the <figure> shell, the caption and the source
// note, and it turns the dataset into the six plain views the interactive half
// draws — including every formatted string, so that component never has to know
// these are dollars.
//
// An .mdx page places it with a bare <VentaCabaMapa /> and nothing else.

// `article` and `striped` are separate fields rather than one templated noun
// because Spanish makes you choose: "los 48 barrios ... aparecen rayados" but
// "las 15 comunas ... aparecen rayadas". A template with one gender gets one of
// the two maps wrong in every sentence it builds.
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

/** The line under the heading: the city average, then the two ends of the
 * range. Derived, never typed — the ranking flips between refreshes. */
function stat(geo: Geo, size: SizeId): string {
  const city = ciudad(size);
  const order = ranked(geo, size);
  const top = order[0];
  const bottom = order[order.length - 1];
  const parts = [
    city === null ? null : `Promedio de la Ciudad ${formatUsd(city)}/m²`,
    top ? `Máximo ${top.label} ${formatUsd(top.value)}` : null,
    bottom ? `Mínimo ${bottom.label} ${formatUsd(bottom.value)}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

/** The coverage sentence. The most important caveat on the figure, so it is
 * computed from the data and names the regions it is about rather than saying
 * "algunos" — those regions are the poorest parts of the city, and a reader who
 * can't find their barrio deserves to see it listed. */
function note(geo: Geo, size: SizeId): string {
  const { withData, total, missing } = coverage(geo, size);
  const { noun, article, striped } = GEOS.find((g) => g.id === geo)!;
  const capitalised = article[0].toUpperCase() + article.slice(1);
  if (!missing.length) {
    return `${capitalised} ${total} ${noun} tienen precio publicado en este trimestre.`;
  }
  return (
    `${withData} de ${article} ${total} ${noun} tienen precio publicado en este trimestre. ` +
    `IDECBA no publica un promedio donde hubo muy pocos avisos, así que ${missing.join(", ")} ` +
    `${missing.length === 1 ? striped[0] : striped[1]} en el mapa. ` +
    `Rayado quiere decir sin dato publicado, no barato.`
  );
}

export function VentaCabaMapa() {
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
          Precio de publicación del metro cuadrado de departamentos usados en
          venta en la Ciudad de Buenos Aires, en dólares, por barrio y por
          comuna. Permite comparar cuánto cuesta el metro cuadrado en Palermo,
          Belgrano, Recoleta, Villa Urquiza, Caballito, Flores o Mataderos, y
          ver en qué zona de la Ciudad se concentran los valores más altos y más
          bajos.
        </>
      }
      note={
        <>
          Son precios de <strong className="font-medium">publicación</strong>,
          no de escrituración: lo que se pide, no lo que se paga. La misma
          escala de colores se usa en los seis mapas, para que se puedan
          comparar entre sí. Fuente: IDECBA sobre la base de Argenprop, datos
          hasta el {LAST_UPDATED}
          {provisional ? " (provisorio)" : ""}.
        </>
      }
    >
      <MapaCaba
        // Not "…, por barrio": the map switches to comunas and the heading
        // can't follow it without contradicting itself half the time.
        title="Mapa comparativo del precio del m² en CABA"
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
        initial={{ size: DEFAULT_SIZE, geo: "barrios" }}
        views={views}
        breaks={[...BREAKS]}
        legend={LEGEND}
        noDataLabel={NO_DATA}
        dataDate={`Datos del ${LAST_UPDATED}${provisional ? " · dato provisorio" : ""}`}
        columns={{ region: "Barrio o comuna", value: "US$ por m²" }}
        ariaLabel={`Mapa de la Ciudad de Buenos Aires sombreado según el precio de publicación del metro cuadrado en venta. Los mismos valores están en la tabla que sigue.`}
      />
    </DataFigure>
  );
}

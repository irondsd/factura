import {
  averageArea,
  BREAKS,
  ciudad,
  ciudadUnits,
  DEFAULT_GEO,
  DEFAULT_SIZE,
  display,
  empty,
  formatM2,
  formatShare,
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
} from "@/content/estadisticas/data/oferta-alquiler-caba";
import { MapaCaba, type MapView } from "./MapaCaba";

// The map on /estadisticas/oferta-alquiler-caba: how many flats are actually
// advertised for rent in each barrio, by size.
//
// The server half of the figure, in the same split as the two price maps. It
// owns the <figure> shell, the caption and the source note, and turns the
// dataset into the eight plain views the interactive half draws — including
// every formatted string.
//
// What differs from `AlquilerCabaMapa`, and why:
//
//   • **there is no hatching.** Every barrio has a figure every month, because
//     a total is never suppressed. So the note under the map does the opposite
//     job to the price maps': instead of naming the barrios with no number, it
//     names the ones whose number is zero;
//   • **it opens on barrios**, since the coverage argument for opening on
//     comunas doesn't apply here;
//   • **the shading is a share and the printed figure is a count.** The reader
//     wants "how many flats", but a count cannot carry one scale across the
//     four size views — the reasoning is in `BREAKS` in the data module. So the
//     colour is the region's percentage of the city's offer, that percentage is
//     the table's second column so a colour can always be traced to a row, and
//     the two rank identically within any view.

const GEOS: {
  id: Geo;
  label: string;
  noun: string;
  article: string;
  /** Singular and plural of "has nothing advertised". */
  none: [string, string];
}[] = [
  {
    id: "barrios",
    label: "Barrios",
    noun: "barrios",
    article: "los",
    none: ["no tiene", "no tienen"],
  },
  {
    id: "comunas",
    label: "Comunas",
    noun: "comunas",
    article: "las",
    none: ["no tiene", "no tienen"],
  },
];

/** "Parque Chas y Versalles", "A, B y C" — a list as Spanish writes one. The
 * bare `join(", ")` this replaces produced "Parque Chas, Versalles no tienen",
 * which reads as a truncated list rather than a pair. */
const listOf = (items: string[]): string =>
  items.length < 2
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;

/** The line under the heading: the city's whole offer, then the two ends of the
 * range. Derived, never typed — the ranking moves month to month.
 *
 * The comma before each figure is doing real work at the bottom end, where the
 * figure is a phrase and not a number: "menos: Versalles, nada en oferta". */
function stat(geo: Geo, size: SizeId): string {
  const order = ranked(geo, size);
  const top = order[0];
  const bottom = order[order.length - 1];
  const figure = (units: number): string =>
    units < 0.5 ? "nada en oferta" : display(units);
  return [
    `En toda la Ciudad ${display(ciudadUnits(size))}`,
    top ? `más oferta: ${top.label}, ${figure(top.units)}` : null,
    bottom ? `menos: ${bottom.label}, ${figure(bottom.units)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The line explaining what the count was divided by, then how much of the map
 * is empty. Computed from the data and naming the regions it is about: a reader
 * whose barrio shows nothing deserves to see it said in words rather than
 * inferred from the palest shade on the ramp. */
function note(geo: Geo, size: SizeId): string {
  const { withOffer, total, none } = empty(geo, size);
  const { noun, article } = GEOS.find((g) => g.id === geo)!;
  const label = SIZES.find((s) => s.id === size)!;

  const scale =
    `El color muestra qué parte de toda la oferta de la Ciudad está en cada ${noun.replace(/s$/, "")}, para que los cuatro tamaños entren en una misma escala; ` +
    `la tabla muestra la cantidad. Esa cantidad es aproximada: IDECBA publica metros cuadrados avisados —${formatM2(ciudad(size))} en toda la Ciudad este mes— ` +
    `y aquí están divididos por la superficie promedio de un aviso del mes, ${averageArea(size).toLocaleString("es-AR")} m² para ${label.id === "total" ? "el conjunto del mercado" : label.label}.`;

  const cover = !none.length
    ? `${article[0].toUpperCase() + article.slice(1)} ${total} ${noun} tienen algo publicado este mes.`
    : `${withOffer} de ${article} ${total} ${noun} tienen algo publicado este mes. ` +
      `${listOf(none)} ${none.length === 1 ? "no tiene" : "no tienen"} ningún ${label.id === "total" ? "departamento" : `departamento de ${label.label}`} avisado, ` +
      `que es un dato y no un hueco: el color más claro del mapa incluye tanto lo que está vacío como lo que casi lo está.`;

  return `${scale} ${cover}`;
}

export function OfertaAlquilerCabaMapa() {
  const views: Record<string, MapView> = {};
  for (const size of SIZES) {
    for (const geo of GEOS) {
      views[`${size.id}-${geo.id}`] = {
        geo: geo.id,
        regions: rows(geo.id, size.id).map((r) => ({
          id: r.id,
          label: r.label,
          meta: r.meta,
          // Shaded and sorted by the share, printed as a count of flats.
          value: r.share,
          display: display(r.units),
          sub: formatShare(r.share),
        })),
        stat: stat(geo.id, size.id),
        note: note(geo.id, size.id),
      };
    }
  }

  const provisional = PROVISIONAL.has(LAST_PERIOD);

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <MapaCaba
        title="Mapa de la oferta de alquiler en CABA"
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
        dataDate={`Datos de ${LAST_UPDATED}${provisional ? " · dato provisorio" : ""}`}
        columns={{
          region: "Barrio o comuna",
          value: "Departamentos en oferta",
          sub: "De la Ciudad",
        }}
        ariaLabel="Mapa de la Ciudad de Buenos Aires sombreado según la cantidad de departamentos publicados en alquiler en cada barrio. Los mismos valores están en la tabla que sigue."
      />

      <figcaption className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Cantidad aproximada de departamentos publicados en alquiler en la Ciudad
        de Buenos Aires, por barrio y por comuna, según la superficie total
        avisada que releva IDECBA. Permite ver dónde hay oferta para elegir —
        Palermo, Belgrano, Recoleta, Villa Urquiza, Caballito, Flores — y en qué
        barrios prácticamente no se publica nada.
      </figcaption>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        Es la <strong className="font-medium">oferta publicada</strong> del mes,
        no el parque de viviendas: cuenta los avisos vigentes cuya fecha de
        publicación cae en el mes de referencia, así que un departamento que se
        alquila rápido pasa por esta serie una sola vez. El universo son
        departamentos usados y a estrenar, algo más amplio que el de las páginas
        de precios, que cuentan solo usados. Fuente: IDECBA sobre la base de
        Argenprop, datos hasta {LAST_UPDATED}
        {provisional ? " (provisorio)" : ""}.
      </p>
    </figure>
  );
}

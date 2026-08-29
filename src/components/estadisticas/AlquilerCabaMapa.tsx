import { DataFigure } from "@/components/figures/DataFigure";
import {
  BREAKS,
  ciudad,
  ciudadPerMetre,
  coverage,
  DEFAULT_GEO,
  DEFAULT_SIZE,
  display,
  displayPerMetre,
  formatArs,
  formatArsPerMetre,
  type Geo,
  LAST_PERIOD,
  LAST_UPDATED,
  LEGEND,
  NO_DATA,
  PROVISIONAL,
  ranked,
  REFERENCE_AREA,
  rows,
  type SizeId,
  SIZES,
} from "@/content/estadisticas/data/alquiler-caba";
import { MapaCaba, type MapView } from "@/components/maps/MapaCaba";

// The map on /estadisticas/alquiler-caba: asking rent in pesos a month, by
// barrio or comuna, for 1/2/3-ambiente used apartments.
//
// The server half of the figure, in the same split as the sale map and the
// charts. It owns the <figure> shell, the caption and the source note, and
// turns the dataset into the six plain views the interactive half draws —
// including every formatted string.
//
// Two things differ from `VentaCabaMapa`, both because rent is published
// differently rather than because the pages disagree:
//
//   • the shading is per m² while the printed figure is per month. The reason
//     is in the data module's header; the note under the map says so in one
//     line, because a legend in one unit over a table in another has to be
//     explained where it is seen and not only in the prose;
//   • it opens on comunas. Rent is withheld for a third of the barrios, and a
//     map that opens full of holes misrepresents a dataset that is fine.

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
  return [
    city === null ? null : `Promedio de la Ciudad ${formatArs(city)} por mes`,
    top ? `Máximo ${top.label} ${formatArs(top.monthly)}` : null,
    bottom ? `Mínimo ${bottom.label} ${formatArs(bottom.monthly)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The coverage sentence, plus the one line explaining the unit the colour is
 * in. Computed from the data and naming the regions it is about: on this page
 * a third of the barrios can be missing, and a reader who can't find theirs
 * deserves to see it listed rather than be told "algunos". */
function note(geo: Geo, size: SizeId): string {
  const { withData, total, missing } = coverage(geo, size);
  const { noun, article, striped } = GEOS.find((g) => g.id === geo)!;
  const capitalised = article[0].toUpperCase() + article.slice(1);
  const scale =
    `El color muestra el alquiler por m² —el precio mensual dividido por la superficie de referencia que usa IDECBA, ` +
    `${REFERENCE_AREA[size]} m² para ${SIZES.find((s) => s.id === size)!.label}— para que los tres tamaños entren en una misma escala. ` +
    `La tabla muestra el alquiler del mes.`;
  const cover = !missing.length
    ? `${capitalised} ${total} ${noun} tienen precio publicado en este trimestre.`
    : `${withData} de ${article} ${total} ${noun} tienen precio publicado en este trimestre. ` +
      `IDECBA no publica un promedio donde hubo muy pocos avisos, así que ${missing.join(", ")} ` +
      `${missing.length === 1 ? striped[0] : striped[1]} en el mapa. ` +
      `Rayado quiere decir sin dato publicado, no barato.`;
  return `${scale} ${cover}`;
}

export function AlquilerCabaMapa() {
  const views: Record<string, MapView> = {};
  for (const size of SIZES) {
    for (const geo of GEOS) {
      views[`${size.id}-${geo.id}`] = {
        geo: geo.id,
        regions: rows(geo.id, size.id).map((r) => ({
          id: r.id,
          label: r.label,
          meta: r.meta,
          // Shaded and sorted by the metre; printed by the month.
          value: r.perMetre,
          display: display(r.monthly),
          sub: displayPerMetre(r.perMetre),
        })),
        stat: stat(geo.id, size.id),
        note: note(geo.id, size.id),
      };
    }
  }

  const provisional = PROVISIONAL.has(LAST_PERIOD);
  const cityPerMetre = ciudadPerMetre(DEFAULT_SIZE);

  return (
    <DataFigure
      caption={
        <>
          Precio de publicación de los alquileres de departamentos usados en la
          Ciudad de Buenos Aires, en pesos por mes, por barrio y por comuna.
          Permite comparar cuánto sale alquilar en Palermo, Belgrano, Recoleta,
          Villa Urquiza, Caballito, Flores o Mataderos, y ver en qué zona de la
          Ciudad se concentran los alquileres más caros y más baratos.
        </>
      }
      note={
        <>
          Son precios de <strong className="font-medium">publicación</strong>,
          no de contratos firmados: lo que se pide, no lo que se termina
          pagando. Están en pesos corrientes de cada trimestre, así que dos
          trimestres distintos no se comparan sin descontar la inflación.
          {cityPerMetre === null
            ? ""
            : ` En el promedio de la Ciudad, un ${SIZES.find((s) => s.id === DEFAULT_SIZE)!.label} equivale a ${formatArsPerMetre(cityPerMetre)}.`}{" "}
          Fuente: IDECBA sobre la base de Argenprop, datos hasta el{" "}
          {LAST_UPDATED}
          {provisional ? " (provisorio)" : ""}.
        </>
      }
    >
      <MapaCaba
        title="Mapa comparativo del alquiler en CABA"
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
          value: "Alquiler por mes",
          sub: "Por m²",
        }}
        ariaLabel="Mapa de la Ciudad de Buenos Aires sombreado según el precio de publicación de los alquileres. Los mismos valores están en la tabla que sigue."
      />
    </DataFigure>
  );
}

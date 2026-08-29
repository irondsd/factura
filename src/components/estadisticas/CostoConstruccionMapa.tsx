import { DataFigure } from "@/components/figures/DataFigure";
import {
  BREAKS,
  ciudadShare,
  DEFAULT_SIZE,
  displayShare,
  formatUsd,
  type Geo,
  JOIN_PERIOD,
  LEGEND,
  NO_DATA,
  quarterLabel,
  rankedShare,
  shareCoverage,
  shareRows,
  type SizeId,
  SIZES,
} from "@/content/estadisticas/data/costo-construccion-caba";
import { MapaCaba, type MapView } from "@/components/maps/MapaCaba";

// The one cut of this dataset that is per-barrio — and it is a derived one, for
// a reason the figure's own note states rather than hides.
//
// The cost of construction is a single figure for the whole city: IDECBA prices
// one basket, not forty-eight. So nothing here varies by barrio on its own. What
// varies is the price a finished flat sells for, and setting the two against
// each other answers the question the city-wide number leaves open — how much of
// what you pay for a square metre in *your* barrio is the building itself, and
// how much is everything else.
//
// "Everything else" is not a residual we invented: it is precisely the list
// IDECBA's figure excludes — the land, the professional fees, the building
// rights, the taxes, the financing and the developer's margin. That is what
// makes the subtraction mean something instead of being arithmetic for its own
// sake.
//
// ── What this map cannot do, and where that is said ────────────────────────
// Dividing 43 asking prices by one constant cannot reorder them, so this map
// ranks the barrios in exactly the same order as the price map on
// /estadisticas/precio-m2-caba. A reader who has seen both deserves to be told
// why they are the same shape, so `note()` says it outright. The map still earns
// its place: the reader looking up their own barrio is not ranking anything, and
// the *values* answer a question the price map never asks.

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

/** The line under the heading. Derived, never typed — the ranking flips between
 * refreshes and the city average moves every quarter. */
function stat(geo: Geo, size: SizeId): string {
  const city = ciudadShare(size);
  const order = rankedShare(geo, size);
  const most = order[0];
  const least = order[order.length - 1];
  return [
    city &&
      `Promedio de la Ciudad ${Math.round(city.share)} % · quedan ${formatUsd(city.surplus)}/m² para el terreno y todo lo demás`,
    most && `Máximo ${most.label} ${Math.round(most.value)} %`,
    least && `Mínimo ${least.label} ${Math.round(least.value)} %`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The note under the figure. Two caveats, and both are load-bearing: which
 * regions couldn't be shaded, and why this map has the same shape as the price
 * map. Computed from the data and naming the regions, rather than saying
 * "algunos" — a reader who can't find their barrio deserves to see it listed. */
function note(geo: Geo, size: SizeId): string {
  const { withData, total, missing } = shareCoverage(geo, size);
  const { noun, article, striped } = GEOS.find((g) => g.id === geo)!;
  const capitalised = article[0].toUpperCase() + article.slice(1);

  const coverage = missing.length
    ? `${withData} de ${article} ${total} ${noun} tienen precio de venta publicado en este trimestre. ` +
      `IDECBA no publica un promedio donde hubo muy pocos avisos, así que ${missing.join(", ")} ` +
      `${missing.length === 1 ? striped[0] : striped[1]}. Rayado quiere decir sin precio publicado, no barato.`
    : `${capitalised} ${total} ${noun} tienen precio de venta publicado en este trimestre.`;

  return (
    `${coverage} El costo de construcción es uno solo para toda la Ciudad, así que este mapa ordena ` +
    `los ${noun} igual que el mapa del precio de venta: lo que cambia acá no es el orden sino cuánto ` +
    `de cada precio es obra y cuánto es ubicación.`
  );
}

export function CostoConstruccionMapa() {
  // The three series behind this join are refreshed on three different
  // cadences, and there is no honest map until all three cover a common
  // quarter. Rendering nothing beats rendering a stale pairing.
  if (JOIN_PERIOD === null) return null;

  const views: Record<string, MapView> = {};
  for (const size of SIZES) {
    for (const geo of GEOS) {
      views[`${size.id}-${geo.id}`] = {
        geo: geo.id,
        regions: shareRows(geo.id, size.id).map((r) => ({
          id: r.id,
          label: r.label,
          meta: r.meta,
          value: r.value,
          display: displayShare(r.value),
          sub: r.surplus === null ? null : `${formatUsd(r.surplus)}/m²`,
        })),
        stat: stat(geo.id, size.id),
        note: note(geo.id, size.id),
      };
    }
  }

  return (
    <DataFigure
      caption={
        <>
          En cada barrio, qué parte del precio de publicación del metro cuadrado
          se explica por el costo de construirlo. Cuanto más oscuro, más de lo
          que se paga es la obra en sí; cuanto más claro, más se está pagando
          por el terreno y la ubicación. La segunda columna es lo que queda por
          metro cuadrado una vez descontada la construcción.
        </>
      }
      note={
        <>
          Es una cuenta nuestra, no un dato que publique IDECBA: el costo de
          construcción del trimestre —convertido a dólares al promedio del dólar
          blue— dividido por el precio de publicación del metro cuadrado de
          departamentos usados de cada barrio, del mismo trimestre y del mismo
          organismo. Lo que queda no es ganancia: adentro están el terreno, los
          honorarios, los derechos de construcción, los impuestos, el
          financiamiento y el margen del desarrollador, además de que un
          departamento usado no es uno a estrenar. No es un cálculo de
          rentabilidad de obra. Datos del {quarterLabel(JOIN_PERIOD)}.
        </>
      }
    >
      <MapaCaba
        title="Cuánto del precio de un departamento es costo de construcción"
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
        dataDate={`Datos del ${quarterLabel(JOIN_PERIOD)}`}
        columns={{
          region: "Barrio o comuna",
          value: "% que es obra",
          sub: "Queda para el terreno",
        }}
        ariaLabel="Mapa de la Ciudad de Buenos Aires sombreado según qué porcentaje del precio de publicación del metro cuadrado corresponde al costo de construcción. Los mismos valores están en la tabla que sigue."
      />
    </DataFigure>
  );
}

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

// A derived comparison by barrio: one citywide modeled direct construction cost
// divided by each barrio's asking price for used apartments. The resulting
// percentage ranks inversely to the asking-price map and does not allocate the
// price among land, construction, location or other costs.

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
      `Ciudad ${Math.round(city.share)} % · diferencia aritmética ${formatUsd(city.difference)}/m²`,
    most && `Máximo ${most.label} ${Math.round(most.value)} %`,
    least && `Mínimo ${least.label} ${Math.round(least.value)} %`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** State price-data coverage for the current map selection. */
function note(geo: Geo, size: SizeId): string {
  const { withData, total, missing } = shareCoverage(geo, size);
  const { noun, article, striped } = GEOS.find((g) => g.id === geo)!;
  const capitalised = article[0].toUpperCase() + article.slice(1);

  const coverage = missing.length
    ? `${withData} de ${article} ${total} ${noun} tienen precio de venta publicado en este trimestre. ` +
      `IDECBA no publica un promedio donde hubo muy pocos avisos, así que ${missing.join(", ")} ` +
      `${missing.length === 1 ? striped[0] : striped[1]}. Rayado quiere decir sin precio publicado, no barato.`
    : `${capitalised} ${total} ${noun} tienen precio de venta publicado en este trimestre.`;

  return coverage;
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
          sub: r.difference === null ? null : `${formatUsd(r.difference)}/m²`,
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
          El color muestra el costo directo del edificio modelo dividido por el
          precio publicado de cada barrio. Como el costo es el mismo en toda la
          Ciudad, el porcentaje se ordena al revés que el precio: a mayor precio,
          menor proporción. La segunda cifra es la diferencia aritmética entre
          ambos valores.
        </>
      }
      note={
        <>
          La comparación usa el costo directo de los modelos de IDECBA convertido
          con el promedio trimestral del blue y sus precios publicados para
          departamentos usados en el mismo trimestre. Son referencias distintas;
          no desglosan el precio ni miden la rentabilidad de una obra.
        </>
      }
    >
      <MapaCaba
        title="Costo directo modelo / precio publicado"
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
          value: "% costo / precio",
          sub: "Diferencia aritmética",
        }}
        ariaLabel="Mapa de la Ciudad de Buenos Aires sombreado según el porcentaje resultante de dividir el costo directo de un edificio modelo por el precio de publicación del metro cuadrado de departamentos usados. Los mismos valores están en la tabla que sigue."
      />
    </DataFigure>
  );
}

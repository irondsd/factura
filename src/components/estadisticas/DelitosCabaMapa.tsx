import {
  BREAKS,
  CATEGORIES,
  type CategoryId,
  cityCount,
  cityRate,
  DEFAULT_CATEGORY,
  ESTIMATE_WEAKEST,
  formatCount,
  formatRate,
  formatRateBare,
  formatRateShort,
  formatRatio,
  type Geo,
  LAST_YEAR,
  LEGEND,
  NO_DATA,
  ranked,
  rows,
  SOURCE,
  unplaced,
} from "@/content/estadisticas/data/delitos-caba";
import { MapaCaba, type MapView } from "@/components/maps/MapaCaba";
import { BARRIOS, COMUNA_IDS } from "@/content/shared/caba";

// The map on /estadisticas/delitos-caba: recorded crimes per 1.000 residents,
// by barrio or comuna, for four cuts of the offence taxonomy.
//
// The server half of the figure, in the same split as the other maps (see
// VentaCabaMapa.tsx). It owns the <figure> shell, the caption and the source
// note, and it turns the dataset into the eight plain views the interactive half
// draws — including every formatted string, so that component never has to know
// these are crimes rather than dollars.
//
// ── Why the shading is a multiple and the label is a rate ─────────────────
// The map shades by each region's rate as a multiple of the city's, and prints
// the rate itself. One scale then serves all four categories: the city records
// about 39 crimes per 1.000 residents a year and only 7 delitos contra las
// personas, so breaks chosen for the first would paint the fourth map one flat
// colour. Within a view the two rank identically, so the colour never
// contradicts the figure beside it. The reasoning lives in the data module, on
// `Row.ratio`.
//
// An .mdx page places it with a bare <DelitosCabaMapa /> and nothing else.

// `article` and `striped` are separate fields rather than one templated noun for
// the same reason as the price maps: Spanish makes you choose between "los 48
// barrios" and "las 15 comunas", and a template with one gender gets one of the
// two maps wrong in every sentence it builds.
const GEOS: {
  id: Geo;
  label: string;
  noun: string;
  article: string;
  total: number;
}[] = [
  {
    id: "barrios",
    label: "Barrios",
    noun: "barrios",
    article: "los",
    total: BARRIOS.length,
  },
  {
    id: "comunas",
    label: "Comunas",
    noun: "comunas",
    article: "las",
    total: COMUNA_IDS.length,
  },
];

/** The line under the heading: the city rate, then the two ends of the range.
 * Derived, never typed — the ranking moves with every refresh. */
function stat(geo: Geo, category: CategoryId): string {
  const order = ranked(geo, category);
  const top = order[0];
  const bottom = order[order.length - 1];
  // The unit is spelled out once, on the city figure, and the two extremes
  // beside it are bare: three repetitions of "cada 1.000 hab." in one line is
  // most of the line.
  return [
    `Ciudad ${formatRate(cityRate(category))}`,
    `Máximo ${top.label} ${formatRateBare(top.rate)} (${formatRatio(top.ratio)})`,
    `Mínimo ${bottom.label} ${formatRateBare(bottom.rate)} (${formatRatio(bottom.ratio)})`,
  ].join(" · ");
}

/**
 * The note under the figure — the caveats that cannot wait for the methodology
 * section, in the order they bite.
 *
 * Unlike the price maps, this one is never short of data: a count is never
 * suppressed, so all 48 barrios are always shaded. What the reader needs
 * instead is the two things that make a shaded barrio mean less than it looks
 * like: the events the source could not place anywhere, and the fact that the
 * denominator is residents in a city where a third of the map is offices.
 */
function note(geo: Geo, category: CategoryId): string {
  const { noun, article, total } = GEOS.find((g) => g.id === geo)!;
  const lost = unplaced(category);
  const pct = (lost / cityCount(category)) * 100;
  return (
    `${article[0].toUpperCase()}${article.slice(1)} ${total} ${noun} están sombreados: ` +
    `un hecho registrado nunca se publica en blanco, así que este mapa no tiene huecos. ` +
    `Quedan afuera ${formatCount(lost)} hechos —el ${ONE_DP.format(pct)} %— que la fuente no pudo ubicar en ningún barrio. ` +
    `El divisor son los residentes censados, y en el microcentro eso exagera la tasa: ` +
    `ahí la mayoría de las personas que están de día no viven ahí.`
  );
}

const ONE_DP = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** The barrios whose estimated population the data module flags as weakest, by
 * their display name, for the sentence in the source note. */
const WEAKEST = ESTIMATE_WEAKEST.map(
  (id) => BARRIOS.find((b) => b.id === id)!.label,
).join(", ");

export function DelitosCabaMapa() {
  const views: Record<string, MapView> = {};
  for (const category of CATEGORIES) {
    for (const geo of GEOS) {
      views[`${category.id}-${geo.id}`] = {
        geo: geo.id,
        regions: rows(geo.id, category.id).map((r) => ({
          id: r.id,
          label: r.label,
          meta: r.meta,
          value: r.ratio,
          display: formatRateShort(r.rate),
          // Bare, with the noun in the column header: the table already carries
          // the longest region label in the section ("Puerto Madero · Comuna 1")
          // and a rate with its unit, and on a 375 px screen "4.289 hechos" in a
          // third column is what tips the row into a horizontal scroll.
          sub: formatCount(r.count),
        })),
        stat: stat(geo.id, category.id),
        note: note(geo.id, category.id),
      };
    }
  }

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <MapaCaba
        title="Mapa del delito en CABA, por barrio y por comuna"
        dimensions={[
          {
            name: "categoria",
            label: "Tipo de delito",
            options: CATEGORIES.map((c) => ({ value: c.id, label: c.short })),
          },
          {
            name: "geo",
            label: "Nivel del mapa",
            options: GEOS.map((g) => ({ value: g.id, label: g.label })),
          },
        ]}
        initial={{ categoria: DEFAULT_CATEGORY, geo: "barrios" }}
        views={views}
        breaks={[...BREAKS]}
        legend={LEGEND}
        noDataLabel={NO_DATA}
        dataDate={`Datos de ${LAST_YEAR} · el color es la tasa del barrio dividida por la de la Ciudad`}
        columns={{
          region: "Barrio o comuna",
          value: "Tasa anual",
          sub: "Hechos",
        }}
        ariaLabel="Mapa de la Ciudad de Buenos Aires sombreado según los delitos registrados cada 1.000 habitantes, comparados con el promedio de la Ciudad. Los mismos valores están en la tabla que sigue."
      />

      <figcaption className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Delitos registrados cada 1.000 habitantes por año en la Ciudad de Buenos
        Aires, por barrio y por comuna. Permite comparar la tasa de Palermo,
        Belgrano, Recoleta, Caballito, Flores, Villa Lugano o San Nicolás, y ver
        en qué zona de la Ciudad se concentran los robos, los hurtos y los
        delitos contra las personas.
      </figcaption>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        Son <strong className="font-medium">hechos registrados</strong>: lo que
        llegó a una denuncia o a una actuación policial o judicial, no lo que
        ocurrió. La población es la del Censo 2022: exacta por comuna, y por
        barrio estimada repartiendo cada comuna según el censo de 2010. Donde
        esa estimación es más floja es en {WEAKEST}, que en 2010 casi no tenía
        habitantes y desde entonces creció mucho más que el resto de su comuna:
        su tasa aquí queda sobreestimada. Fuente: {SOURCE}, datos de {LAST_YEAR}
        .
      </p>
    </figure>
  );
}

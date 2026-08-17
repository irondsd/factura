import { MapaCaba, type MapView } from "@/components/estadisticas/MapaCaba";
import { BARRIOS, COMUNA_IDS } from "@/content/estadisticas/data/caba";
import {
  BREAKS,
  coverage,
  CRIME_YEAR,
  DEFAULT_GEO,
  DEFAULT_PRIORITY,
  DEFAULT_SIZE,
  formatArsPerMetre,
  formatScore,
  type Geo,
  LEGEND,
  NO_DATA,
  PRIORITIES,
  ranked,
  RENT_PERIOD_LABEL,
  rows,
  SIZES,
} from "@/content/investigacion/data/alquiler-seguridad";

// The page's main figure: the city shaded by how well each region does on both
// counts at once, with the weighting between them in the reader's hands.
//
// The server half, in the same split as every map in /estadisticas (see
// VentaCabaMapa.tsx) — it owns the <figure> shell, the caption and the source
// note, and turns the join into six plain views the interactive half draws,
// including every formatted string. `MapaCaba` itself is imported from the
// statistics section rather than copied: it knows the city's geometry and
// nothing about what is being measured, which is exactly what makes it reusable
// here.
//
// ── Why the weighting is a control and not a decision ─────────────────────
// Every combined index picks a weight, and picking one silently is the way a
// preference gets published as a finding. The three settings are quarters, so
// the reader can say what they chose, and the map redraws under each — which
// also shows how much (and how little) the answer actually moves.
//
// ── Why dark is good here ─────────────────────────────────────────────────
// Every other map on this site shades dark for *more* of a cost. This one
// shades dark for a higher score, which is the better place to look. The
// inversion is unavoidable — a score is not a cost — so it is stated in the
// legend, in the line under the map and in the prose.
//
// An .mdx page places it with a bare <PrecioSeguridadMapa /> and nothing else.

// `article`, `noun` and `striped` are written out per geography rather than
// templated for the same reason as the price maps, and then one reason more.
// Spanish makes you choose between "los 48 barrios" and "las 15 comunas", so a
// template with one gender gets one of the two maps wrong in every sentence it
// builds — and the sentence about the regions with no price has to agree in
// *number* as well, because at comuna level there is usually exactly one of
// them. Both agreements live in `striped`, which is a whole clause and not a
// word, precisely so neither can be got half right.
const GEOS: {
  id: Geo;
  label: string;
  noun: string;
  article: string;
  striped: (n: number) => string;
  total: number;
}[] = [
  {
    id: "barrios",
    label: "Barrios",
    noun: "barrios",
    article: "los",
    striped: (n) =>
      n === 1
        ? "1 barrio queda rayado porque no tiene un alquiler publicado"
        : `${n} barrios quedan rayados porque no tienen un alquiler publicado`,
    total: BARRIOS.length,
  },
  {
    id: "comunas",
    label: "Comunas",
    noun: "comunas",
    article: "las",
    striped: (n) =>
      n === 1
        ? "1 comuna queda rayada porque no tiene un alquiler publicado"
        : `${n} comunas quedan rayadas porque no tienen un alquiler publicado`,
    total: COMUNA_IDS.length,
  },
];

const SIZE = SIZES.find((s) => s.id === DEFAULT_SIZE)!;

/** The line under the heading: the two ends of the ranking under this cut.
 * Derived, never typed — the ordering moves with every refresh. */
function stat(geo: Geo, weight: number): string {
  const order = ranked(geo, DEFAULT_SIZE, "total", weight);
  const best = order[0];
  const worst = order[order.length - 1];
  return [
    `Mejor ${best.label} ${formatScore(best.score)}/100`,
    `(${formatArsPerMetre(best.rentPerMetre)}, barato ${formatScore(best.cheap)} · seguro ${formatScore(best.safe)})`,
    `· Peor ${worst.label} ${formatScore(worst.score)}/100`,
  ].join(" ");
}

/** The note under the figure — the caveats that cannot wait for the methodology
 * section, in the order they bite: which way the colour runs, how much of the
 * map is missing, and that the two halves are from two different moments. */
function note(geo: Geo): string {
  const { noun, article, striped, total } = GEOS.find((g) => g.id === geo)!;
  const cov = coverage(geo);
  const missing = cov.missing.length;
  // The "and several of them are among the calmest" line is only true at barrio
  // level, where the withheld set really does include some of the quietest
  // places in the city. Derived rather than asserted, so switching to comunas —
  // where the one region without a price is nothing of the sort — cannot make
  // the map claim it anyway.
  const quiet = cov.missing.filter(
    (m) => m.safetyRank <= Math.ceil(cov.total / 4),
  ).length;
  return (
    `Cuanto más oscuro, mejor puntaje: al revés que en los mapas de precios de este sitio. ` +
    `Se pueden puntuar ${cov.withData} de ${article} ${total} ${noun}` +
    (missing === 0
      ? ". "
      : `; ${striped(missing)}` +
        (quiet > 0
          ? `, y ${quiet === 1 ? "está" : "varios están"} entre ${article} más tranquil${article === "los" ? "os" : "as"} de la Ciudad. `
          : ". ")) +
    `El alquiler es del ${RENT_PERIOD_LABEL} y los delitos son de ${CRIME_YEAR}: la comparación es de posiciones, que no cambian dentro de un año, no de un instante.`
  );
}

export function PrecioSeguridadMapa() {
  const views: Record<string, MapView> = {};
  for (const priority of PRIORITIES) {
    for (const geo of GEOS) {
      views[`${priority.id}-${geo.id}`] = {
        geo: geo.id,
        regions: rows(geo.id, DEFAULT_SIZE, "total", priority.weight).map(
          (r) => ({
            id: r.id,
            label: r.label,
            meta: r.meta,
            value: r.score,
            display: r.score === null ? null : `${formatScore(r.score)}/100`,
            // The price, not the crime rate: it is the half a reader is likely
            // to be checking against a listing they already have open, and the
            // table below has room for exactly one extra column on a phone.
            // The full breakdown is the ranking table further down.
            sub:
              r.rentPerMetre === null
                ? null
                : formatArsPerMetre(r.rentPerMetre),
          }),
        ),
        stat: stat(geo.id, priority.weight),
        note: note(geo.id),
      };
    }
  }

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <MapaCaba
        title="Dónde conviene alquilar según precio y delitos"
        dimensions={[
          {
            name: "prioridad",
            label: "Qué pesa más",
            options: PRIORITIES.map((p) => ({ value: p.id, label: p.short })),
          },
          {
            name: "geo",
            label: "Nivel del mapa",
            options: GEOS.map((g) => ({ value: g.id, label: g.label })),
          },
        ]}
        initial={{ prioridad: DEFAULT_PRIORITY, geo: DEFAULT_GEO }}
        views={views}
        breaks={[...BREAKS]}
        legend={LEGEND}
        noDataLabel={NO_DATA}
        dataDate={`Alquiler del ${RENT_PERIOD_LABEL} y delitos de ${CRIME_YEAR} · el color es el puntaje combinado, de 0 a 100`}
        columns={{
          region: "Barrio o comuna",
          value: "Puntaje",
          sub: `Alquiler ${SIZE.short}`,
        }}
        ariaLabel="Mapa de la Ciudad de Buenos Aires sombreado según un puntaje que combina la posición de cada barrio en alquiler pedido por metro cuadrado y en delitos registrados por habitante. Los mismos valores están en la tabla que sigue."
      />

      <figcaption className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Puntaje combinado de alquiler y delitos registrados en los barrios y
        comunas de la Ciudad de Buenos Aires. Un barrio con 100 sería a la vez
        el más barato y el más tranquilo de los que se pueden comparar; uno con
        0, el más caro y el que más hechos registra. Permite ver dónde se juntan
        las dos cosas —el oeste residencial, Caballito, el eje de Flores— y
        dónde cada una va por su lado.
      </figcaption>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        El puntaje es el promedio ponderado de dos posiciones percentiles, no de
        dos valores: 100 es el extremo bueno{" "}
        <strong className="font-medium">entre los barrios comparados</strong>,
        no un absoluto. Dos barrios separados por veinte puntos pueden estar a
        unos cientos de pesos y a medio hecho cada 1.000 habitantes de
        distancia, así que conviene mirar siempre las cifras al lado del color.
        El alquiler es el pedido en avisos para un departamento de {SIZE.label};
        los delitos son hechos registrados cada 1.000 residentes censados, lo
        que sobreestima al microcentro, donde la mayoría de las personas que
        están de día no viven ahí.
      </p>
    </figure>
  );
}

import { Fragment } from "react";
import {
  CRIME_YEAR,
  DEFAULT_PRIORITY,
  DEFAULT_SIZE,
  formatArs,
  formatArsPerMetre,
  formatRate,
  formatScore,
  PRIORITIES,
  ranked,
  RENT_PERIOD_LABEL,
  SIZES,
  weightOf,
} from "@/content/investigacion/data/alquiler-seguridad";

// The two ends of the ranking with their working shown: the price position, the
// safety position and the two levels behind them, so a reader can see *why* a
// barrio is where it is instead of taking the score on trust.
//
// Both ends rather than a top ten, for the reason `DelitosResidentes` shows
// both: a ranking with only its winners is a recommendation, and the bottom
// rows are what make the top ones mean something. They also carry the page's
// second-most-useful reading — the barrios that score badly are almost never
// bad on both counts, they are expensive *or* busy, and the columns say which.
//
// The map above already lists every region with its score; this figure is the
// reading, not the lookup.

const SIZE = SIZES.find((s) => s.id === DEFAULT_SIZE)!;
const PRIORITY = PRIORITIES.find((p) => p.id === DEFAULT_PRIORITY)!;

/** How many rows at each end. Enough to make the pattern obvious, few enough
 * that the figure stays a figure rather than a second table. */
const TOP = 10;
const BOTTOM = 5;

export function PrecioSeguridadRanking() {
  const order = ranked("barrios", DEFAULT_SIZE, "total", weightOf(DEFAULT_PRIORITY)); // prettier-ignore
  const rank = new Map(order.map((r, i) => [r.id, i + 1]));

  const groups = [
    { key: "top", label: "Los mejor ubicados", rows: order.slice(0, TOP) },
    {
      key: "bottom",
      label: "Los peor ubicados",
      rows: order.slice(-BOTTOM),
    },
  ];

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          El ranking, con el cálculo a la vista
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          {order.length} barrios comparables · {SIZE.label} ·{" "}
          {PRIORITY.label.toLowerCase()} · alquiler del {RENT_PERIOD_LABEL},
          delitos de {CRIME_YEAR}
        </p>
      </figcaption>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="fd-th">Barrio</th>
              <th className="fd-th text-right pl-3">Alquiler</th>
              <th className="fd-th text-right pl-3">Delitos</th>
              <th className="fd-th text-right pl-3">Barato</th>
              <th className="fd-th text-right pl-3">Seguro</th>
              <th className="fd-th text-right pl-3">Puntaje</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group.key}>
                <tr>
                  <td
                    colSpan={6}
                    className="font-mono text-micro uppercase tracking-label-wide text-muted pt-4 pb-1"
                  >
                    {group.label}
                  </td>
                </tr>
                {group.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="fd-td">
                      <span className="text-muted">{rank.get(r.id)}. </span>
                      <span className="text-ink">{r.label}</span>
                      <span className="text-muted"> · {r.meta}</span>
                    </td>
                    <td className="fd-td text-right pl-3 text-ink/90 tabular-nums whitespace-nowrap">
                      {formatArs(r.rentMonthly)}
                      <span className="block text-muted">
                        {formatArsPerMetre(r.rentPerMetre)}
                      </span>
                    </td>
                    <td className="fd-td text-right pl-3 text-ink/90 tabular-nums whitespace-nowrap">
                      {formatRate(r.crimeRate)}
                    </td>
                    <td className="fd-td text-right pl-3 text-muted tabular-nums whitespace-nowrap">
                      {formatScore(r.cheap)}
                    </td>
                    <td className="fd-td text-right pl-3 text-muted tabular-nums whitespace-nowrap">
                      {formatScore(r.safe)}
                    </td>
                    <td className="fd-td text-right pl-3 text-ink tabular-nums whitespace-nowrap">
                      {formatScore(r.score)}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Las dos columnas del medio son las posiciones, de 0 a 100, entre los{" "}
        {order.length} barrios comparados: «barato» alto significa que casi
        todos los demás son más caros, «seguro» alto que casi todos registran
        más hechos. El puntaje es su promedio ponderado. Un barrio puede llegar
        arriba por dos caminos distintos —barato y del montón en delitos, o
        tranquilo y del montón en precio— y la tabla deja ver cuál es cuál.
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        El alquiler es el pedido en avisos para un departamento de{" "}
        {SIZE.label.toLowerCase()}, con la cifra mensual arriba y la misma cifra
        por metro cuadrado debajo; el orden se calcula sobre la segunda, que es
        la que se puede comparar entre tamaños. Los delitos son hechos
        registrados cada 1.000 residentes censados: en los barrios del
        microcentro esa tasa está inflada por la gente que va sin vivir ahí, y
        es por eso que los últimos puestos son casi todos del centro.
      </p>
    </figure>
  );
}

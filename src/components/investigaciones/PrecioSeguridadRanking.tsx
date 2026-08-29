import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
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
} from "@/content/investigaciones/data/alquiler-seguridad";

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
    <DataFigure
      header={{
        title: <>El ranking, con el cálculo a la vista</>,
        subtitle: (
          <>
            {order.length} barrios comparables · {SIZE.label} ·{" "}
            {PRIORITY.label.toLowerCase()} · alquiler del {RENT_PERIOD_LABEL},
            delitos de {CRIME_YEAR}
          </>
        ),
      }}
      caption={
        <>
          Las dos columnas del medio son las posiciones, de 0 a 100, entre los{" "}
          {order.length} barrios comparados: «barato» alto significa que casi
          todos los demás son más caros, «seguro» alto que casi todos registran
          más hechos. El puntaje es su promedio ponderado. Un barrio puede
          llegar arriba por dos caminos distintos —barato y del montón en
          delitos, o tranquilo y del montón en precio— y la tabla deja ver cuál
          es cuál.
        </>
      }
      note={
        <>
          El alquiler es el pedido en avisos para un departamento de{" "}
          {SIZE.label.toLowerCase()}, con la cifra mensual arriba y la misma
          cifra por metro cuadrado debajo; el orden se calcula sobre la segunda,
          que es la que se puede comparar entre tamaños. Los delitos son hechos
          registrados cada 1.000 residentes censados: en los barrios del
          microcentro esa tasa está inflada por la gente que va sin vivir ahí, y
          es por eso que los últimos puestos son casi todos del centro.
        </>
      }
    >
      <div className="overflow-x-auto">
        <DataTable
          groups={groups}
          rowKey={(r) => r.id}
          columns={[
            {
              header: "Barrio",
              cell: (r) => (
                <>
                  <span className="text-muted">{rank.get(r.id)}. </span>
                  <span className="text-ink">{r.label}</span>
                  <span className="text-muted"> · {r.meta}</span>
                </>
              ),
            },
            {
              header: "Alquiler",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-ink/90",
              cell: (r) => (
                <>
                  {formatArs(r.rentMonthly)}
                  <span className="block text-muted">
                    {formatArsPerMetre(r.rentPerMetre)}
                  </span>
                </>
              ),
            },
            {
              header: "Delitos",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-ink/90",
              cell: (r) => formatRate(r.crimeRate),
            },
            {
              header: "Barato",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-muted",
              cell: (r) => formatScore(r.cheap),
            },
            {
              header: "Seguro",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-muted",
              cell: (r) => formatScore(r.safe),
            },
            {
              header: "Puntaje",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-ink",
              cell: (r) => formatScore(r.score),
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}

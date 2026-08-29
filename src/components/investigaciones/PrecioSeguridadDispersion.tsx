import { DataFigure } from "@/components/figures/DataFigure";
import {
  CRIME_YEAR,
  DEFAULT_SIZE,
  dispersion,
  formatArs,
  formatArsPerMetre,
  formatArsPerMetreRate,
  formatCoefficient,
  formatRate,
  RENT_PERIOD_LABEL,
  SIZES,
} from "@/content/investigaciones/data/alquiler-seguridad";
import { type Point, PrecioSeguridadScatter } from "./PrecioSeguridadChartBody";

// The page's own finding, and the answer to the question it can't dodge: how do
// you compare a crime to a peso?
//
// You don't invent a rate — you read the one the market already uses. Regress
// rent per m² on the crime rate across the barrios that have both, and the
// slope is what the rental market discounts, in pesos, for a barrio's recorded
// crime. It is the one number on this page that no methodological choice here
// influences: no weighting, no percentile, no index.
//
// A scatter rather than a sentence because the honest version of the finding
// has two halves and only one of them is a number. The slope says the market
// leans one way; the R² says most of what moves rent is something else
// entirely. Both are visible at once in a cloud around a line, and neither is
// in "the correlation is −0,39".
//
// ── Barrios, not comunas ──────────────────────────────────────────────────
// Against the map above, which opens on comunas because the coverage is better.
// A regression wants points, and fifteen comunas — of which one has no rent —
// is too few to show a cloud. Thirty-odd barrios is thin but it is a cloud, and
// the R² is quoted so the reader can see how tight it is.

const SIZE = SIZES.find((s) => s.id === DEFAULT_SIZE)!;

export function PrecioSeguridadDispersion() {
  const data = dispersion("barrios");
  // Nothing to draw if the source ever withholds almost every rent. Rather than
  // render an empty box, say nothing — the map above still works.
  if (!data) return null;

  const { fit, median, line } = data;
  const points: Point[] = data.points.map((p) => ({
    id: p.id,
    label: p.label,
    crimeRate: p.crimeRate,
    rentPerMetre: p.rentPerMetre,
    residual: p.residual,
    score: p.score,
  }));

  const byResidual = [...data.points].sort((a, b) => a.residual - b.residual);
  const bargain = byResidual[0];
  const premium = byResidual[byResidual.length - 1];

  // The corner the page is about, counted rather than described.
  const inCorner = data.points.filter(
    (p) =>
      p.crimeRate < median.crimeRate && p.rentPerMetre < median.rentPerMetre,
  );

  // The discount the fit applies across the whole observed range, as a monthly
  // figure on a flat of the reference surface — the unit a renter thinks in.
  const rangeDiscount = (fit.atCalmest - fit.atWorst) * fit.area;
  const discounts = fit.slope < 0;

  return (
    <DataFigure
      header={{
        title: <>Lo que el mercado ya cobra por la seguridad</>,
        subtitle: (
          <>
            Un punto por barrio · {SIZE.label} · {fit.n} barrios con las dos
            cifras · correlación {formatCoefficient(fit.r)}, R²{" "}
            {formatCoefficient(fit.r2)}
          </>
        ),
      }}
    >
      <PrecioSeguridadScatter points={points} line={line} median={median} />

      <figcaption className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Relación entre los delitos registrados por habitante y el alquiler
        pedido por metro cuadrado en los barrios de la Ciudad de Buenos Aires.
        Cada punto es un barrio: hacia la derecha, más hechos registrados; hacia
        arriba, más caro. Las líneas punteadas son las medianas de estos mismos
        barrios, y el recuadro es el cuadrante barato y tranquilo. La recta es
        el ajuste sobre esos puntos.
      </figcaption>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        {discounts ? (
          <>
            La recta baja, y esa pendiente es la respuesta a cómo se compara un
            delito con un peso: no hay que inventar un tipo de cambio, el
            mercado ya usa uno. Cada hecho registrado de más cada 1.000
            habitantes se descuenta unos{" "}
            {formatArsPerMetreRate(Math.abs(fit.slope))} del alquiler, que sobre
            un departamento de {fit.area} m² son{" "}
            {formatArs(Math.abs(fit.perFlat))} por mes. Del barrio más tranquilo
            de la muestra al que más hechos registra, el ajuste separa{" "}
            {formatArs(Math.abs(rangeDiscount))} mensuales.
          </>
        ) : (
          <>
            La recta sube: en esta muestra los barrios que más hechos registran
            no son los más baratos, que es lo que suele pasar cuando la tasa se
            calcula por residente en una ciudad con un centro comercial enorme.
            La pendiente vale {formatArsPerMetreRate(fit.slope)} por cada hecho
            registrado de más cada 1.000 habitantes.
          </>
        )}{" "}
        Pero el R² es {formatCoefficient(fit.r2)}: los delitos explican una
        fracción de lo que mueve al alquiler, y todo lo demás —subte, arbolado,
        colegios, moda— es la dispersión alrededor de la recta. Ahí está lo
        aprovechable. {bargain.label} es el barrio más barato de lo que su nivel
        de delitos haría esperar (
        {formatArsPerMetre(Math.abs(bargain.residual))} por debajo del ajuste) y{" "}
        {premium.label} el que más paga por encima (
        {formatArsPerMetre(Math.abs(premium.residual))}). En el cuadrante barato
        y tranquilo —por debajo de las dos medianas a la vez— entran{" "}
        {inCorner.length} de los {fit.n} barrios comparados. La pendiente dice
        que en promedio una cosa se cambia por la otra; esos {inCorner.length}{" "}
        son los que no cumplen el promedio, y son exactamente la lista que este
        cruce sirve para armar.
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        El ajuste es una regresión lineal simple sobre {fit.n} puntos y describe
        una asociación, no una causa: nadie sostiene que el alquiler baje{" "}
        <em>porque</em> suben los delitos, sino que las dos cosas se mueven
        juntas en el mapa de la Ciudad. Las medianas son las de estos barrios y
        no las de la Ciudad, porque una línea que parte el cuadrante en dos
        tiene que partir en dos{" "}
        <strong className="font-medium">estos puntos</strong>. Alquileres del{" "}
        {RENT_PERIOD_LABEL}, delitos de {CRIME_YEAR}; la mediana de la muestra
        está en {formatArsPerMetre(median.rentPerMetre)} y{" "}
        {formatRate(median.crimeRate)} hechos cada 1.000 habitantes.
      </p>
    </DataFigure>
  );
}

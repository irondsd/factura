import { DataFigure } from "@/components/figures/DataFigure";
import {
  DEFAULT_SIZE,
  elasticity,
  LAST_UPDATED,
  REFERENCE_AREA,
  rows,
  SIZES,
} from "@/content/estadisticas/data/rentabilidad-caba";
import { DispersionChart, type Point } from "./RentabilidadChartBody";

// Sale price and gross yield for every barrio with both IDECBA inputs.
//
// ── Barrios, not comunas ──────────────────────────────────────────────────
// Against the rest of the page, which opens on comunas because the coverage is
// better. A regression wants points, and fifteen comunas — of which one has no
// data — is too few to show a cloud. Thirty barrios is thin but it is a cloud,
// and the R² is quoted so the reader can see how tight it is.
//
// ── What the curve is ─────────────────────────────────────────────────────
// The elasticity from the data module, evaluated here and passed down as
// points. It is fitted in logs, so it is a straight line in logs and a curve
// here. Doing the evaluation server-side is what keeps the drawn line and the
// quoted β from ever describing different fits.

const SIZE = SIZES.find((s) => s.id === DEFAULT_SIZE)!;
const AREA = REFERENCE_AREA[DEFAULT_SIZE];

/** Argentine decimals for the two statistics quoted in the note. */
const dec = (v: number, places = 2): string =>
  v.toFixed(places).replace(".", ",");

/** The fitted curve as 40 points across the observed price range. Enough that
 * the bend reads as a curve rather than as a polyline.
 *
 * The slope is β − 1 and that is exact, not an approximation: the yield is
 * rent ÷ price, so in logs it is log(rent) − log(price), and regressing that on
 * log(price) gives back the rent elasticity minus one. The intercept is the
 * ordinary least-squares one for that slope. So this curve is the same fit the
 * data module reports, drawn — not a second model that happens to look like it.
 */
function curve(
  beta: number,
  points: Point[],
): { price: number; value: number }[] {
  const xs = points.map((p) => Math.log(p.price));
  const ys = points.map((p) => Math.log(p.value));
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
  const my = ys.reduce((s, y) => s + y, 0) / ys.length;
  const slope = beta - 1;
  const intercept = my - slope * mx;
  const lo = Math.min(...points.map((p) => p.price));
  const hi = Math.max(...points.map((p) => p.price));
  const out: { price: number; value: number }[] = [];
  for (let i = 0; i <= 40; i++) {
    const price = lo + ((hi - lo) * i) / 40;
    out.push({ price, value: Math.exp(intercept + slope * Math.log(price)) });
  }
  return out;
}

export function RentabilidadDispersion() {
  const fitStats = elasticity("barrios", DEFAULT_SIZE);
  const points: Point[] = rows("barrios", DEFAULT_SIZE)
    .filter(
      (r): r is typeof r & { value: number; payback: number; price: number } =>
        r.value !== null && r.price !== null && r.payback !== null,
    )
    .map((r) => ({
      id: r.id,
      label: r.label,
      price: r.price,
      value: r.value,
      payback: r.payback,
    }));

  // Nothing to draw if IDECBA ever withholds almost everything. Rather than
  // render an empty box, say so — the map above still works.
  if (!fitStats || points.length < 5) return null;

  return (
    <DataFigure
      header={{
        title: <>Precio de venta y rentabilidad</>,
        subtitle: (
          <>
            Un punto por barrio · {SIZE.label} ({AREA} m²) · {fitStats.n} barrios
            con los dos precios publicados
          </>
        ),
      }}
      caption={
        <>
          Relación entre el precio de venta del metro cuadrado y la rentabilidad
          del alquiler en los barrios de la Ciudad de Buenos Aires. Cada punto
          es un barrio: hacia la derecha, más caro comprar; hacia arriba, más
          rinde alquilar. La curva es el ajuste sobre esos mismos puntos.
        </>
      }
      note={
        <>
          En estos {fitStats.n} barrios, el rango del precio de venta por m² es{" "}
          {dec(fitStats.priceSpread)} veces; el del alquiler por m²,{" "}
          {dec(fitStats.rentSpread)} veces. El ajuste logarítmico estima que
          duplicar el precio publicado se asocia con un alquiler mensual por m²{" "}
          {Math.round((fitStats.doubling - 1) * 100)} % mayor (elasticidad{" "}
          {dec(fitStats.beta)}, R² {dec(fitStats.r2)}). Describe los avisos con
          ambos datos en el corte {LAST_UPDATED}; no establece causalidad ni
          mide el rendimiento neto.
        </>
      }
    >
      <DispersionChart points={points} fit={curve(fitStats.beta, points)} />
    </DataFigure>
  );
}

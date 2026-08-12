import {
  DEFAULT_SIZE,
  elasticity,
  formatUsd,
  LAST_UPDATED,
  ranked,
  REFERENCE_AREA,
  rows,
  SIZES,
} from "@/content/estadisticas/data/rentabilidad-caba";
import { DispersionChart, type Point } from "./RentabilidadChartBody";

// Why a cheap barrio yields more: every barrio as a dot, price against return,
// with the fitted curve.
//
// This is the page's own finding rather than a restatement of the map, and the
// figure is here to make it checkable. The claim is that rent varies far less
// across the city than sale prices do — so the return is close to a mechanical
// consequence of what a barrio costs. A scatter is the only shape that can be
// disagreed with: a reader who thinks their barrio is the exception can look
// for it and see how far off the curve it sits.
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

  const order = ranked("barrios", DEFAULT_SIZE);
  const best = order[0];
  const worst = order[order.length - 1];

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Cuanto más caro el barrio, menos rinde
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          Un punto por barrio · {SIZE.label} · {fitStats.n} barrios con los dos
          precios publicados
        </p>
      </figcaption>

      <DispersionChart points={points} fit={curve(fitStats.beta, points)} />

      <figcaption className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Relación entre el precio de venta del metro cuadrado y la rentabilidad
        del alquiler en los barrios de la Ciudad de Buenos Aires. Cada punto es
        un barrio: hacia la derecha, más caro comprar; hacia arriba, más rinde
        alquilar. La curva es el ajuste sobre esos mismos puntos.
      </figcaption>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        Entre el barrio más caro y el más barato hay {dec(fitStats.priceSpread)}{" "}
        veces de diferencia en el precio de venta, pero solo{" "}
        {dec(fitStats.rentSpread)} veces en el alquiler por metro cuadrado. Esa
        es toda la explicación: el alquiler está mucho más aplanado que la
        venta, así que el retorno cae casi mecánicamente a medida que el barrio
        se encarece. Ajustando en logaritmos, un barrio el doble de caro para
        comprar se alquila apenas un {Math.round((fitStats.doubling - 1) * 100)}{" "}
        % más caro (elasticidad {dec(fitStats.beta)}, R² {dec(fitStats.r2)}). En
        este trimestre el extremo rentable es {best.label} con{" "}
        {dec(best.value, 1)} % y el otro {worst.label} con {dec(worst.value, 1)}{" "}
        %, sobre departamentos de {AREA} m² que se piden a{" "}
        {formatUsd(best.flatUsd ?? 0)} y {formatUsd(worst.flatUsd ?? 0)}{" "}
        respectivamente. Datos del {LAST_UPDATED}.
      </p>
    </figure>
  );
}

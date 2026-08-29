import { DataFigure } from "@/components/figures/DataFigure";
import { brecha, RATES } from "@/content/estadisticas/data/dolar";
import {
  ciudad,
  DEFAULT_SIZE,
  formatYield,
  LAST_UPDATED,
  periodLabel,
  PERIODS,
  periodTick,
  SIZES,
} from "@/content/estadisticas/data/rentabilidad-caba";
import { vendorColorVar } from "@/lib/vendorColors";
import {
  type RateRow,
  type RateSeries,
  TipoCambioChart,
} from "./RentabilidadChartBody";

// The methodology figure: the same city series computed three times, once per
// exchange rate.
//
// It exists because the single largest objection to this page is "you picked
// the rate that gives you the answer you wanted", and the only honest reply is
// to show all three. What the figure actually shows is better than a defence:
// the three lines are the same line except between 2019 and 2025, and where
// they differ, the official rate is the outlier — it is the one that was held
// by decree while the other two were prices.
//
// The blue is drawn in the accent colour, because it is the series the rest of
// the page uses. The other two are neutral.

const SIZE = SIZES.find((s) => s.id === DEFAULT_SIZE)!;

const COLOR: Record<string, string> = {
  blue: "var(--accent)",
  oficial: vendorColorVar("slate-teal"),
  mep: vendorColorVar("taupe"),
};

/** The exchange control, as the two quarters that bound it. September 2019 is
 * when the controls came back; they were lifted in April 2025.
 *
 * These are period keys and the x axis is keyed on the *tick label*, so they
 * have to go through `periodTick` before recharts can match them — otherwise
 * the band silently collapses to the left edge instead of failing. Same
 * conversion the markers on the history chart need. */
const BAND = { from: "2019Q3", to: "2025Q2", label: "Cepo cambiario" };

/** Clamped to the series, so a band bound that predates the data doesn't drop
 * the whole shading. */
function bandBounds(): { from: string; to: string; label: string } | null {
  const first = PERIODS.find((p) => p >= BAND.from) ?? PERIODS[0];
  const lastIn = [...PERIODS].reverse().find((p) => p <= BAND.to);
  if (!lastIn || first > lastIn) return null;
  return { from: periodTick(first), to: periodTick(lastIn), label: BAND.label };
}

/** The quarter where the choice of rate mattered most — found rather than
 * typed, so the sentence under the figure can't go stale. */
function widestGap(): { period: string; blue: number; oficial: number } | null {
  let worst: { period: string; blue: number; oficial: number } | null = null;
  for (const period of PERIODS) {
    const blue = ciudad(DEFAULT_SIZE, period, "blue");
    const oficial = ciudad(DEFAULT_SIZE, period, "oficial");
    if (blue === null || oficial === null) continue;
    if (!worst || oficial - blue > worst.oficial - worst.blue) {
      worst = { period, blue, oficial };
    }
  }
  return worst;
}

export function RentabilidadTipoCambio() {
  const rates: RateSeries[] = RATES.map((r) => ({
    id: r.id,
    label: r.label,
    color: COLOR[r.id] ?? "var(--muted)",
  }));

  const rows: RateRow[] = PERIODS.map((period) => {
    const row: RateRow = {
      key: period,
      label: periodTick(period),
      title: periodLabel(period),
    };
    for (const r of RATES) row[r.id] = ciudad(DEFAULT_SIZE, period, r.id);
    return row;
  });

  const worst = widestGap();
  const gapNow = brecha(PERIODS[PERIODS.length - 1]);

  return (
    <DataFigure
      header={{
        title: <>La misma serie con tres tipos de cambio</>,
        subtitle: (
          <>Departamentos usados de {SIZE.label} · promedio de la Ciudad</>
        ),
      }}
      caption={
        <>
          La rentabilidad del alquiler en CABA calculada con el dólar blue, con
          el oficial y con el MEP. El alquiler se cobra en pesos y el
          departamento se compra en dólares, así que la cuenta depende de a qué
          cambio se pasa uno al otro.
        </>
      }
      note={
        <>
          Las tres curvas coinciden salvo durante el cepo. El blue y el MEP —dos
          precios de mercado a los que se llega por caminos distintos— se
          mantienen juntos toda la serie, y el que se separa es el oficial, que
          durante esos años no era un precio sino una cotización sostenida por
          el control de cambios.
          {worst &&
            ` En el ${periodLabel(worst.period)}, el peor caso, la diferencia es entre ${formatYield(worst.blue)} y ${formatYield(worst.oficial)}.`}
          {gapNow !== null &&
            gapNow < 0.02 &&
            " Hoy la brecha es prácticamente nula y los tres dan lo mismo."}{" "}
          Esta página usa el blue: es la referencia con la que efectivamente se
          compran y se venden departamentos en la Ciudad.{" "}
          <strong className="font-medium">La elección no afecta el mapa</strong>
          : dentro de un mismo trimestre todos los barrios se dividen por el
          mismo número, así que el orden entre barrios es idéntico con
          cualquiera de los tres. Mueve la altura de esta curva, no la
          comparación entre zonas. Fuentes: IDECBA y ArgentinaDatos, datos hasta
          el {LAST_UPDATED}.
        </>
      }
    >
      <TipoCambioChart rows={rows} rates={rates} band={bandBounds()} />
    </DataFigure>
  );
}

import {
  ciudad,
  DEFAULT_SIZE,
  formatPayback,
  formatYield,
  LAST_UPDATED,
  payback,
  periodLabel,
  PERIODS,
  periodTick,
  PROVISIONAL,
  SIZES,
} from "@/content/estadisticas/data/rentabilidad-caba";
import {
  HistoriaChart,
  type HistoryRow,
  type Marker,
} from "./RentabilidadChartBody";

// The city's gross rental yield, quarter by quarter, 2018 to now.
//
// One line and one unit size, deliberately. The three sizes track each other to
// within a few tenths of a point across the whole series, so drawing all three
// would be three lines saying one thing — and the one thing is dramatic enough
// on its own: the return fell by two thirds and then more than tripled.
//
// ── The two markers ────────────────────────────────────────────────────────
// Both are dated facts, not explanations. The page's prose is where the
// argument about cause belongs, and it is careful there: the rent law is the
// event everyone reaches for, but the trough is also the pandemic, a closed
// border, and a sale market that stayed priced in dollars while wages did not.
// A vertical rule saying when something happened lets a reader line the series
// up against it and draw their own conclusion; a label saying "por esto" would
// be doing that for them, from a series that cannot support it.

const SIZE = SIZES.find((s) => s.id === DEFAULT_SIZE)!;

/** Quarters worth marking on the axis. Each is the quarter the thing happened
 * in, so the rule sits under the first reading that could have felt it. */
const MARKERS: Marker[] = [
  // Ley 27.551, in force from 1 July 2020: three-year terms and a single
  // annual increase set by a BCRA index.
  { at: "2020Q3", label: "Ley de Alquileres" },
  // DNU 70/2023, 21 December 2023, repealed it and returned rents to free
  // contract.
  { at: "2023Q4", label: "Derogación" },
];

export function RentabilidadHistoria() {
  const rows: HistoryRow[] = PERIODS.map((period) => {
    const value = ciudad(DEFAULT_SIZE, period);
    return {
      key: period,
      label: periodTick(period),
      title: periodLabel(period),
      value,
      payback: value === null ? null : payback(value),
      provisional: PROVISIONAL.has(period),
    };
  });

  const markers = MARKERS.filter((m) => PERIODS.includes(m.at)).map((m) => ({
    ...m,
    at: periodTick(m.at),
  }));

  const withValue = rows.filter(
    (r): r is HistoryRow & { value: number } => r.value !== null,
  );
  const trough = withValue.reduce((a, b) => (b.value < a.value ? b : a));
  const last = withValue[withValue.length - 1];

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <HistoriaChart
        title={`Rentabilidad del alquiler en CABA, ${PERIODS[0].slice(0, 4)}–${LAST_UPDATED.slice(-4)}`}
        rows={rows}
        markers={markers}
      />

      <figcaption className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Evolución de la rentabilidad bruta anual del alquiler en la Ciudad de
        Buenos Aires, trimestre a trimestre, para un departamento usado de{" "}
        {SIZE.label}. Muestra cuánto rendía comprar para alquilar en cada
        momento y cuántos años de alquiler hacían falta para recuperar la
        inversión.
      </figcaption>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        El piso de la serie es {formatYield(trough.value)} en el {trough.title}{" "}
        —{formatPayback(payback(trough.value))} de alquiler para recuperar la
        compra— y el último dato es {formatYield(last.value)}, o{" "}
        {formatPayback(payback(last.value))}. Las dos líneas verticales marcan
        cuándo entró en vigencia la Ley de Alquileres y cuándo se derogó; son
        fechas, no explicaciones. Rentabilidad bruta, sobre precios de
        publicación, con el alquiler convertido a dólares al promedio trimestral
        del blue. Fuentes: IDECBA y ArgentinaDatos, datos hasta el{" "}
        {LAST_UPDATED}.
      </p>
    </figure>
  );
}

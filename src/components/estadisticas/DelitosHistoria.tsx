import { DataFigure } from "@/components/figures/DataFigure";
import {
  CATEGORIES,
  change,
  extremes,
  FIRST_YEAR,
  formatCount,
  formatPct,
  formatRate,
  formatRateBare,
  history,
  LAST_YEAR,
  SOURCE,
} from "@/content/estadisticas/data/delitos-caba";
import { HistoriaChart, type HistoriaRow } from "./DelitosChartBody";

// Ten years of the city series, which is the one thing a map can never show.
//
// The shape is unmistakable and it is not a crime story: 2020 is a hole. The
// city recorded barely half its usual crime during the year it was not allowed
// outside, and the four years since have been a climb back. Any reading of "is
// crime rising in Buenos Aires?" that starts after 2020 is measuring the end of
// a lockdown, which is why this figure covers the whole decade and the stat line
// quotes the pre-pandemic year rather than the previous one.
//
// The server half of the split (see AUTHORING.md §7): the <figure> shell, the
// caption, the source note, and every formatted string. The client half owns the
// unit switch and the plot.

/** The last year before the pandemic — the honest baseline for "how does today
 * compare?", and derived rather than typed so it survives the series growing. */
const BASELINE = 2019;

export function DelitosHistoria() {
  const series = Object.fromEntries(
    CATEGORIES.map((c) => [c.id, history(c.id)]),
  );

  const rows: HistoriaRow[] = history("total").map((row, i) => {
    const at = <T,>(f: (id: (typeof CATEGORIES)[number]["id"]) => T) =>
      Object.fromEntries(CATEGORIES.map((c) => [c.id, f(c.id)])) as Record<
        (typeof CATEGORIES)[number]["id"],
        T
      >;
    return {
      year: row.year,
      rate: at((id) => series[id][i].rate),
      count: at((id) => series[id][i].count),
      rateLabel: at((id) => formatRate(series[id][i].rate)),
      countLabel: at((id) => `${formatCount(series[id][i].count)} hechos`),
    };
  });

  const ext = extremes("total");
  const vsBaseline = change("total", BASELINE);
  const hasBaseline = history("total").some((r) => r.year === BASELINE);

  return (
    <DataFigure
      caption={
        <>
          Cómo evolucionaron los delitos registrados en la Ciudad de Buenos
          Aires año por año, en total y abiertos en robos, hurtos y delitos
          contra las personas. El hueco de {ext.low.year} es la pandemia, y es
          el motivo por el que conviene comparar contra {BASELINE} y no contra
          el año anterior.
        </>
      }
      note={
        <>
          La tasa se calcula siempre con la misma población, la del Censo 2022:
          la serie de delitos se movió mucho más en diez años que la cantidad de
          habitantes de la Ciudad, así que interpolar un divisor año por año
          agregaría una segunda estimación y ningún cambio visible. Por eso las
          dos vistas tienen exactamente la misma forma y solo cambia la escala.
          Fuente: {SOURCE}, datos hasta {LAST_YEAR}.
        </>
      }
    >
      <HistoriaChart
        title={`Delitos registrados en CABA, ${FIRST_YEAR}–${LAST_YEAR}`}
        statRate={
          <>
            {/* The unit is spelled out once and the extremes beside it are
                bare — three repetitions of it is most of the line. */}
            <span className="text-ink">{formatRate(ext.last.rate)}</span> en{" "}
            {ext.last.year} · Máximo {formatRateBare(ext.high.rate)} (
            {ext.high.year}) · Mínimo {formatRateBare(ext.low.rate)} (
            {ext.low.year})
            {hasBaseline && vsBaseline !== null && (
              <>
                {" "}
                · {formatPct(vsBaseline)} contra {BASELINE}
              </>
            )}
          </>
        }
        statCount={
          <>
            <span className="text-ink">
              {formatCount(ext.last.count)} hechos
            </span>{" "}
            en {ext.last.year} · el mínimo de la serie fue{" "}
            {formatCount(ext.low.count)} en {ext.low.year} · población
            constante, así que las dos vistas tienen la misma forma
          </>
        }
        rows={rows}
      />
    </DataFigure>
  );
}

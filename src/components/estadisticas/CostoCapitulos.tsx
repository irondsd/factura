import { DataFigure } from "@/components/figures/DataFigure";
import {
  capitulosSeries,
  CHAPTERS,
  formatPct,
  ICC_BASE,
  iccYoy,
  IS_PROVISIONAL,
  LAST_PERIOD,
  LAST_UPDATED,
  PERIODS,
  periodLabel,
} from "@/content/estadisticas/data/costo-construccion-caba";
import { CapitulosChart, type CapituloRow } from "./ConstruccionChartBody";

// Compare the ICC chapter index levels with the general index. This describes
// their relative movements; it does not identify causes or budget shares.
//
// IDECBA splits the index into three chapters: materials, labour and site
// overheads. Their *levels* are not comparable with each other (same base year,
// different starting points, and eleven years of inflation on top), so the chart
// draws each as a percentage of the general index. Above 100, the chapter has
// accumulated a larger index change than the general series since the base.
//
// The stat line carries the year-on-year rates as text, which is the part a
// reader quotes and the part a crawler can see — the plot itself is not in the
// HTML (AUTHORING.md §7).

/** The chapters that are parts of the whole. `nivel` is the whole. */
const PARTS = CHAPTERS.filter((c) => c.id !== "nivel");

export function CostoCapitulos() {
  const rows: CapituloRow[] = capitulosSeries().map((r) => ({
    ...r,
    title: periodLabel(r.period),
  }));

  // Derived from the current workbook: order chapters by their year-on-year
  // index variation. This is a comparison, not an explanation of cause.
  const rates = PARTS.map((c) => ({ ...c, rate: iccYoy(c.id) })).filter(
    (c): c is (typeof PARTS)[number] & { rate: number } => c.rate !== null,
  );
  const sorted = [...rates].sort((a, b) => b.rate - a.rate);

  return (
    <DataFigure
      caption={
        <>
          Cada capítulo del ICC como porcentaje del nivel general. En 100
          acumuló la misma variación desde el período base; por encima de 100,
          su variación acumulada superó la del índice general.
          {sorted.length > 0 && (
            <>
              {" "}
              En los últimos doce meses, la variación interanual más alta fue{" "}
              <strong className="font-medium">
                {sorted[0].label.toLowerCase()}
              </strong>
              , y la más baja,{" "}
              <strong className="font-medium">
                {sorted[sorted.length - 1].label.toLowerCase()}
              </strong>
              .
            </>
          )}
        </>
      }
      note={
        <>
          {ICC_BASE}. Serie de {periodLabel(PERIODS[0])} a{" "}
          {periodLabel(LAST_PERIOD)}. Fuente:
          IDECBA, datos hasta {LAST_UPDATED}
          {IS_PROVISIONAL && " (provisorio)"}.
        </>
      }
    >
      <CapitulosChart
        title="Evolución de los capítulos frente al índice general"
        stat={
          rates.length > 0 ? (
            <>
              Variación interanual a {LAST_UPDATED}:{" "}
              {rates.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && " · "}
                  {c.label}{" "}
                  <span className="text-ink">{formatPct(c.rate)}</span>
                </span>
              ))}
            </>
          ) : (
            <>La serie todavía no cubre doce meses.</>
          )
        }
        rows={rows}
      />
    </DataFigure>
  );
}

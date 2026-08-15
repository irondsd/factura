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

// "¿Por qué subió?" — the question that follows the number, and the one the cost
// series on its own cannot answer.
//
// IDECBA splits the index into three chapters: materials, labour and site
// overheads. Their *levels* are not comparable with each other (same base year,
// different starting points, and eleven years of inflation on top), so the chart
// draws each as a share of the index it belongs to. A line above 100 is a
// chapter that ran ahead of the cost of construction as a whole.
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

  // Derived, never typed: which chapter is pushing changes from year to year,
  // and has more than once reversed.
  const rates = PARTS.map((c) => ({ ...c, rate: iccYoy(c.id) })).filter(
    (c): c is (typeof PARTS)[number] & { rate: number } => c.rate !== null,
  );
  const sorted = [...rates].sort((a, b) => b.rate - a.rate);

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <CapitulosChart
        title="Qué empuja el costo: cada capítulo contra el índice general"
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

      <figcaption className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Cada capítulo del Índice del Costo de la Construcción, medido contra el
        índice completo. En 100 el capítulo se movió igual que el costo de
        construir en general; por encima de 100 corrió más rápido, y es lo que
        estuvo empujando el precio del metro cuadrado.
        {sorted.length > 0 && (
          <>
            {" "}
            En los últimos doce meses el que más subió fue{" "}
            <strong className="font-medium">
              {sorted[0].label.toLowerCase()}
            </strong>
            , y el que menos,{" "}
            <strong className="font-medium">
              {sorted[sorted.length - 1].label.toLowerCase()}
            </strong>
            .
          </>
        )}
      </figcaption>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        No son porcentajes de composición: cada línea es el índice del capítulo
        dividido por el índice general, así que las tres no suman 100. Se
        dibujan así porque los tres capítulos comparten año base pero no nivel
        de partida, y en pesos corrientes las tres curvas serían la misma curva
        de inflación a tres alturas distintas. {ICC_BASE}. Serie de{" "}
        {periodLabel(PERIODS[0])} a {periodLabel(LAST_PERIOD)}. Fuente: IDECBA,
        datos hasta {LAST_UPDATED}
        {IS_PROVISIONAL && " (provisorio)"}.
      </p>
    </figure>
  );
}

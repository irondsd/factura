import { DataFigure } from "@/components/figures/DataFigure";
import {
  FLAGGED,
  formatCount,
  formatPct,
  FULL_YEARS,
  LAST_FULL_YEAR,
  LAST_UPDATED,
  SOURCE,
  YEAR_EXTREMES,
  YEARS,
} from "@/content/estadisticas/data/escrituras-pba";
import { AnualChart, type AnualRow } from "./EscriturasChartBody";

const ratePer100 = (fraction: number) =>
  (fraction * 100).toLocaleString("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

// One bar per calendar year. The current partial year remains visible but is
// excluded from the average and rankings.

export function EscriturasAnual() {
  const flaggedYears = new Set(
    [...FLAGGED.keys()].map((p) => Number(p.slice(0, 4))),
  );

  const rows: AnualRow[] = YEARS.map((y) => ({
    year: y.year,
    compraventas: y.compraventas,
    hipotecas: y.hipotecas,
    compraventasLabel: formatCount(y.compraventas),
    hipotecasLabel: formatCount(y.hipotecas),
    shareLabel: ratePer100(y.share),
    complete: y.complete,
    note: !y.complete
      ? `Año en curso: ${y.months} de 12 meses. No entra en ninguna comparación de esta página.`
      : flaggedYears.has(y.year)
        ? "Incluye diciembre de 2007, con el Registro de la Propiedad de paro."
        : null,
  }));

  const average =
    FULL_YEARS.reduce((s, y) => s + y.compraventas, 0) / FULL_YEARS.length;

  const previous = FULL_YEARS[FULL_YEARS.length - 2];
  return (
    <DataFigure
      caption={
        <>
          Cada barra muestra el total anual de compraventas. El año en curso
          aparece con un tono más claro y se excluye de las comparaciones.
        </>
      }
      note={
        <>
          La línea muestra el promedio de los años completos. Fuente: {SOURCE},
          datos hasta {LAST_UPDATED}.
        </>
      }
    >
      <AnualChart
        // The chart draws the running year too, held back, so the title has to
        // span it — naming only the complete years would caption a bar it
        // does not cover.
        title={`Escrituras por año en la Provincia de Buenos Aires, ${YEARS[0].year}–${YEARS[YEARS.length - 1].year}`}
        stat={
          <>
            <span className="text-ink">
              {formatCount(LAST_FULL_YEAR.compraventas)}
            </span>{" "}
            en {LAST_FULL_YEAR.year}
            {previous && (
              <>
                {" "}
                ·{" "}
                {formatPct(
                  LAST_FULL_YEAR.compraventas / previous.compraventas - 1,
                )}{" "}
                contra {previous.year}
              </>
            )}
            {/* The last complete year is the highest of the series today, and
                that it is, is the finding. It stops being true the first year
                it is not, so the claim is derived rather than written. */}
            {LAST_FULL_YEAR.year === YEAR_EXTREMES.high.year ? (
              <> · el máximo de la serie</>
            ) : (
              <>
                {" "}
                · Máximo {formatCount(YEAR_EXTREMES.high.compraventas)} en{" "}
                {YEAR_EXTREMES.high.year}
              </>
            )}{" "}
            · Mínimo {formatCount(YEAR_EXTREMES.low.compraventas)} en{" "}
            {YEAR_EXTREMES.low.year} · la línea es el promedio de los{" "}
            {FULL_YEARS.length} años completos
          </>
        }
        rows={rows}
        average={average}
      />
    </DataFigure>
  );
}

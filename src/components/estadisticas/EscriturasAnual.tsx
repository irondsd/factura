import {
  FLAGGED,
  formatCount,
  formatPct,
  formatShare,
  FULL_YEARS,
  LAST_FULL_YEAR,
  LAST_UPDATED,
  SOURCE,
  YEAR_EXTREMES,
  YEARS,
} from "@/content/estadisticas/data/escrituras-pba";
import { AnualChart, type AnualRow } from "./EscriturasChartBody";

// The same series as one bar per year, which is the cut that answers "was this
// a good year?" without any rolling or smoothing to argue about.
//
// The finding is at the two ends: 2020, the year the province signed barely
// half its usual number of deeds, and the last complete year, which is the
// highest of the twenty-one. Both are read off the chart directly.
//
// The year in progress is drawn held back rather than dropped. Dropping it
// leaves a reader wondering where this year went; drawing it level with the
// rest invites them to compare six months against twelve. Neither the ranking
// nor the average includes it — `FULL_YEARS` is what those are computed over.
//
// The server half of the split: the <figure> shell, the caption, the source
// note and every formatted string.

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
    shareLabel: formatShare(y.share),
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
  const runnerUp = FULL_YEARS.filter(
    (y) => y.year !== YEAR_EXTREMES.high.year,
  ).reduce((a, y) => (y.compraventas > a.compraventas ? y : a));

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
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
                · {formatPct(
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

      <figcaption className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Cada barra es un año completo de escrituras de compraventa. La barra
        clara de la derecha es el año en curso, que va por{" "}
        {YEARS[YEARS.length - 1].months} meses y no se compara con las demás. El
        año más alto de la serie es {YEAR_EXTREMES.high.year}, por encima de{" "}
        {runnerUp.year}, que era el récord anterior.
      </figcaption>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        Son cantidades de actos, no montos: no hace falta corregirlas por
        inflación ni convertirlas, y por eso son la parte de este dato que se
        puede leer de punta a punta sin ninguna advertencia. Fuente: {SOURCE},
        datos hasta {LAST_UPDATED}.
      </p>
    </figure>
  );
}

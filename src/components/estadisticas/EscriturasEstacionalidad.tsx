import { DataFigure } from "@/components/figures/DataFigure";
import {
  compraventas,
  escriturasPhrase,
  formatShare,
  LAST_UPDATED,
  seasonality,
  seasonalitySpan,
  SOURCE,
} from "@/content/estadisticas/data/escrituras-pba";
import { EstacionalidadChart, type SeasonRow } from "./EscriturasChartBody";

// Average share of annual activity assigned to each month. This makes the
// aggregate calendar pattern visible without treating it as market growth.

/** What a month would carry if the year were even. Everything in the figure is
 * read against this. */
const FLAT = 100 / 12;

/** Three letters, which is what fits under twelve bars on a phone. */
const SHORT: Record<string, string> = {
  enero: "ene",
  febrero: "feb",
  marzo: "mar",
  abril: "abr",
  mayo: "may",
  junio: "jun",
  julio: "jul",
  agosto: "ago",
  septiembre: "sep",
  octubre: "oct",
  noviembre: "nov",
  diciembre: "dic",
};

export function EscriturasEstacionalidad() {
  const season = seasonality();
  const span = seasonalitySpan();

  const rows: SeasonRow[] = season.map((s) => {
    const pct = s.share * 100;
    return {
      month: s.label,
      short: SHORT[s.label],
      share: pct,
      shareLabel: formatShare(s.share),
      vsFlat: `${pct >= FLAT ? "+" : ""}${((pct / FLAT - 1) * 100).toLocaleString("es-AR", { maximumFractionDigits: 0 })} %`,
    };
  });

  const high = season.reduce((a, s) => (s.share > a.share ? s : a));
  const low = season.reduce((a, s) => (s.share < a.share ? s : a));

  return (
    <DataFigure
      caption={
        <>
          Proporción de las compraventas anuales que corresponde a cada mes,
          promediada entre los {span.n} años completos indicados. La línea marca
          un reparto uniforme.
        </>
      }
      note={
        <>
          Se excluye 2020: en abril se registró{" "}
          {escriturasPhrase(compraventas("2020-04"))}, un valor que altera la
          media mensual. Fuente: {SOURCE}, datos hasta {LAST_UPDATED}.
        </>
      }
    >
      <EstacionalidadChart
        title={`Cómo se reparte el año: escrituras por mes, promedio ${span.from}–${span.to}`}
        stat={
          <>
            <span className="text-ink">{high.label}</span> se lleva el{" "}
            {formatShare(high.share)} del año y{" "}
            <span className="text-ink">{low.label}</span> el{" "}
            {formatShare(low.share)}, contra el {formatShare(1 / 12)} que le
            tocaría a cada mes si el año fuera parejo. Son{" "}
            {(high.share / low.share).toLocaleString("es-AR", {
              maximumFractionDigits: 1,
            })}{" "}
            veces.
          </>
        }
        rows={rows}
        flat={FLAT}
      />
    </DataFigure>
  );
}

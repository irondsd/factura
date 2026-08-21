import {
  compraventas,
  escriturasPhrase,
  formatCount,
  formatShare,
  LAST_UPDATED,
  seasonality,
  seasonalitySpan,
  SOURCE,
} from "@/content/estadisticas/data/escrituras-pba";
import {
  EstacionalidadChart,
  type SeasonRow,
} from "./EscriturasChartBody";

// The figure that licenses every other one on the page.
//
// This series has a calendar, and it is not a small one: December carries
// roughly four times what January carries, in every single year of the
// twenty-one. That is why nothing here is presented month against month, and
// rather than say so in a footnote the page shows the shape and lets the
// reader see how much of a "record December" is just December.
//
// The mechanism is prosaic and worth stating: a deed is signed when the
// paperwork is ready, and the paperwork bunches at the end of the year —
// closings pushed to beat the holidays, and a judicial and administrative feria
// in January that empties the following month.
//
// The server half of the split: the <figure> shell, the caption, the source
// note and every formatted string.

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
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <EstacionalidadChart
        title={`Cómo se reparte el año: escrituras por mes, promedio ${span.from}–${span.to}`}
        stat={
          <>
            <span className="text-ink">{high.label}</span> se lleva el{" "}
            {formatShare(high.share)} del año y <span className="text-ink">
              {low.label}
            </span>{" "}
            el {formatShare(low.share)}, contra el {formatShare(1 / 12)} que le
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

      <figcaption className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        La parte del año que se lleva cada mes, promediada sobre los últimos{" "}
        {span.n} años completos. La línea horizontal es el reparto parejo. Una
        escritura se firma cuando los papeles están listos, y los papeles se
        amontonan sobre fin de año: por eso diciembre siempre parece un boom y
        enero siempre parece un derrumbe, en cualquier año y en cualquier
        mercado.
      </figcaption>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        2020 queda afuera del promedio. No es un año estacional en ningún
        sentido —en abril se firmó {escriturasPhrase(compraventas("2020-04"))}{" "}
        en toda la provincia y en diciembre{" "}
        {formatCount(compraventas("2020-12"))}—, así que incluirlo no haría más
        robusto el perfil: pondría una cuarentena en el medio de un gráfico
        sobre las fiestas.
        Fuente: {SOURCE}, datos hasta {LAST_UPDATED}.
      </p>
    </figure>
  );
}

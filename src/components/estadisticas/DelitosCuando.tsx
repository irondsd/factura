import {
  byDay,
  byHour,
  formatShare,
  PERFIL_YEAR,
  SIN_FRANJA_SHARE,
  SOURCE,
} from "@/content/estadisticas/data/delitos-caba";
import { HoraChart, type HoraRow } from "./DelitosChartBody";

// The one question on this page a map cannot answer, and the one whose answer is
// actionable: not where, but when.
//
// Robos and hurtos are the same crime to a statistician and different events to
// a person — one is taken from you and the other is taken without you noticing —
// and the clearest evidence that they *are* different events is that they happen
// at different hours. Hurtos follow the working day and peak around midday and
// at going-home time; robos climb through the evening and hold into the night.
//
// The figure plots each category as a share of its own day rather than as
// counts, which is what lets a category three times the size of another be
// compared with it by shape. The flat line is what a day with no pattern would
// look like: 100 % spread over 24 hours.
//
// The server half of the split: the <figure> shell, the caption and the source
// note. The client half owns the category switch and the plot.

/** A day with no pattern would put this share in every hour. */
const FLAT = 100 / 24;

/** "20:00 a 21:00" — the tooltip's label for an hour, where it stands alone. */
const hourLabel = (hour: number): string =>
  `${String(hour).padStart(2, "0")}:00 a ${String((hour + 1) % 24).padStart(2, "0")}:00`;

/** The same hour inside a sentence: "entre las 20 y las 21". */
const hourSpan = (hour: number): string => `${hour} y las ${(hour + 1) % 24}`;

/** The hour a category peaks at, for the stat line. Derived, never typed. */
function peak(category: "robos" | "hurtos" | "personas"): {
  hour: number;
  share: number;
} {
  return byHour(category).reduce((a, r) => (r.share > a.share ? r : a));
}

export function DelitosCuando() {
  const robos = byHour("robos");
  const hurtos = byHour("hurtos");
  const personas = byHour("personas");

  const rows: HoraRow[] = robos.map((r, i) => ({
    hour: r.hour,
    label: hourLabel(r.hour),
    robos: r.share * 100,
    hurtos: hurtos[i].share * 100,
    personas: personas[i].share * 100,
  }));

  const peakRobo = peak("robos");
  const peakHurto = peak("hurtos");

  // The week, as one sentence rather than a second chart: it has seven points
  // and almost no spread, so a figure would be seven bars of the same height
  // with one short one. The two ends are the whole finding.
  const week = [...byDay("total")].sort((a, b) => b.share - a.share);
  const busiest = week[0];
  const quietest = week[week.length - 1];

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <HoraChart
        title={`A qué hora se registran los delitos en CABA, ${PERFIL_YEAR}`}
        stat={
          <>
            Los robos tocan su máximo entre las{" "}
            <span className="text-ink">{hourSpan(peakRobo.hour)}</span> (
            {formatShare(peakRobo.share)} del día) y los hurtos entre las{" "}
            <span className="text-ink">{hourSpan(peakHurto.hour)}</span> (
            {formatShare(peakHurto.share)}). La línea horizontal es el{" "}
            {formatShare(FLAT / 100)} que le tocaría a cada hora si el día fuera
            parejo.
          </>
        }
        rows={rows}
        flat={FLAT}
      />

      <figcaption className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Distribución horaria de los delitos registrados en la Ciudad de Buenos
        Aires. Cada barra es la parte del día que se lleva esa hora dentro de su
        propio tipo de delito, así que los tres tipos se pueden comparar por
        forma aunque uno sea tres veces más grande que otro.
      </figcaption>

      <p className="font-mono text-xs text-muted mt-3 leading-[1.6]">
        Por día de la semana la diferencia es mucho menor que por hora: el día
        más cargado es el {busiest.day} con el {formatShare(busiest.share)} de
        la semana y el más tranquilo el {quietest.day} con el{" "}
        {formatShare(quietest.share)}, contra el {formatShare(1 / 7)} que le
        tocaría a cada día. El delito en la Ciudad tiene horario, no tiene tanto
        calendario.
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        La hora es la que quedó registrada en la denuncia, que en un hurto no
        siempre es la hora en que ocurrió: quien descubre que le falta la
        billetera al llegar a su casa denuncia la hora en que se dio cuenta. Los
        porcentajes se calculan sobre los hechos que tienen hora cargada; el{" "}
        {formatShare(SIN_FRANJA_SHARE)} de los registros de {PERFIL_YEAR} no la
        tiene y queda afuera del gráfico. Fuente: {SOURCE}, datos de{" "}
        {PERFIL_YEAR}.
      </p>
    </figure>
  );
}

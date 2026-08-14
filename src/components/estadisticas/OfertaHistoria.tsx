import {
  EVENTOS,
  eventoMonth,
} from "@/content/estadisticas/data/ley-alquileres";
import {
  DEFAULT_SIZE,
  display,
  formatIndex,
  formatM2,
  history,
  historyExtremes,
  LAST_PERIOD,
  LAST_UPDATED,
  PERIODS,
  periodLabel,
  PROVIDER_CHANGE,
  ROLLING,
  WINDOWS,
  cityIndex,
} from "@/content/estadisticas/data/oferta-alquiler-caba";
import { type Marker, SerieChart, type SerieRow } from "./OfertaChartBody";

// The page's main figure: everything IDECBA has published about how much was on
// offer in the city, on one axis.
//
// One line and one size band. The four size views track each other closely
// enough that drawing them together would be four lines making one point, and
// the point is large enough on its own — the offer fell to about a third of its
// own baseline and then came back at twice it. What each size did separately is
// the composition table further down the page, where it is a comparison of
// shares rather than four curves at four scales.
//
// ── Why two lines of the same series ───────────────────────────────────────
// The raw monthly figure swings hard with the season, so on a thirteen-year
// axis it is a band rather than a line and any two months read against each
// other are partly two different times of year. The twelve-month mean removes
// that by construction. Both are drawn: a smoother alone hides how noisy the
// thing it smooths is, and on this series the noise is a real part of the
// picture — the trough is not just low, it is low and flat.

const { trough, peak, last } = historyExtremes(DEFAULT_SIZE);

const SPAN = `${PERIODS[0].slice(0, 4)}–${LAST_PERIOD.slice(0, 4)}`;

/** The three windows by id, so the note can name them without repeating the
 * labels the data module already owns. */
const WINDOW = Object.fromEntries(WINDOWS.map((w) => [w.id, w])) as Record<
  (typeof WINDOWS)[number]["id"],
  (typeof WINDOWS)[number]
>;

const MARKERS: Marker[] = EVENTOS.map((e) => ({
  at: eventoMonth(e),
  label: e.label,
})).filter((m) => PERIODS.includes(m.at));

export function OfertaHistoria() {
  const rows: SerieRow[] = history(DEFAULT_SIZE).map((p) => ({
    period: p.period,
    title: periodLabel(p.period),
    units: p.units,
    unitsLabel: display(p.units),
    m2Label: formatM2(p.m2),
    avg: p.unitsAvg,
    avgLabel: p.unitsAvg === null ? null : display(p.unitsAvg),
    provisional: p.provisional,
  }));

  // The band covers the months from the previous provider, so it ends the month
  // before the change. `PROVIDER_CHANGE` is the first month of the new one.
  const legacyTo = PERIODS[PERIODS.indexOf(PROVIDER_CHANGE) - 1];

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <SerieChart
        title={`Departamentos publicados en alquiler en CABA, ${SPAN}`}
        stat={
          <>
            <span className="text-ink">Promedio de {ROLLING} meses</span> ·
            Mínimo {display(trough.unitsAvg)} ({periodLabel(trough.period)}) ·
            Último {display(last.unitsAvg)} ({periodLabel(last.period)})
          </>
        }
        rows={rows}
        markers={MARKERS}
        band={
          legacyTo
            ? {
                from: PERIODS[0],
                to: legacyTo,
                label: "Otro proveedor",
              }
            : null
        }
      />

      <figcaption className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Cuántos departamentos se publicaron en alquiler en la Ciudad de Buenos
        Aires cada mes, desde que arranca la serie de IDECBA. La línea fina es
        el dato del mes; la gruesa, el promedio de los {ROLLING} meses
        anteriores, que es la que conviene leer porque la oferta tiene una
        estacionalidad marcada.
      </figcaption>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        Tomando {WINDOW.base.label} como base 100, la oferta cae a{" "}
        {formatIndex(cityIndex(DEFAULT_SIZE, "trough"))} en{" "}
        {WINDOW.trough.label} y está en{" "}
        {formatIndex(cityIndex(DEFAULT_SIZE, "now"))} en los últimos doce meses.
        El piso de la serie suavizada son {formatM2(trough.m2Avg)} mensuales
        promedio y el máximo, {formatM2(peak.m2Avg)}. La franja gris de la
        izquierda son los meses que el organismo relevó sobre otro proveedor de
        avisos: no son estrictamente comparables con el resto. Las dos líneas
        verticales marcan cuándo empezó a regir la Ley de Alquileres y cuándo
        quedó derogada; son fechas, no explicaciones. La cantidad de
        departamentos es aproximada —superficie publicada dividida por la
        superficie promedio de un aviso del mes—. Universo: departamentos usados
        y a estrenar, de 1 a 5 ambientes. Fuente: IDECBA, datos hasta{" "}
        {LAST_UPDATED}.
      </p>
    </figure>
  );
}

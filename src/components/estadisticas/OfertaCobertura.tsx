import {
  coverage,
  DEFAULT_SIZE,
  LAST_UPDATED,
  PERIODS,
  periodLabel,
  SIZES,
} from "@/content/estadisticas/data/alquiler-caba";
import {
  EVENTOS,
  eventoQuarter,
} from "@/content/estadisticas/data/ley-alquileres";
import {
  CoberturaChart,
  type CoberturaRow,
  type Marker,
} from "./OfertaChartBody";

// The second instrument, and the reason this page is worth publishing rather
// than describing.
//
// IDECBA withholds an average rent for a barrio that had too few listings in
// the quarter to compute one. That rule turns its price tables into an
// accidental census of the market's thinness: **how many of the 48 barrios
// clear the threshold is itself a measurement of how much was on offer**, taken
// with a completely different instrument from the square metres above — a
// different table, a different cadence, a different unit, and a threshold set
// by the source rather than by us.
//
// Nobody publishes this series, including IDECBA. It exists here only because
// the refresh script parses every quarter of the price tables and the data
// module can count the holes (`coverage`). Its shape is the supply series':
// stable through 2018-19, falling from 2020, a floor in 2023, and a jump back
// within two quarters of the repeal.
//
// ── Why 2 ambientes ────────────────────────────────────────────────────────
// It is the size with the widest coverage, so it is the one whose count has the
// most room to fall before it hits zero and stops measuring anything. The other
// two sizes tell the same story from a lower and noisier starting point.
//
// ── What it cannot show ────────────────────────────────────────────────────
// The price series starts in 2018, so this figure has nothing to say about the
// 2013-17 decline. That half of the story is the supply series' alone, which is
// the honest reason both figures are on the page.

const SIZE = SIZES.find((s) => s.id === DEFAULT_SIZE)!;

const MARKERS: Marker[] = EVENTOS.map((e) => ({
  at: eventoQuarter(e),
  label: e.label,
})).filter((m) => PERIODS.includes(m.at));

export function OfertaCobertura() {
  const rows: CoberturaRow[] = PERIODS.map((period) => {
    const { withData, total } = coverage("barrios", DEFAULT_SIZE, period);
    return { period, title: periodLabel(period), withData, total };
  });

  const floor = rows.reduce((a, b) => (b.withData < a.withData ? b : a));
  const peak = rows.reduce((a, b) => (b.withData > a.withData ? b : a));
  const last = rows[rows.length - 1];

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Barrios con precio de alquiler publicable, trimestre a trimestre
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          <span className="text-ink">
            De {last.total} barrios, departamentos de {SIZE.label}
          </span>{" "}
          · Mínimo {floor.withData} ({floor.title}) · Máximo {peak.withData} (
          {peak.title}) · Último {last.withData} ({last.title})
        </p>
      </figcaption>

      <CoberturaChart rows={rows} markers={MARKERS} />

      <figcaption className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        En cuántos de los {last.total} barrios de la Ciudad hubo avisos
        suficientes como para que IDECBA pudiera publicar un precio promedio de
        alquiler. No mide precios: mide en cuántos barrios había mercado que
        medir.
      </figcaption>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        Esta serie no la publica nadie, ni siquiera el organismo: sale de
        contar, trimestre por trimestre, cuántos barrios quedan sin dato en sus
        propios cuadros de precios. El organismo no informa un promedio cuando
        la cantidad de avisos del barrio es demasiado baja, así que un barrio
        que desaparece del cuadro es un barrio donde dejó de publicarse lo
        suficiente. Es una medición distinta de la del gráfico anterior —otra
        tabla, otra frecuencia, otra unidad y un umbral que fija la fuente— y
        por eso sirve como control. Empieza en 2018, que es donde empiezan los
        cuadros de precios, así que no alcanza para decir nada sobre la caída
        anterior. Las líneas verticales son las mismas dos fechas. Fuente:
        IDECBA, datos hasta {LAST_UPDATED}.
      </p>
    </figure>
  );
}

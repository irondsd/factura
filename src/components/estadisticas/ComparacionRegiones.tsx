import {
  COMPARABLE_REGIONS,
  FIRST_UPDATED,
  interanual,
  LAST_UPDATED,
  multiple,
  periodLabel,
  periodTick,
  type RegionId,
} from "@/content/estadisticas/data/ipc-vivienda";
import { vendorColorVar } from "@/lib/vendorColors";
import {
  ComparacionChart,
  type MultiRow,
  type RegionSeries,
} from "./IpcChartBody";

// The cross-region section: the six INDEC regions on one pair of axes, and the
// ranking of how much each has multiplied since the dataset opens.
//
// Two figures rather than one because no single figure answers both questions
// over this span. The lines show *when* the regions diverged, which is the whole
// story of 2024; the ranking shows *how far apart they ended up*, which the
// lines can't, because six years of Argentine inflation on a linear axis flatten
// everything before 2023 into the bottom of the plot. See `multiple` in the data
// module.
//
// Server component, like the per-region figures: the captions and the ranking
// are plain HTML, and only the interactive lines are the client half.

const chartRegions: RegionSeries[] = COMPARABLE_REGIONS.map((r) => ({
  id: r.id,
  label: r.label,
  color: vendorColorVar(r.color),
}));

/** One row per month, every region's interannual rate on it — the shape recharts
 * wants for a multi-series chart. Every region's series covers the same periods
 * (they come from one table), so the first region's periods drive the rows. */
function comparisonRows(): { rows: MultiRow[]; min: number; max: number } {
  const series = COMPARABLE_REGIONS.map((r) => ({
    id: r.id as RegionId,
    ...interanual(r.id),
  }));
  const periods = series[0].periods;

  const rows = periods.map((period, i) => {
    const row: MultiRow = {
      key: period,
      label: periodTick(period),
      title: periodLabel(period),
    };
    for (const s of series) row[s.id] = s.values[i];
    return row;
  });

  const all = series.flatMap((s) => s.values);
  return { rows, min: Math.min(0, ...all), max: Math.max(...all) };
}

const { rows, min, max } = comparisonRows();

/** Regions ranked by how much the price level multiplied, most first. */
const RANKED = [...COMPARABLE_REGIONS]
  .map((r) => ({ ...r, value: multiple(r.id) }))
  .sort((a, b) => b.value - a.value);

const MAX_MULTIPLE = RANKED[0].value;

const times = (v: number) => `×${v.toFixed(1).replace(".", ",")}`;

export function ComparacionRegiones() {
  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Las seis regiones, una al lado de la otra
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          Variación interanual · {periodLabel(rows[0].key as string)} a{" "}
          {LAST_UPDATED}
        </p>
      </figcaption>

      <ComparacionChart rows={rows} regions={chartRegions} range={{ min, max }} />

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Evolución anual del IPC de vivienda, agua, electricidad, gas y otros
        combustibles en las seis regiones del INDEC, en un mismo gráfico.
        Permite comparar el aumento de gas, luz y vivienda entre el Gran Buenos
        Aires, la región Pampeana, el Noreste, el Noroeste, Cuyo y la Patagonia,
        y ver en qué momento se separaron unas de otras.
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        La serie interanual empieza un año después que los datos, porque cada
        punto compara contra el mismo mes del año anterior. No incluye el total
        nacional: es el promedio de estas seis regiones, así que su línea caería
        siempre en el medio del grupo. Fuente: INDEC, datos hasta {LAST_UPDATED}.
      </p>
    </figure>
  );
}

/** The same comparison as one number per region, over the whole dataset.
 *
 * Bars rather than a chart component: this is six values with no time axis, and
 * a `<div>` whose width is a percentage is the entire drawing. It is also
 * server-rendered as ordinary markup, which puts the six figures a reader most
 * wants — and the only ones covering the full span — into the HTML as text. */
export function MultiploRegiones() {
  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Cuántas veces se multiplicó el costo de la vivienda en cada región
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          Acumulado de {FIRST_UPDATED} a {LAST_UPDATED}
        </p>
      </figcaption>

      <ol className="list-none p-0 m-0 flex flex-col gap-3">
        {RANKED.map((r, i) => (
          <li key={r.id} className="flex items-center gap-3">
            <span className="w-[86px] shrink-0 font-mono text-xs text-ink">
              {r.label}
            </span>
            <span className="flex-1 min-w-0 h-3.5 bg-[color-mix(in_srgb,var(--line)_45%,transparent)]">
              <span
                className="block h-full"
                style={{
                  width: `${(r.value / MAX_MULTIPLE) * 100}%`,
                  background: vendorColorVar(r.color),
                  // The leader is the point of a ranking; the rest are context.
                  opacity: i === 0 ? 1 : 0.72,
                }}
              />
            </span>
            <span className="w-[52px] shrink-0 text-right font-mono text-xs text-muted tabular-nums">
              {times(r.value)}
            </span>
          </li>
        ))}
      </ol>

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Cuánto se multiplicó el IPC de vivienda, agua, electricidad, gas y otros
        combustibles en cada región desde {FIRST_UPDATED}. Un ×40 quiere decir
        que lo que costaba $10.000 al empezar la serie hoy cuesta $400.000.
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        Calculado encadenando las variaciones mensuales publicadas, que vienen
        redondeadas a un decimal, así que el resultado puede diferir en algunas
        décimas del acumulado que publica el organismo. Fuente: INDEC, datos
        hasta {LAST_UPDATED}.
      </p>
    </figure>
  );
}

import {
  getRegion,
  interanual,
  LAST_UPDATED,
  monthly,
  PERIODS,
  type RegionId,
  REGION_IDS,
} from "@/content/estadisticas/data/ipc-vivienda";
import { niceTicks, smoothPath } from "@/lib/svg-chart";

// The fourteen figures of /estadisticas/inflacion: one interannual and one
// monthly chart for each of the seven series in the IPC dataset. An .mdx page
// places one with
//
//   <IpcViviendaChart region="gba" variacion="mensual" />
//
// and nothing else — no numbers, no imports, no props to get wrong.
//
// Server component emitting plain SVG, for the same reasons the guide figures
// are (see components/guides/InflacionChart.tsx): these are statically rendered
// SEO pages read by crawlers as often as by people, and a charting library is a
// large download for a picture that cannot change between builds.
//
// ── One scale for every region ─────────────────────────────────────────────
// The axes are computed across ALL regions, not per chart. This page exists so
// the regions can be read against each other, and an auto-scaled axis quietly
// defeats that: the Noreste's monthly variation peaks at about half the GBA's,
// but scaled to its own maximum its chart would have exactly the same silhouette
// as the GBA's. The cost is that the calmest regions use less of the box, which
// is the true shape of the data.

const MUTED = "var(--muted)";
const LINE = "var(--line)";
const ACCENT = "var(--accent)";

type Mode = "interanual" | "mensual";

/** The blurb under each figure. Region-specific: these are the pages' search
 * surface, and each region is looked for by the names of its own provinces and
 * cities. Written out per figure rather than templated — the phrasing differs
 * enough between regions that a template would fight every one of them. */
const CAPTION: Record<Mode, Record<RegionId, string>> = {
  interanual: {
    nacional:
      "Evolución anual del IPC de vivienda, agua, electricidad, gas y otros combustibles en Argentina. Muestra cómo cambiaron los precios de estos servicios y el aumento de gas, luz y electricidad a lo largo del tiempo.",
    gba: "Evolución anual del IPC de vivienda, agua, electricidad, gas y otros combustibles en el Gran Buenos Aires. Los datos permiten analizar el aumento de gas en Buenos Aires, así como la evolución de los precios de electricidad, vivienda y servicios.",
    pampeana:
      "Evolución anual del IPC de vivienda, agua, electricidad, gas y otros combustibles en la región Pampeana. La región comprende áreas de Buenos Aires, Córdoba, Santa Fe, Entre Ríos y La Pampa, e incluye el aumento de gas en Córdoba, Santa Fe y La Pampa y en localidades como Rosario, Mar del Plata, Bahía Blanca, Tandil, Necochea y Olavarría.",
    noreste:
      "Evolución anual del IPC de vivienda, agua, electricidad, gas y otros combustibles en el Noreste argentino (Corrientes, Chaco, Formosa y Misiones). Muestra la evolución de los precios de vivienda, electricidad, gas y otros combustibles en la región.",
    noroeste:
      "Evolución anual del IPC de vivienda, agua, electricidad, gas y otros combustibles en el Noroeste argentino (Catamarca, Jujuy, La Rioja, Salta, Santiago del Estero y Tucumán). Incluye la evolución de los precios de gas, electricidad, vivienda y otros combustibles.",
    cuyo: "Evolución anual del IPC de vivienda, agua, electricidad, gas y otros combustibles en Cuyo (Mendoza, San Juan y San Luis). Consulta la evolución de los precios y del aumento de gas en Mendoza, junto con los cambios en electricidad, vivienda y otros combustibles.",
    patagonia:
      "Evolución anual del IPC de vivienda, agua, electricidad, gas y otros combustibles en la Patagonia (Río Negro, Neuquén, Chubut, Santa Cruz y Tierra del Fuego). Sigue el aumento de gas en la Patagonia, provincia por provincia, y en localidades como Bariloche, Esquel, Trelew y Ushuaia.",
  },
  mensual: {
    nacional:
      "Variación mensual del IPC de vivienda, agua, electricidad, gas y otros combustibles en Argentina. Consulta cuánto subió el gas y la electricidad y cómo evolucionaron los precios de luz y gas mes a mes.",
    gba: "Variación mensual del IPC de vivienda, agua, electricidad, gas y otros combustibles en el Gran Buenos Aires. Consulta la evolución del aumento de electricidad, gas y vivienda mes a mes en Buenos Aires.",
    pampeana:
      "Variación mensual del IPC de vivienda, agua, electricidad, gas y otros combustibles en la región Pampeana. Consulta la evolución del aumento de gas y electricidad mes a mes en áreas como Córdoba, Santa Fe, Entre Ríos, La Pampa y el interior de Buenos Aires.",
    noreste:
      "Variación mensual del IPC de vivienda, agua, electricidad, gas y otros combustibles en el Noreste argentino. Consulta cómo cambian los precios de vivienda, luz y gas y otros servicios de la región mes a mes.",
    noroeste:
      "Variación mensual del IPC de vivienda, agua, electricidad, gas y otros combustibles en el Noroeste argentino. Consulta la evolución mensual de los precios de gas y electricidad en Salta, Jujuy, Tucumán y otras provincias de la región.",
    cuyo: "Variación mensual del IPC de vivienda, agua, electricidad, gas y otros combustibles en Cuyo. Consulta cómo evolucionan mes a mes los precios de gas y electricidad en Mendoza, San Juan y San Luis.",
    patagonia:
      "Variación mensual del IPC de vivienda, agua, electricidad, gas y otros combustibles en la Patagonia. Consulta la evolución mensual del aumento de gas y electricidad en Río Negro, Neuquén, Chubut, Santa Cruz y Tierra del Fuego, incluyendo localidades como Bariloche, Esquel, Trelew y Ushuaia.",
  },
};

const NOTE: Record<Mode, string> = {
  interanual:
    "Variación interanual: cada mes contra el mismo mes del año anterior. Un 50 % quiere decir que los precios de la división son un 50 % más altos que doce meses antes.",
  mensual:
    "Variación mensual: cada mes contra el mes anterior. Es el número que el INDEC publica cada mes.",
};

/** The series a figure draws, with its periods. */
function seriesFor(
  region: RegionId,
  mode: Mode,
): { periods: readonly string[]; values: number[] } {
  return mode === "interanual"
    ? interanual(region)
    : { periods: PERIODS, values: monthly(region) };
}

/** Axis bounds across every region, so all seven charts of a mode share one
 * scale — see the note at the top. Computed once per module load. */
function sharedScale(mode: Mode, target: number) {
  const all = REGION_IDS.flatMap((r) => seriesFor(r, mode).values);
  // Zero is always on the axis: it's the line "prices did not move", and on the
  // monthly chart it's the baseline the columns hang from.
  return niceTicks(Math.min(0, ...all), Math.max(0, ...all), target);
}

const SCALE: Record<Mode, ReturnType<typeof niceTicks>> = {
  interanual: sharedScale("interanual", 4),
  mensual: sharedScale("mensual", 5),
};

// ── geometry ───────────────────────────────────────────────────────────────
// Laid out twice at two viewBox widths, with CSS picking one. An SVG scales its
// text along with everything else, so a single wide box squeezed onto a phone
// renders 12px labels at 6px; the narrow box does far less downscaling and the
// type survives. Same specs, same data — only the arithmetic reruns.
const WIDE = {
  w: 720,
  h: 300,
  pad: { top: 14, right: 14, bottom: 30, left: 46 },
  font: 12,
  /** Label every Nth January on the x axis. */
  yearEvery: 1,
} as const;

const NARROW = {
  w: 380,
  h: 240,
  pad: { top: 12, right: 8, bottom: 26, left: 36 },
  font: 11,
  yearEvery: 2,
} as const;

type Geometry = typeof WIDE | typeof NARROW;

/** Percentages on the axis: whole numbers, comma decimal, no unit (the unit is
 * in the note under the figure, and repeating "%" on five ticks is noise). */
const tickLabel = (v: number) =>
  (Math.round(v * 10) / 10).toString().replace(".", ",");

/** A value as the prose writes it: "43,7 %". */
const percent = (v: number) => `${v.toFixed(1).replace(".", ",")} %`;

/** The Januaries of a series, which is what the x axis is labelled with: one
 * tick per year, printed as the year itself. Reads better than a month/year
 * pair, and it stays legible as the series grows — a label every twelve points
 * either way. */
function yearTicks(
  periods: readonly string[],
  every: number,
): { i: number; year: string }[] {
  return periods
    .map((p, i) => ({ i, year: p.slice(0, 4), month: p.slice(4, 6) }))
    .filter(({ month }) => month === "01")
    .filter((_, n) => n % every === 0)
    .map(({ i, year }) => ({ i, year }));
}

function Figure({
  region,
  mode,
  g,
}: {
  region: RegionId;
  mode: Mode;
  g: Geometry;
}) {
  const { periods, values } = seriesFor(region, mode);
  const { ticks, lo, hi } = SCALE[mode];

  const plotW = g.w - g.pad.left - g.pad.right;
  const plotH = g.h - g.pad.top - g.pad.bottom;
  const last = values.length - 1;

  const y = (v: number) => g.pad.top + plotH - ((v - lo) / (hi - lo)) * plotH;

  // Columns own a slot each and sit in the middle of it; the line runs corner to
  // corner. Sharing one `x` would push the first and last column half out of the
  // plot area.
  const slot = plotW / values.length;
  const x =
    mode === "mensual"
      ? (i: number) => g.pad.left + slot * (i + 0.5)
      : (i: number) => g.pad.left + (i / last) * plotW;

  const barW = Math.max(1.5, slot * 0.7);
  const zero = y(0);

  const summary =
    `${mode === "interanual" ? "Variación interanual" : "Variación mensual"} del IPC de vivienda, agua, ` +
    `electricidad, gas y otros combustibles en ${getRegion(region).inTitle}, ` +
    `de ${periods[0].slice(0, 4)} a ${LAST_UPDATED}. ` +
    `Máximo ${percent(Math.max(...values))}, mínimo ${percent(Math.min(...values))}, ` +
    `último dato ${percent(values[last])}.`;

  return (
    <svg
      viewBox={`0 0 ${g.w} ${g.h}`}
      className="w-full h-auto"
      role="img"
      aria-label={summary}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={g.pad.left}
            x2={g.w - g.pad.right}
            y1={y(t)}
            y2={y(t)}
            stroke={LINE}
            strokeWidth={1}
            // The zero line is the one a reader measures against, so it reads a
            // step stronger than the rest of the grid.
            opacity={t === 0 ? 1 : 0.55}
          />
          <text
            x={g.pad.left - 6}
            y={y(t) + 4}
            textAnchor="end"
            fill={MUTED}
            fontSize={g.font}
            fontFamily="var(--font-mono)"
          >
            {tickLabel(t)}
          </text>
        </g>
      ))}

      {yearTicks(periods, g.yearEvery).map(({ i, year }) => (
        <text
          key={year}
          x={x(i)}
          y={g.h - 9}
          textAnchor="middle"
          fill={MUTED}
          fontSize={g.font}
          fontFamily="var(--font-mono)"
        >
          {year}
        </text>
      ))}

      {mode === "mensual" ? (
        values.map((v, i) => (
          <rect
            key={periods[i]}
            x={x(i) - barW / 2}
            y={Math.min(zero, y(v))}
            width={barW}
            // A month that didn't move is still a month: without the floor its
            // column vanishes and the series looks like it has a hole.
            height={Math.max(1, Math.abs(y(v) - zero))}
            fill={ACCENT}
            opacity={v < 0 ? 0.45 : 0.85}
          />
        ))
      ) : (
        <>
          <path
            d={smoothPath(values.map((v, i) => ({ x: x(i), y: y(v) })))}
            fill="none"
            stroke={ACCENT}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* End-of-series value, so the chart can be read without a tooltip. */}
          <circle cx={x(last)} cy={y(values[last])} r={3} fill={ACCENT} />
        </>
      )}
    </svg>
  );
}

export function IpcViviendaChart({
  region,
  variacion,
}: {
  region: RegionId;
  variacion: Mode;
}) {
  const { inTitle } = getRegion(region);
  const title =
    variacion === "interanual"
      ? `Aumento de vivienda, agua, electricidad y gas en ${inTitle}`
      : `Aumento mensual de vivienda, agua, electricidad y gas en ${inTitle}`;

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        {/* An h3, not a paragraph: fourteen figures is most of this page, and
            their titles are what a reader scanning the table of contents — or a
            search engine reading the outline — is looking for. */}
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          {title}
        </h3>
      </figcaption>

      {/* Same spec, two layouts; CSS shows exactly one. Both carry the same
          aria-label, and that's fine rather than duplicated: `hidden` is
          `display:none`, so the variant that isn't shown is out of the
          accessibility tree too. */}
      <div className="hidden sm:block">
        <Figure region={region} mode={variacion} g={WIDE} />
      </div>
      <div className="sm:hidden">
        <Figure region={region} mode={variacion} g={NARROW} />
      </div>

      <p className="font-mono text-xs text-muted mt-3 leading-[1.6]">
        {CAPTION[variacion][region]}
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        {NOTE[variacion]} Todas las regiones se grafican en la misma escala, para
        que los gráficos se puedan comparar entre sí. Fuente: INDEC, datos hasta{" "}
        {LAST_UPDATED}.
      </p>
    </figure>
  );
}

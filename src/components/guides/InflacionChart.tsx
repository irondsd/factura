import {
  type ChartId,
  inUsd,
  LAST_UPDATED,
  MONTHS,
  multiple,
  SERIES,
  SERIES_LABEL,
  type SeriesId,
} from "@/content/guias/data/inflacion";
import { smoothPath } from "@/lib/svg-chart";

// The chart block for the `inflacion` guides. Registered in mdx-components.tsx,
// so a guide draws one with <InflacionChart chart="luz-y-gas" /> and nothing
// else — no data in the prose, no imports, no props to get wrong.
//
// Deliberately a *server* component emitting plain SVG rather than a recharts
// chart like /app/insights uses. These pages are the SEO surface: they're
// statically rendered, they're read by crawlers as often as by people, and
// shipping a charting library to a reader of an article is a real cost for a
// picture that will never change between builds. Everything below is layout
// arithmetic done once at build time.
//
// Adding a chart means adding its id to CHART_IDS (in the data module, where the
// guide validator can see it) and its spec to CHARTS here — the `satisfies`
// below won't compile with one but not the other.

// ── palette ────────────────────────────────────────────────────────────────
// The headline series is always --accent; the comparison lines are drawn in the
// muted end of the vendor palette so the eye lands on the point being made.
const INK = "var(--ink)";
const MUTED = "var(--muted)";
const LINE = "var(--line)";
const ACCENT = "var(--accent)";
const REF = "var(--vendor-slate-teal)";
const ALT = "var(--vendor-ochre)";

type Line = {
  label: string;
  values: number[];
  color: string;
  dashed?: boolean;
};

type LineChart = {
  kind: "line";
  title: string;
  caption: string;
  /** Y-axis unit note, e.g. what 100 means. */
  note: string;
  lines: Line[];
};

type BarChart = {
  kind: "bars";
  title: string;
  caption: string;
  note: string;
  bars: { label: string; value: number; highlight?: boolean }[];
};

type Chart = LineChart | BarChart;

/** A peso line + its dollar twin, the comparison the whole section is built on. */
function pesosVsDolares(id: SeriesId): Line[] {
  return [
    { label: "En pesos", values: [...SERIES[id]], color: ACCENT },
    { label: "En dólares", values: inUsd(id), color: REF, dashed: true },
  ];
}

/** One service against the general index — the shape most guides want. */
function vsGeneral(id: SeriesId): Line[] {
  return [
    { label: SERIES_LABEL[id], values: [...SERIES[id]], color: ACCENT },
    {
      label: SERIES_LABEL.general,
      values: [...SERIES.general],
      color: REF,
      dashed: true,
    },
  ];
}

const BASE_NOTE =
  "Base noviembre de 2023 = 100. Un valor de 400 significa que el precio se multiplicó por cuatro.";

const CHARTS = {
  /** The section's opening image: everything about the home, against the number
   * that gets reported as "la inflación". */
  "servicios-vs-general": {
    kind: "line",
    title: "Los servicios del hogar contra la inflación general",
    caption:
      "IPC del Gran Buenos Aires desde noviembre de 2023, el último mes antes de la corrección de tarifas.",
    note: BASE_NOTE,
    lines: [
      {
        label: SERIES_LABEL.energia,
        values: [...SERIES.energia],
        color: ACCENT,
      },
      {
        label: SERIES_LABEL.vivienda,
        values: [...SERIES.vivienda],
        color: ALT,
      },
      {
        label: SERIES_LABEL.general,
        values: [...SERIES.general],
        color: REF,
        dashed: true,
      },
    ],
  },
  /** Same idea, read as a single number per service. Bars beat lines when the
   * point is the ranking rather than the path. */
  "cuanto-subio-cada-servicio": {
    kind: "bars",
    title: "Cuántas veces se multiplicó cada gasto",
    caption: `Noviembre de 2023 a ${LAST_UPDATED}, IPC del Gran Buenos Aires.`,
    note: "×4,3 quiere decir que lo que costaba $10.000 hoy cuesta $43.000.",
    bars: [
      {
        label: SERIES_LABEL.energia,
        value: multiple("energia"),
        highlight: true,
      },
      { label: SERIES_LABEL.transporte, value: multiple("transporte") },
      { label: SERIES_LABEL.expensas, value: multiple("expensas") },
      { label: SERIES_LABEL.telecom, value: multiple("telecom") },
      { label: SERIES_LABEL.general, value: multiple("general") },
    ],
  },
  /** The product argument, drawn: the peso line is terrifying, the dollar line
   * is the actual news. */
  "pesos-vs-dolares": {
    kind: "line",
    title: "La misma boleta de luz y gas, medida de dos maneras",
    caption:
      "El gasto en energía del hogar en pesos y convertido a dólares al blue, ambos partiendo de 100.",
    note: "La distancia entre las dos líneas es el peso perdiendo valor. La línea de dólares es lo que el servicio te cuesta de verdad.",
    lines: pesosVsDolares("energia"),
  },
  "luz-y-gas": {
    kind: "line",
    title: "Luz y gas contra la inflación general",
    caption:
      "IPC del Gran Buenos Aires, división “Electricidad, gas y otros combustibles”.",
    note: BASE_NOTE,
    lines: vsGeneral("energia"),
  },
  expensas: {
    kind: "line",
    title: "Expensas y alquiler contra la inflación general",
    caption:
      "IPC del Gran Buenos Aires, división “Alquiler de la vivienda y gastos conexos”, donde el INDEC releva las expensas.",
    note: BASE_NOTE,
    lines: vsGeneral("expensas"),
  },
  "agua-y-vivienda": {
    kind: "line",
    title: "El costo de la vivienda contra la inflación general",
    caption:
      "IPC del Gran Buenos Aires, división “Vivienda, agua, electricidad, gas y otros combustibles”, que es donde entra el agua.",
    note: BASE_NOTE,
    lines: vsGeneral("vivienda"),
  },
  "internet-y-celular": {
    kind: "line",
    title: "Internet y telefonía contra la inflación general",
    caption:
      "IPC del Gran Buenos Aires, apertura “Servicios de telefonía e internet”.",
    note: BASE_NOTE,
    lines: vsGeneral("telecom"),
  },
} as const satisfies Record<ChartId, Chart>;

// ── geometry ───────────────────────────────────────────────────────────────
// An SVG scales its *text* along with everything else, which is the one thing a
// responsive chart must not do: a 12px label in a 720-unit viewBox renders at
// 6px once the box is squeezed onto a 350px phone. recharts dodges this by
// re-measuring in the browser, which is exactly the JS these pages don't want.
//
// So each figure is laid out twice, at two viewBox widths, and CSS picks one —
// `WIDE` for the article column, `NARROW` for phones, where the smaller box
// means far less downscaling and the type survives. Both come from the same
// spec, so there's no second chart to keep in sync; only the arithmetic reruns.
const WIDE = {
  w: 720,
  h: 320,
  pad: { top: 16, right: 16, bottom: 34, left: 44 },
  font: 12,
  /** Label every N months on the x axis. */
  xEvery: 6,
} as const;

const NARROW = {
  w: 380,
  h: 250,
  pad: { top: 12, right: 10, bottom: 28, left: 34 },
  font: 11,
  xEvery: 12,
} as const;

type Geometry = typeof WIDE | typeof NARROW;

/** "202403" → "mar 24". */
function monthLabel(period: string): string {
  const names = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ];
  return `${names[Number(period.slice(4, 6)) - 1]} ${period.slice(2, 4)}`;
}

/** A round-ish ceiling for the y axis, so the gridlines land on readable
 * numbers instead of wherever the data happens to stop. */
function axisTop(max: number): number {
  const step = max > 600 ? 200 : max > 300 ? 100 : 50;
  return Math.ceil(max / step) * step;
}

function LineFigure({ chart, g }: { chart: LineChart; g: Geometry }) {
  const plotW = g.w - g.pad.left - g.pad.right;
  const plotH = g.h - g.pad.top - g.pad.bottom;
  const max = Math.max(...chart.lines.flatMap((l) => l.values));
  const top = axisTop(max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f));

  const last = MONTHS.length - 1;
  const x = (i: number) => g.pad.left + (i / last) * plotW;
  const y = (v: number) => g.pad.top + plotH - (v / top) * plotH;
  const path = (values: number[]) =>
    smoothPath(values.map((v, i) => ({ x: x(i), y: y(v) })));

  // A label every `xEvery` months, plus the base month and the last point.
  // Labelling Januaries instead would read better but leaves whichever year the
  // series starts mid-way entirely unlabelled, and drifts as the series grows.
  // The `last - i` guard drops a regular tick that would collide with the final
  // one, which is always labelled because it's the number the prose quotes.
  const xLabels = MONTHS.map((m, i) => ({ m, i })).filter(
    ({ i }) => i === last || (i % g.xEvery === 0 && last - i > 2),
  );

  return (
    <svg
      viewBox={`0 0 ${g.w} ${g.h}`}
      className="w-full h-auto"
      role="img"
      aria-label={`${chart.title}. ${chart.caption} ${chart.lines
        .map((l) => `${l.label}: de 100 a ${Math.round(l.values[last])}.`)
        .join(" ")}`}
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
          />
          <text
            x={g.pad.left - 6}
            y={y(t) + 4}
            textAnchor="end"
            fill={MUTED}
            fontSize={g.font}
            fontFamily="var(--font-mono)"
          >
            {t}
          </text>
        </g>
      ))}

      {xLabels.map(({ m, i }) => (
        <text
          key={m}
          x={x(i)}
          y={g.h - 10}
          textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}
          fill={MUTED}
          fontSize={g.font}
          fontFamily="var(--font-mono)"
        >
          {monthLabel(m)}
        </text>
      ))}

      {chart.lines.map((l) => (
        <path
          key={l.label}
          d={path(l.values)}
          fill="none"
          stroke={l.color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={l.dashed ? "5 4" : undefined}
        />
      ))}

      {/* End-of-series value, so the chart can be read without a tooltip. */}
      {chart.lines.map((l) => (
        <circle
          key={l.label}
          cx={x(last)}
          cy={y(l.values[last])}
          r={3}
          fill={l.color}
        />
      ))}
    </svg>
  );
}

function BarFigure({ chart, g }: { chart: BarChart; g: Geometry }) {
  const max = Math.max(...chart.bars.map((b) => b.value));

  // Wide enough for the longest SERIES_LABEL at this font size: the labels are
  // right-aligned against this edge, so anything that doesn't fit runs off the
  // left of the viewBox and is clipped rather than wrapped. There's no width to
  // spare for that column on a phone, so the narrow variant stacks the label
  // above its bar instead of setting it beside.
  const inline = g === WIDE;
  const labelW = inline ? 205 : 0;
  const rowH = inline ? 34 : 46;
  const height = chart.bars.length * rowH + 12;
  const barW = g.w - labelW - (inline ? 60 : 46);

  return (
    <svg
      viewBox={`0 0 ${g.w} ${height}`}
      className="w-full h-auto"
      role="img"
      aria-label={`${chart.title}. ${chart.bars
        .map(
          (b) => `${b.label}: ${b.value.toFixed(1).replace(".", ",")} veces.`,
        )
        .join(" ")}`}
    >
      {chart.bars.map((b, i) => {
        const top = i * rowH + 6;
        const barY = inline ? top + 5 : top + 16;
        const w = (b.value / max) * barW;
        return (
          <g key={b.label}>
            <text
              x={inline ? labelW - 12 : 0}
              y={inline ? top + 18 : top + 10}
              textAnchor={inline ? "end" : "start"}
              fill={INK}
              fontSize={g.font}
              fontFamily="var(--font-mono)"
            >
              {b.label}
            </text>
            <rect
              x={labelW}
              y={barY}
              width={w}
              height={inline ? 18 : 14}
              fill={b.highlight ? ACCENT : REF}
              opacity={b.highlight ? 1 : 0.55}
            />
            <text
              x={labelW + w + 8}
              y={barY + (inline ? 13 : 11)}
              fill={MUTED}
              fontSize={g.font}
              fontFamily="var(--font-mono)"
            >
              ×{b.value.toFixed(1).replace(".", ",")}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function InflacionChart({ chart }: { chart: ChartId }) {
  const spec: Chart = CHARTS[chart];

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <p className="font-mono text-micro uppercase tracking-label-wide text-muted">
          {spec.title}
        </p>
        <p className="font-mono text-xs text-muted mt-1 opacity-85 leading-[1.6]">
          {spec.caption}
        </p>
      </figcaption>

      {/* Same spec, two layouts; CSS shows exactly one. Both carry the same
          aria-label, and that's fine rather than duplicated: `hidden` is
          `display:none`, so the variant that isn't shown is out of the
          accessibility tree too. */}
      <div className="hidden sm:block">
        {spec.kind === "line" ? (
          <LineFigure chart={spec} g={WIDE} />
        ) : (
          <BarFigure chart={spec} g={WIDE} />
        )}
      </div>
      <div className="sm:hidden">
        {spec.kind === "line" ? (
          <LineFigure chart={spec} g={NARROW} />
        ) : (
          <BarFigure chart={spec} g={NARROW} />
        )}
      </div>

      {spec.kind === "line" && (
        <ul className="flex flex-wrap gap-x-5 gap-y-2 mt-3 list-none p-0">
          {spec.lines.map((l) => (
            <li
              key={l.label}
              className="flex items-center gap-2 font-mono text-xs text-muted"
            >
              <span
                aria-hidden
                className="h-0 w-4 shrink-0 border-t-2"
                style={{
                  borderColor: l.color,
                  borderTopStyle: l.dashed ? "dashed" : "solid",
                }}
              />
              {l.label}
            </li>
          ))}
        </ul>
      )}

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6]">
        {spec.note} Fuente: INDEC (IPC, Gran Buenos Aires)
        {spec.kind === "line" &&
        spec.lines.some((l) => l.label === "En dólares")
          ? " y promedio mensual del dólar blue"
          : ""}
        , datos hasta {LAST_UPDATED}.
      </p>
    </figure>
  );
}

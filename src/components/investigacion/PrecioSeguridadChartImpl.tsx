"use client";

import {
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { niceTicks } from "@/lib/svg-chart";

// The interactive half of the scatter on
// /investigacion/barrios-seguros-baratos-caba. The <figure> shell — caption,
// source note, every quoted statistic — stays in the server component that
// renders this.
//
// One chart, three layers, and the order they are drawn in is the argument:
//
//   1. the shaded quadrant — cheaper *and* calmer than the median of the
//      barrios being compared, which is the corner the page is about;
//   2. the fitted line — what the market charges for safety, so a reader can
//      see how much of the pattern is a trend and how much is scatter;
//   3. the barrios themselves, on top, because the whole point of a scatter is
//      that a reader can find their own and disagree.

const AXIS = "var(--line)";
const ACCENT = "var(--accent)";

const tickStyle = {
  fontSize: 11,
  fill: "var(--muted)",
  fontFamily: "var(--font-mono)",
} as const;

/** "16,5k" — pesos per m², where the thousands are the only part that reads at
 * axis size. */
const rentAxis = (v: number) =>
  `${(Math.round(v / 100) / 10).toString().replace(".", ",")}k`;
const rateAxis = (v: number) => Math.round(v).toString();

const ars = (v: number) =>
  `$ ${Math.round(v).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
const dec1 = (v: number) => v.toFixed(1).replace(".", ",");

/** An axis that fits the data rather than the round numbers around it.
 *
 * `niceTicks` widens its range out to the next round step at both ends, which is
 * right for a series read against zero. It is wrong here, where neither axis
 * starts at zero and the extra step at each end is a third of the plot spent on
 * empty space, squashing the cloud the figure exists to show. So: keep
 * `niceTicks` for *where the gridlines go*, and clip the domain to the data plus
 * a small margin, dropping ticks that fall outside. */
function tightAxis(min: number, max: number, pad: number, target = 4) {
  const lo = min - (max - min) * pad;
  const hi = max + (max - min) * pad;
  return {
    domain: [lo, hi] as [number, number],
    ticks: niceTicks(lo, hi, target).ticks.filter((t) => t >= lo && t <= hi),
  };
}

const card =
  "bg-card border border-line py-2 px-2.5 font-mono text-micro text-ink shadow-[0_2px_8px_rgba(0,0,0,0.08)]";

export type Point = {
  id: string;
  label: string;
  /** Recorded crimes per 1.000 residents a year — the x axis. */
  crimeRate: number;
  /** Asking rent, pesos per m² a month — the y axis. */
  rentPerMetre: number;
  /** Actual rent minus the fit's prediction, pesos per m². */
  residual: number;
  score: number;
};

function PointTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: Point }[];
}) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div className={`${card} min-w-[230px]`}>
      <div className="uppercase tracking-[0.14em] text-muted mb-1.5">
        {p.label}
      </div>
      <div className="flex items-center gap-2.5 mt-[3px]">
        <span className="flex-1 text-muted">Alquiler</span>
        <span className="font-semibold">{ars(p.rentPerMetre)}/m²</span>
      </div>
      <div className="flex items-center gap-2.5 mt-[3px]">
        <span className="flex-1 text-muted">Delitos c/1.000 hab.</span>
        <span className="font-semibold">{dec1(p.crimeRate)}</span>
      </div>
      <div className="flex items-center gap-2.5 mt-[3px]">
        <span className="flex-1 text-muted">
          {p.residual < 0 ? "Más barato" : "Más caro"} de lo esperado
        </span>
        <span className="text-muted">{ars(Math.abs(p.residual))}/m²</span>
      </div>
      <div className="flex items-center gap-2.5 mt-[3px]">
        <span className="flex-1 text-muted">Puntaje combinado</span>
        <span className="text-muted">{Math.round(p.score)}/100</span>
      </div>
    </div>
  );
}

/** Crime on x, rent on y, one dot per barrio, the median lines and the fit.
 *
 * The fit is evaluated by the server component and passed down as its two
 * endpoints, so the drawn line and the quoted slope cannot drift apart. It is a
 * least-squares fit in levels, so it is straight in these axes and two points
 * are the whole of it. */
export function PrecioSeguridadScatter({
  points,
  line,
  median,
}: {
  points: Point[];
  line: { crimeRate: number; rentPerMetre: number }[];
  median: { crimeRate: number; rentPerMetre: number };
}) {
  const crimes = points.map((p) => p.crimeRate);
  const rents = points.map((p) => p.rentPerMetre);
  const x = tightAxis(Math.min(...crimes), Math.max(...crimes), 0.06, 5);
  const y = tightAxis(Math.min(...rents), Math.max(...rents), 0.08, 4);

  return (
    <div className="h-[320px] sm:h-[380px]">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart
          margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
          accessibilityLayer
        >
          <CartesianGrid stroke={AXIS} strokeDasharray="2 3" />
          <XAxis
            type="number"
            dataKey="crimeRate"
            name="Delitos cada 1.000 habitantes"
            domain={x.domain}
            ticks={x.ticks}
            tick={tickStyle}
            axisLine={{ stroke: AXIS }}
            tickLine={false}
            tickFormatter={rateAxis}
            label={{
              value: "Delitos registrados cada 1.000 hab. por año",
              position: "insideBottom",
              offset: -4,
              fill: "var(--muted)",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
            }}
            height={44}
          />
          <YAxis
            type="number"
            dataKey="rentPerMetre"
            name="Alquiler"
            width={52}
            domain={y.domain}
            ticks={y.ticks}
            tick={tickStyle}
            axisLine={false}
            tickLine={false}
            tickFormatter={rentAxis}
          />
          <ZAxis range={[42, 42]} />

          {/* The corner the page is named after: below both medians. Drawn
              first so everything else sits on top of it. */}
          <ReferenceArea
            x1={x.domain[0]}
            x2={median.crimeRate}
            y1={y.domain[0]}
            y2={median.rentPerMetre}
            fill="var(--accent)"
            fillOpacity={0.07}
            label={{
              value: "Más barato y más tranquilo",
              position: "insideBottomLeft",
              fill: "var(--muted)",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
            }}
          />
          {/* Drawn in the muted ink rather than the grid's own colour, and a
              step heavier. The grid is already dashed, so a median line at
              `var(--line)` reads as one more gridline — and the caption calls
              these "las líneas punteadas", which has to point at something a
              reader can pick out. */}
          <ReferenceLine
            x={median.crimeRate}
            stroke="var(--muted)"
            strokeOpacity={0.6}
            strokeWidth={1.25}
            strokeDasharray="5 4"
          />
          <ReferenceLine
            y={median.rentPerMetre}
            stroke="var(--muted)"
            strokeOpacity={0.6}
            strokeWidth={1.25}
            strokeDasharray="5 4"
          />

          <Tooltip
            cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
            isAnimationActive={false}
            content={(props) => <PointTooltip {...props} />}
          />

          {/* The fit under the barrios, so a dot is never hidden by it. */}
          <Scatter
            data={line}
            line={{ stroke: "var(--muted)", strokeWidth: 1.5 }}
            shape={() => <g />}
            legendType="none"
            isAnimationActive={false}
          />
          <Scatter data={points} fill={ACCENT} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

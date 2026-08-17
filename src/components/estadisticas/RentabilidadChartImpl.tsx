"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
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
import { Legend } from "@/components/charts/primitives";
import { niceTicks } from "@/lib/svg-chart";

// The interactive halves of the three figures on
// /estadisticas/rentabilidad-alquiler-caba. The `<figure>` shells — captions,
// source notes — stay in the server components that render these.
//
// Three charts, three jobs, and they are separate because each answers a
// question the other two can't:
//
//   • `HistoriaChart`  when the return collapsed and when it came back;
//   • `TipoCambioChart`  how much of that shape is the exchange rate. It is the
//     methodology figure, and it is a *chart* rather than a paragraph because
//     the honest answer is "enormously between 2020 and 2024, and not at all
//     before or since", which is a shape;
//   • `DispersionChart`  why a cheap barrio yields more, as the scatter the
//     regression line is fitted to. Every point is a barrio, so the reader can
//     find theirs rather than take the slope on trust.

const AXIS = "var(--line)";
const ACCENT = "var(--accent)";

const tickStyle = {
  fontSize: 11,
  fill: "var(--muted)",
  fontFamily: "var(--font-mono)",
} as const;

const pct1 = (v: number) => `${v.toFixed(1).replace(".", ",")} %`;
const pctAxis = (v: number) =>
  `${(Math.round(v * 10) / 10).toString().replace(".", ",")} %`;
const usdAxis = (v: number) => `${Math.round(v / 100) / 10}k`;
const years = (v: number) => `${Math.round(v)} años`;

function yAxis(min: number, max: number, target = 4) {
  const { ticks, lo, hi } = niceTicks(min, max, target);
  return { ticks, domain: [lo, hi] as [number, number] };
}

/** An axis that fits the data rather than the round numbers around it.
 *
 * `niceTicks` widens its range out to the next round step at both ends, which
 * is right for the two time series — they are read against zero, and a bit of
 * headroom costs nothing. It is wrong for the scatter, where neither axis
 * starts at zero and the extra step at each end is a third of the plot spent on
 * empty space, squashing the cloud the figure exists to show.
 *
 * So: keep `niceTicks` for *where the gridlines go*, and clip the domain to the
 * data plus a small margin. Ticks that fall outside are dropped rather than
 * pinned to the edge, which would print a label against the axis line. */
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

// ── 1. The history of the city's yield ─────────────────────────────────────

/** One quarter of the city series. `payback` travels with every point rather
 * than being derived in the tooltip: the two are the same fact in two units,
 * and a reader hovering a point wants the one they think in. */
export type HistoryRow = {
  key: string;
  label: string;
  title: string;
  value: number | null;
  payback: number | null;
  provisional: boolean;
};

/** A dated event drawn behind the line. Facts with a date, not explanations —
 * the prose is where the page argues about cause. */
export type Marker = { at: string; label: string };

function HistoryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: HistoryRow }[];
}) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row || row.value === null) return null;
  return (
    <div className={`${card} min-w-[200px]`}>
      <div className="uppercase tracking-[0.14em] text-muted mb-1.5">
        {row.title}
        {row.provisional && " · provisorio"}
      </div>
      <div className="flex items-center gap-2.5 mt-[3px]">
        <span
          className="w-2 h-2 inline-block shrink-0"
          style={{ background: ACCENT }}
        />
        <span className="flex-1 text-muted">Rentabilidad bruta</span>
        <span className="font-semibold">{pct1(row.value)}</span>
      </div>
      {row.payback !== null && (
        <div className="flex items-center gap-2.5 mt-[3px]">
          <span className="w-2 h-2 inline-block shrink-0" />
          <span className="flex-1 text-muted">Repago</span>
          <span className="text-muted">{years(row.payback)}</span>
        </div>
      )}
    </div>
  );
}

export function HistoriaChart({
  title,
  rows,
  markers,
}: {
  title: string;
  rows: HistoryRow[];
  markers: Marker[];
}) {
  const values = rows
    .map((r) => r.value)
    .filter((v): v is number => v !== null);
  const { ticks, domain } = yAxis(0, Math.max(...values));
  const min = rows.reduce((a, b) =>
    b.value !== null && (a.value === null || b.value < a.value) ? b : a,
  );
  const last = rows[rows.length - 1];

  return (
    <>
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          {title}
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          {/* The three numbers as text, so the figure carries data even before
              recharts has measured a box to draw into. */}
          <span className="text-ink">Rentabilidad bruta anual</span> · Mínimo{" "}
          {min.value !== null && pct1(min.value)} ({min.title}) · Último dato{" "}
          {last.value !== null && pct1(last.value)} ({last.title})
        </p>
      </figcaption>

      <div className="h-[280px] sm:h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            accessibilityLayer
          >
            <CartesianGrid
              stroke={AXIS}
              strokeDasharray="2 3"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={tickStyle}
              axisLine={{ stroke: AXIS }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={44}
            />
            <YAxis
              width={52}
              domain={domain}
              ticks={ticks}
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              tickFormatter={pctAxis}
            />
            {markers.map((m) => (
              <ReferenceLine
                key={m.at}
                x={m.at}
                stroke={AXIS}
                strokeWidth={1}
                label={{
                  value: m.label,
                  position: "insideTopLeft",
                  fill: "var(--muted)",
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                }}
              />
            ))}
            <Tooltip
              cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
              isAnimationActive={false}
              content={(props) => <HistoryTooltip {...props} />}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={ACCENT}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3.5, fill: ACCENT, stroke: "var(--card)" }}
              isAnimationActive={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

// ── 2. The same series under three exchange rates ──────────────────────────

export type RateSeries = { id: string; label: string; color: string };

export type RateRow = { key: string; label: string; title: string } & Record<
  string,
  string | number | null
>;

function RateTooltip({
  active,
  payload,
  rates,
  hidden,
}: {
  active?: boolean;
  payload?: readonly { payload?: RateRow }[];
  rates: RateSeries[];
  hidden: Set<string>;
}) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  const shown = rates
    .filter((r) => !hidden.has(r.id) && typeof row[r.id] === "number")
    .map((r) => ({ ...r, value: row[r.id] as number }))
    .sort((a, b) => b.value - a.value);
  if (!shown.length) return null;
  return (
    <div className={`${card} min-w-[230px]`}>
      <div className="uppercase tracking-[0.14em] text-muted mb-1.5">
        {row.title}
      </div>
      {shown.map((r) => (
        <div key={r.id} className="flex items-center gap-2.5 mt-[3px]">
          <span
            className="w-2 h-2 inline-block shrink-0"
            style={{ background: r.color }}
          />
          <span className="flex-1 text-muted">{r.label}</span>
          <span className="font-medium">{pct1(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** The city's yield computed three times, once per exchange rate.
 *
 * The shaded band is the exchange control — the years the three rates were
 * three different numbers. Drawn rather than described because the point of the
 * figure is that the lines coincide outside it and fan out inside it, and a
 * band makes "outside" and "inside" visible without the reader having to know
 * the dates. */
export function TipoCambioChart({
  rows,
  rates,
  band,
}: {
  rows: RateRow[];
  rates: RateSeries[];
  /** First and last quarter of the exchange control, **as axis tick labels** —
   * recharts matches a categorical `ReferenceArea` against the axis's own
   * values, and a period key that isn't one of them collapses the band to the
   * left edge rather than erroring. `null` if it falls outside the series. */
  band: { from: string; to: string; label: string } | null;
}) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const all = rows.flatMap((r) =>
    rates.map((s) => r[s.id]).filter((v): v is number => typeof v === "number"),
  );
  const { ticks, domain } = yAxis(0, Math.max(...all));

  return (
    <>
      <div className="h-[280px] sm:h-[330px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            accessibilityLayer
          >
            <CartesianGrid
              stroke={AXIS}
              strokeDasharray="2 3"
              vertical={false}
            />
            {band && (
              <ReferenceArea
                x1={band.from}
                x2={band.to}
                fill="var(--muted)"
                fillOpacity={0.09}
                label={{
                  value: band.label,
                  position: "insideTopLeft",
                  fill: "var(--muted)",
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                }}
              />
            )}
            <XAxis
              dataKey="label"
              tick={tickStyle}
              axisLine={{ stroke: AXIS }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={44}
            />
            <YAxis
              width={52}
              domain={domain}
              ticks={ticks}
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              tickFormatter={pctAxis}
            />
            <Tooltip
              cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
              isAnimationActive={false}
              content={(props) => (
                <RateTooltip {...props} rates={rates} hidden={hidden} />
              )}
            />
            {rates.map((r) => (
              <Line
                key={r.id}
                type="monotone"
                dataKey={r.id}
                name={r.label}
                stroke={r.color}
                strokeWidth={1.75}
                dot={false}
                activeDot={{ r: 3, fill: r.color, stroke: "var(--card)" }}
                hide={hidden.has(r.id)}
                isAnimationActive={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <Legend
        className="mt-3"
        items={rates.map((r) => ({ id: r.id, label: r.label, color: r.color }))}
        hidden={hidden}
        onToggle={toggle}
      />
      <p className="font-mono text-micro text-muted mt-2 opacity-80">
        Toca un tipo de cambio de la lista para ocultarlo o volver a mostrarlo.
      </p>
    </>
  );
}

// ── 3. Price against yield, one point per barrio ───────────────────────────

export type Point = {
  id: string;
  label: string;
  /** Sale price, USD/m² — the x axis. */
  price: number;
  /** Gross yield, % — the y axis. */
  value: number;
  payback: number;
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
    <div className={`${card} min-w-[210px]`}>
      <div className="uppercase tracking-[0.14em] text-muted mb-1.5">
        {p.label}
      </div>
      <div className="flex items-center gap-2.5 mt-[3px]">
        <span className="flex-1 text-muted">Rentabilidad</span>
        <span className="font-semibold">{pct1(p.value)}</span>
      </div>
      <div className="flex items-center gap-2.5 mt-[3px]">
        <span className="flex-1 text-muted">Repago</span>
        <span className="text-muted">{years(p.payback)}</span>
      </div>
      <div className="flex items-center gap-2.5 mt-[3px]">
        <span className="flex-1 text-muted">Precio del m²</span>
        <span className="text-muted">
          US$ {p.price.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
        </span>
      </div>
    </div>
  );
}

/** Sale price on x, yield on y, one dot per barrio, and the fitted curve.
 *
 * The curve is the elasticity from the data module drawn back over its own
 * points — not a second model. It is a straight line in logs and therefore
 * bends here, which is the honest way to show it: the page's claim is about
 * proportions, and a straight line on linear axes would be a different and
 * weaker claim. */
export function DispersionChart({
  points,
  fit,
}: {
  points: Point[];
  /** The fitted curve, already evaluated by the server component — the client
   * never re-does the regression, so the drawn line and the quoted β cannot
   * drift apart. */
  fit: { price: number; value: number }[];
}) {
  const prices = points.map((p) => p.price);
  const values = points.map((p) => p.value);
  const x = tightAxis(Math.min(...prices), Math.max(...prices), 0.06, 5);
  const y = tightAxis(Math.min(...values), Math.max(...values), 0.08, 4);

  return (
    <div className="h-[300px] sm:h-[340px]">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart
          margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
          accessibilityLayer
        >
          <CartesianGrid stroke={AXIS} strokeDasharray="2 3" />
          <XAxis
            type="number"
            dataKey="price"
            name="Precio del m²"
            domain={x.domain}
            ticks={x.ticks}
            tick={tickStyle}
            axisLine={{ stroke: AXIS }}
            tickLine={false}
            tickFormatter={usdAxis}
            label={{
              value: "Precio de venta, US$/m²",
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
            dataKey="value"
            name="Rentabilidad"
            width={52}
            domain={y.domain}
            ticks={y.ticks}
            tick={tickStyle}
            axisLine={false}
            tickLine={false}
            tickFormatter={pctAxis}
          />
          <ZAxis range={[42, 42]} />
          <Tooltip
            cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
            isAnimationActive={false}
            content={(props) => <PointTooltip {...props} />}
          />
          {/* The fit first, so the barrios sit on top of it. */}
          <Scatter
            data={fit}
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

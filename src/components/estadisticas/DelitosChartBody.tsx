"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SegmentedControl } from "@/components/ui";
import { niceTicks } from "@/lib/svg-chart";

// The interactive halves of the two time figures on /estadisticas/delitos-caba.
// The `<figure>` shells — captions and source notes — stay in the server
// components that render these, and so does every formatted number: these take
// rows that are already shaped and already formatted, so an axis can never round
// a figure differently from the prose beside it.
//
//   HistoriaChart   ten years of the city series, one line per category, with a
//                   switch between "cada 1.000 habitantes" and the raw count.
//   HoraChart       what hour of the day each kind of crime happens at, as a
//                   share of its own day — which is the only way robos and
//                   hurtos, two series of very different size, fit on one axis.

const AXIS = "var(--line)";
const ACCENT = "var(--accent)";

const tickStyle = {
  fontSize: 11,
  fill: "var(--muted)",
  fontFamily: "var(--font-mono)",
} as const;

const card =
  "bg-card border border-line py-2 px-2.5 font-mono text-micro text-ink shadow-[0_2px_8px_rgba(0,0,0,0.08)]";

/** Drawn in this order, and coloured from the choropleth ramp so the lines
 * belong to the same visual system as the map further up the page. */
const SERIES = [
  { key: "total", label: "Todos", color: ACCENT },
  { key: "robos", label: "Robos", color: "var(--choro-6)" },
  { key: "hurtos", label: "Hurtos", color: "var(--choro-4)" },
  { key: "personas", label: "Contra las personas", color: "var(--choro-3)" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

function Legend({ of }: { of: readonly { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3 list-none p-0 m-0">
      {of.map((s) => (
        <li
          key={s.label}
          className="flex items-center gap-1.5 font-mono text-[11px] text-muted"
        >
          <span
            className="w-3 h-[3px] inline-block shrink-0"
            style={{ background: s.color }}
          />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

// ── 1. Ten years of the city ───────────────────────────────────────────────

/** One year. Every series carries both readings and both labels, so the switch
 * changes what is plotted without any of it being recomputed here. */
export type HistoriaRow = {
  year: number;
  rate: Record<SeriesKey, number>;
  count: Record<SeriesKey, number>;
  rateLabel: Record<SeriesKey, string>;
  countLabel: Record<SeriesKey, string>;
};

type Unit = "rate" | "count";

const UNITS: { value: Unit; label: string }[] = [
  { value: "rate", label: "cada 1.000" },
  { value: "count", label: "hechos" },
];

/** Recharts wants one flat object per point, so the selected unit is projected
 * onto the series keys just before it is handed over. */
type Plotted = { year: number; row: HistoriaRow } & Record<SeriesKey, number>;

function HistoriaTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: readonly { payload?: Plotted }[];
  unit: Unit;
}) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  const labels = unit === "rate" ? point.row.rateLabel : point.row.countLabel;
  return (
    <div className={`${card} min-w-[230px]`}>
      <div className="uppercase tracking-[0.14em] text-muted mb-1.5">
        {point.year}
      </div>
      {SERIES.map((s) => (
        <div key={s.key} className="flex items-center gap-2.5 mt-[3px]">
          <span
            className="w-2 h-2 inline-block shrink-0"
            style={{ background: s.color }}
          />
          <span className="flex-1 text-muted">{s.label}</span>
          <span className="font-semibold">{labels[s.key]}</span>
        </div>
      ))}
    </div>
  );
}

export function HistoriaChart({
  title,
  statRate,
  statCount,
  rows,
}: {
  title: string;
  /** The figures as text, one line per unit, so the page carries them in its
   * HTML before recharts has measured anything — and so the line under the
   * heading can never describe the other view. */
  statRate: React.ReactNode;
  statCount: React.ReactNode;
  rows: HistoriaRow[];
}) {
  const [unit, setUnit] = useState<Unit>("rate");

  const data: Plotted[] = rows.map((row) => ({
    year: row.year,
    row,
    ...(Object.fromEntries(
      SERIES.map((s) => [s.key, row[unit][s.key]]),
    ) as Record<SeriesKey, number>),
  }));

  const values = data.flatMap((d) => SERIES.map((s) => d[s.key]));
  const { ticks, lo, hi } = niceTicks(0, Math.max(...values), 5);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <figcaption className="min-w-0">
          <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
            {title}
          </h3>
          <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
            {unit === "rate" ? statRate : statCount}
          </p>
        </figcaption>
        <div className="flex flex-wrap gap-2">
          <SegmentedControl
            label="Unidad"
            options={UNITS}
            value={unit}
            onChange={setUnit}
          />
        </div>
      </div>

      <Legend of={SERIES} />

      <div className="h-[300px] sm:h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            accessibilityLayer
          >
            <CartesianGrid
              stroke={AXIS}
              strokeDasharray="2 3"
              vertical={false}
            />
            <XAxis
              dataKey="year"
              tick={tickStyle}
              axisLine={{ stroke: AXIS }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={20}
            />
            <YAxis
              width={unit === "count" ? 60 : 40}
              domain={[lo, hi]}
              ticks={ticks}
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) =>
                v >= 1000 ? `${v / 1000} k` : v.toLocaleString("es-AR")
              }
            />
            <Tooltip
              cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
              isAnimationActive={false}
              content={(props) => <HistoriaTooltip {...props} unit={unit} />}
            />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: s.color, stroke: "var(--card)" }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

// ── 2. What time of day ────────────────────────────────────────────────────

/** One hour of the day. Each value is that hour's share of its own category's
 * day, as a percentage — so the two categories are comparable in shape even
 * though one is three times the size of the other. */
export type HoraRow = {
  hour: number;
  label: string;
  robos: number;
  hurtos: number;
  personas: number;
};

const HORA_SERIES = [
  { key: "robos", label: "Robos", color: "var(--choro-6)" },
  { key: "hurtos", label: "Hurtos", color: "var(--choro-4)" },
  { key: "personas", label: "Contra las personas", color: "var(--choro-3)" },
] as const;

type HoraKey = (typeof HORA_SERIES)[number]["key"];

const ONE_DP = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function HoraTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: HoraRow }[];
}) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className={`${card} min-w-[230px]`}>
      <div className="uppercase tracking-[0.14em] text-muted mb-1.5">
        {row.label}
      </div>
      {HORA_SERIES.map((s) => (
        <div key={s.key} className="flex items-center gap-2.5 mt-[3px]">
          <span
            className="w-2 h-2 inline-block shrink-0"
            style={{ background: s.color }}
          />
          <span className="flex-1 text-muted">{s.label}</span>
          <span className="font-semibold">{ONE_DP.format(row[s.key])} %</span>
        </div>
      ))}
    </div>
  );
}

export function HoraChart({
  title,
  stat,
  rows,
  /** The share an hour would carry if the day were flat, as a percentage.
   * Drawn as the reference the bars are read against — everything above it is
   * an hour that carries more than its share of the day. */
  flat,
}: {
  title: string;
  stat: React.ReactNode;
  rows: HoraRow[];
  flat: number;
}) {
  const [shown, setShown] = useState<HoraKey>("robos");
  const series = HORA_SERIES.find((s) => s.key === shown)!;
  const { ticks, lo, hi } = niceTicks(
    0,
    Math.max(...rows.flatMap((r) => HORA_SERIES.map((s) => r[s.key]))),
    5,
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <figcaption className="min-w-0">
          <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
            {title}
          </h3>
          <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
            {stat}
          </p>
        </figcaption>
        <div className="flex flex-wrap gap-2">
          <SegmentedControl
            label="Tipo de delito"
            options={HORA_SERIES.map((s) => ({
              value: s.key,
              label: s.key === "personas" ? "Personas" : s.label,
            }))}
            value={shown}
            onChange={setShown}
          />
        </div>
      </div>

      {/* One scale for all three, so switching shows a real difference in shape
          rather than three identically-tall pictures. */}
      <div className="h-[260px] sm:h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
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
              dataKey="hour"
              tick={tickStyle}
              axisLine={{ stroke: AXIS }}
              tickLine={false}
              interval={2}
              tickFormatter={(v: number) => `${v}`}
            />
            <YAxis
              width={36}
              domain={[lo, hi]}
              ticks={ticks}
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v} %`}
            />
            <ReferenceLine y={flat} stroke={AXIS} strokeWidth={1.5} />
            <Tooltip
              cursor={{ fill: "var(--accent-soft)" }}
              isAnimationActive={false}
              content={(props) => <HoraTooltip {...props} />}
            />
            <Bar
              dataKey={shown}
              fill={series.color}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { niceTicks } from "@/lib/svg-chart";

// The interactive halves of the two time-series figures on
// /estadisticas/historia-oferta-alquiler-caba. The `<figure>` shells — captions
// and source notes — stay in the server components that render these, and so
// does every number: these take rows that are already shaped and already
// formatted, so the axis and the tooltip can never round a figure differently
// from the prose beside them.
//
// Two charts, and the second one exists to check the first. `SerieChart` draws
// the supply series IDECBA publishes; `CoberturaChart` draws something IDECBA
// does not publish at all — how many barrios cleared its minimum listing count
// for a rent to be averaged, which we can only count because we parse every
// quarter of the price tables. They are different instruments reading the same
// market, and the argument of the page is that they agree.

const AXIS = "var(--line)";
const ACCENT = "var(--accent)";
const RAW = "var(--muted)";

const tickStyle = {
  fontSize: 11,
  fill: "var(--muted)",
  fontFamily: "var(--font-mono)",
} as const;

const markerLabel = {
  fill: "var(--muted)",
  fontSize: 10,
  fontFamily: "var(--font-mono)",
} as const;

const card =
  "bg-card border border-line py-2 px-2.5 font-mono text-micro text-ink shadow-[0_2px_8px_rgba(0,0,0,0.08)]";

/** "2026-07" → "2026". The axis of a thirteen-year monthly series is a run of
 * years; the month is in the tooltip, where it belongs. */
const yearOf = (period: string) => period.slice(0, 4);

// ── 1. The city's advertised offer, month by month ─────────────────────────

/** One month. `units` and `avg` are plotted; the three strings beside them are
 * what the tooltip prints, formatted upstream by the data module. */
export type SerieRow = {
  period: string;
  title: string;
  units: number;
  unitsLabel: string;
  m2Label: string;
  /** The twelve-month mean, `null` for the first eleven months. */
  avg: number | null;
  avgLabel: string | null;
  provisional: boolean;
};

/** A dated fact drawn behind the series. A fact with a date, never a cause —
 * the page argues about cause in prose, where the argument can be qualified. */
export type Marker = { at: string; label: string };

/** The stretch of months collected from a different listings provider, drawn as
 * a shaded band. Shaded rather than footnoted because the point is that
 * everything inside it is on a different footing from everything outside, and a
 * band says that at the moment the reader's eye is on those months. */
export type Band = { from: string; to: string; label: string };

function SerieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: SerieRow }[];
}) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className={`${card} min-w-[220px]`}>
      <div className="uppercase tracking-[0.14em] text-muted mb-1.5">
        {row.title}
        {row.provisional && " · provisorio"}
      </div>
      <div className="flex items-center gap-2.5 mt-[3px]">
        <span
          className="w-2 h-2 inline-block shrink-0"
          style={{ background: RAW }}
        />
        <span className="flex-1 text-muted">En el mes</span>
        <span className="font-semibold">{row.unitsLabel}</span>
      </div>
      <div className="flex items-center gap-2.5 mt-[3px]">
        <span className="w-2 h-2 inline-block shrink-0" />
        <span className="flex-1 text-muted">Superficie</span>
        <span className="text-muted">{row.m2Label}</span>
      </div>
      {row.avgLabel && (
        <div className="flex items-center gap-2.5 mt-[3px]">
          <span
            className="w-2 h-2 inline-block shrink-0"
            style={{ background: ACCENT }}
          />
          <span className="flex-1 text-muted">Promedio 12 meses</span>
          <span className="font-semibold">{row.avgLabel}</span>
        </div>
      )}
    </div>
  );
}

export function SerieChart({
  title,
  stat,
  rows,
  markers,
  band,
}: {
  title: string;
  /** The figures as text, so the page carries them even before recharts has
   * measured a box to draw into. */
  stat: React.ReactNode;
  rows: SerieRow[];
  markers: Marker[];
  band: Band | null;
}) {
  const { ticks, lo, hi } = niceTicks(0, Math.max(...rows.map((r) => r.units)));
  // One tick per January, thinned by recharts where they don't fit. Explicit
  // rather than left to `interval`, which would otherwise land ticks on
  // arbitrary months and print the same year twice.
  const xTicks = rows
    .filter((r) => r.period.endsWith("-01"))
    .map((r) => r.period);

  return (
    <>
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          {title}
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          {stat}
        </p>
      </figcaption>

      <div className="h-[300px] sm:h-[360px]">
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
                  ...markerLabel,
                }}
              />
            )}
            <XAxis
              dataKey="period"
              ticks={xTicks}
              tickFormatter={yearOf}
              tick={tickStyle}
              axisLine={{ stroke: AXIS }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={26}
            />
            <YAxis
              width={52}
              domain={[lo, hi]}
              ticks={ticks}
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => v.toLocaleString("es-AR")}
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
                  ...markerLabel,
                }}
              />
            ))}
            <Tooltip
              cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
              isAnimationActive={false}
              content={(props) => <SerieTooltip {...props} />}
            />
            {/* The raw months first and thin, so the smoothed line reads as the
                summary of them rather than as a rival series. */}
            <Line
              type="linear"
              dataKey="units"
              stroke={RAW}
              strokeWidth={1}
              strokeOpacity={0.45}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="avg"
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

// ── 2. How many barrios could be priced at all ─────────────────────────────

export type CoberturaRow = {
  period: string;
  /** "2023 T3" — the axis label and the tooltip's heading. */
  title: string;
  withData: number;
  total: number;
};

function CoberturaTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: CoberturaRow }[];
}) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className={`${card} min-w-[210px]`}>
      <div className="uppercase tracking-[0.14em] text-muted mb-1.5">
        {row.title}
      </div>
      <div className="flex items-center gap-2.5 mt-[3px]">
        <span
          className="w-2 h-2 inline-block shrink-0"
          style={{ background: ACCENT }}
        />
        <span className="flex-1 text-muted">Con precio publicado</span>
        <span className="font-semibold">
          {row.withData} de {row.total}
        </span>
      </div>
      <div className="flex items-center gap-2.5 mt-[3px]">
        <span className="w-2 h-2 inline-block shrink-0" />
        <span className="flex-1 text-muted">Sin avisos suficientes</span>
        <span className="text-muted">{row.total - row.withData}</span>
      </div>
    </div>
  );
}

/** Bars, not a line: this is a count of barrios in a quarter, and the gap
 * between one bar and the next is a quarter in which the number was not
 * measured continuously. A line would draw an interpolation nobody observed. */
export function CoberturaChart({
  rows,
  markers,
}: {
  rows: CoberturaRow[];
  markers: Marker[];
}) {
  const total = rows[0]?.total ?? 48;
  // Quarters of the whole, so the reader can see "about half" without doing
  // arithmetic against an axis that stops at a round 50.
  const ticks = [0, total / 4, total / 2, (total * 3) / 4, total];

  return (
    <div className="h-[260px] sm:h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          accessibilityLayer
        >
          <CartesianGrid stroke={AXIS} strokeDasharray="2 3" vertical={false} />
          <XAxis
            dataKey="period"
            tickFormatter={yearOf}
            tick={tickStyle}
            axisLine={{ stroke: AXIS }}
            tickLine={false}
            ticks={rows
              .filter((r) => r.period.endsWith("Q1"))
              .map((r) => r.period)}
            interval="preserveStartEnd"
            minTickGap={26}
          />
          <YAxis
            width={52}
            domain={[0, total]}
            ticks={ticks}
            tick={tickStyle}
            axisLine={false}
            tickLine={false}
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
                ...markerLabel,
              }}
            />
          ))}
          <Tooltip
            cursor={{ fill: "var(--accent-soft)" }}
            isAnimationActive={false}
            content={(props) => <CoberturaTooltip {...props} />}
          />
          <Bar dataKey="withData" fill={ACCENT} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

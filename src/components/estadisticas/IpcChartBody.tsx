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
import { Select } from "@/components/ui";
import { niceTicks } from "@/lib/svg-chart";

// The interactive half of a statistics figure: the heading, the stat line, the
// year picker a monthly chart carries, and the plot. The `<figure>` shell around
// it — the caption and the source note — stays in the server component that
// renders this (./IpcViviendaChart.tsx).
//
// recharts, like the signed-in app's charts, so a hovered month gives its exact
// figure instead of a pixel the reader has to eyeball against an axis. It costs
// a client bundle on a page that is otherwise static, which is the trade: six
// years of monthly data is dense enough that a static picture can only show the
// shape, and the shape is not the number anyone came for.
//
// ── Why the header is in here rather than in the server component ──────────
// The stat line quotes the series the plot is *currently* drawing, and on a
// monthly chart that changes when the reader picks another year. Rendering it
// beside the picker is what keeps the two from contradicting each other. Nothing
// is lost to search: a client component is still server-rendered, so the initial
// HTML carries the heading, the picker and the opening year's figures — only the
// plot itself waits for the browser, because recharts has to measure a box
// before it can draw into one.

const AXIS = "var(--line)";
const ACCENT = "var(--accent)";

const tickStyle = {
  fontSize: 11,
  fill: "var(--muted)",
  fontFamily: "var(--font-mono)",
} as const;

/** Argentine decimal comma, one place. The axis drops the unit — it's in the
 * note under every figure, and five ticks all saying "%" is noise. */
const decimal = (v: number) =>
  (Math.round(v * 10) / 10).toString().replace(".", ",");

const percent = (v: number) => `${v.toFixed(1).replace(".", ",")} %`;

/** One plotted point. `label` goes on the axis, `title` in the tooltip — see the
 * note where these are built, in ./IpcViviendaChart.tsx. */
export type Row = {
  key: string;
  label: string;
  title: string;
  value: number;
};

export type Range = { min: number; max: number };

/** Shared axis setup. The ticks are computed rather than left to recharts, so
 * the gridlines land on round numbers and zero is always one of them — on a
 * variation chart, zero is the line every value is read against. */
function yAxis({ min, max }: Range) {
  const { ticks, lo, hi } = niceTicks(min, max, 4);
  return { ticks, domain: [lo, hi] as [number, number] };
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: Row }[];
}) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className="bg-card border border-line py-2 px-2.5 font-mono text-micro text-ink shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <div className="uppercase tracking-[0.14em] text-muted mb-1.5">
        {row.title}
      </div>
      <div className="flex items-center gap-2.5">
        <span
          className="w-2 h-2 inline-block shrink-0"
          style={{ background: ACCENT }}
        />
        <span className="font-medium">{percent(row.value)}</span>
      </div>
    </div>
  );
}

/** "junio de 2026" → "junio 2026", for the compact stat line. */
const shortTitle = (title: string) => title.replace(" de ", " ");

/** The figure's heading: its title, the three numbers that summarise whatever
 * the plot is showing, and — on a monthly chart — the year picker, sitting in
 * the top-right corner beside the title.
 *
 * The numbers are here rather than left to the plot because the plot is drawn in
 * the browser: without them the page would carry no figures at all as text, for
 * a crawler or for a reader whose JavaScript never arrives. They're also the
 * three a reader wants first. */
function Header({
  title,
  rows,
  action,
}: {
  title: string;
  rows: Row[];
  action?: React.ReactNode;
}) {
  const max = rows.reduce((a, b) => (b.value > a.value ? b : a));
  const min = rows.reduce((a, b) => (b.value < a.value ? b : a));
  const last = rows[rows.length - 1];

  return (
    <figcaption className="mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        {/* An h3, not a paragraph: fourteen figures is most of this page, and
            their titles are what a reader scanning the table of contents — or a
            search engine reading the outline — is looking for. */}
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          {title}
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          Máximo {percent(max.value)} ({shortTitle(max.title)}) · Mínimo{" "}
          {percent(min.value)} ({shortTitle(min.title)}) · Último dato{" "}
          {percent(last.value)} ({shortTitle(last.title)})
        </p>
      </div>
      {action && <div className="flex-none">{action}</div>}
    </figcaption>
  );
}

/** The interannual line: the whole series, one point per month. */
export function InteranualChart({
  title,
  rows,
  range,
}: {
  title: string;
  rows: Row[];
  range: Range;
}) {
  const { ticks, domain } = yAxis(range);
  return (
    <>
      <Header title={title} rows={rows} />
      <div className="h-[260px] sm:h-[300px]">
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
              // Wider than it looks like it needs to be: `minTickGap` is the
              // gap between tick *positions*, and it knows nothing about the
              // width of the text hung off them. "ene 21" is about 42px at this
              // size, so anything under ~50 prints labels that overlap.
              minTickGap={52}
            />
            <YAxis
              width={44}
              domain={domain}
              ticks={ticks}
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              tickFormatter={decimal}
            />
            <Tooltip
              cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
              isAnimationActive={false}
              content={(props) => <ChartTooltip {...props} />}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={ACCENT}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3.5, fill: ACCENT, stroke: "var(--card)" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/** The monthly columns, one calendar year at a time, with the year picker.
 *
 * A year at a time because six years of months is seventy-eight columns three
 * pixels wide, which is a texture rather than a chart — you cannot point at
 * March 2024 in it, and pointing at a month is this figure's entire job.
 *
 * The y axis is shared by all seven regions *within the chosen year* (the server
 * passes one range per year), so the regions can be read against each other,
 * which is the comparison a single year invites. It is deliberately not shared
 * across years: this division moved by tenths of a point in 2020 and by forty in
 * 2024, and one axis for both would draw four of the seven years as a flat line
 * along the bottom. The axis is labelled and the tooltip is exact, so switching
 * year says what it changed. */
export function MensualChart({
  title,
  years,
  initialYear,
  byYear,
  ranges,
  label,
}: {
  title: string;
  years: number[];
  initialYear: number;
  /** Rows per year — every year is sent, so switching is instant and needs no
   * request. Seven years of twelve numbers is smaller than one chart's markup. */
  byYear: Record<number, Row[]>;
  ranges: Record<number, Range>;
  /** Accessible name for the picker. Each figure has its own, because "Año"
   * alone would give a screen reader seven identical controls. */
  label: string;
}) {
  const [year, setYear] = useState(initialYear);
  const rows = byYear[year] ?? [];
  const { ticks, domain } = yAxis(ranges[year] ?? { min: 0, max: 0 });

  return (
    <>
      <Header
        title={title}
        rows={rows}
        action={
          <Select
            value={year}
            aria-label={label}
            onChange={(e) => setYear(Number(e.target.value))}
            className="py-1 px-2.5 pr-7 text-xs"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        }
      />

      <div className="h-[240px] sm:h-[280px]">
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
              dataKey="label"
              tick={tickStyle}
              axisLine={{ stroke: AXIS }}
              tickLine={false}
            />
            <YAxis
              width={44}
              domain={domain}
              ticks={ticks}
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              tickFormatter={decimal}
            />
            {/* The baseline, solid over the dashed grid: a month can fall below
                it, and which side of zero a column sits on is the first thing to
                read off this chart. */}
            <ReferenceLine y={0} stroke={AXIS} />
            <Tooltip
              cursor={{ fill: "var(--line)", fillOpacity: 0.3 }}
              isAnimationActive={false}
              content={(props) => <ChartTooltip {...props} />}
            />
            <Bar
              dataKey="value"
              fill={ACCENT}
              maxBarSize={38}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

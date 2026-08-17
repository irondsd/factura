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
import { Legend } from "@/components/charts/primitives";
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

/** Axis tick: Argentine decimal comma, and the unit kept. Four or five ticks is
 * few enough that repeating "%" costs nothing, and a bare "300" beside a series
 * that could plausibly be an index level is one more thing to have to work out. */
const decimal = (v: number) =>
  `${(Math.round(v * 10) / 10).toString().replace(".", ",")} %`;

const percent = (v: number) => `${v.toFixed(1).replace(".", ",")} %`;

/** One plotted point. `label` goes on the axis, `title` in the tooltip — see the
 * note where these are built, in ./IpcViviendaChart.tsx.
 *
 * Every row carries *both* measures for its month, not just the one its chart
 * draws: the tooltip shows the pair, so a reader pointing at July 2024 sees the
 * 6,0 % the month moved and the 306,6 % the year did, together, and cannot take
 * one for the other. `value` is whichever of the two this chart plots.
 * `interanual` is absent for the first twelve months of the dataset, which have
 * no year-earlier month to compare against. */
export type Row = {
  key: string;
  label: string;
  title: string;
  value: number;
  mensual: number;
  interanual?: number;
};

export type Range = { min: number; max: number };

/** Shared axis setup. The ticks are computed rather than left to recharts, so
 * the gridlines land on round numbers and zero is always one of them — on a
 * variation chart, zero is the line every value is read against. */
function yAxis({ min, max }: Range) {
  const { ticks, lo, hi } = niceTicks(min, max, 4);
  return { ticks, domain: [lo, hi] as [number, number] };
}

/** The name of what is being plotted, printed in the tooltip and at the head of
 * the stat line.
 *
 * Not decoration. An interannual reading of "306,6 %" against "julio de 2024",
 * with nothing saying which measure it is, reads as a monthly figure — and a
 * monthly figure of 306 % is absurd enough that a reader will conclude the chart
 * is broken rather than that they misread it. The measure travels with every
 * number this component prints. */
const MEASURE = {
  interanual: "Variación interanual",
  mensual: "Variación mensual",
} as const;

export type Measure = keyof typeof MEASURE;

/** One line of the tooltip. The measure the chart is drawing gets the filled
 * swatch and the heavier type; the other is there for context and is dressed to
 * say so. */
function TipRow({
  name,
  value,
  plotted,
}: {
  name: string;
  value: number;
  plotted: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 mt-[3px]">
      <span
        className="w-2 h-2 inline-block shrink-0"
        style={
          plotted
            ? { background: ACCENT }
            : { boxShadow: `inset 0 0 0 1px ${ACCENT}` }
        }
      />
      <span className="flex-1 text-muted">{name}</span>
      <span className={plotted ? "font-semibold" : "text-muted"}>
        {percent(value)}
      </span>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  measure,
}: {
  active?: boolean;
  payload?: readonly { payload?: Row }[];
  measure: Measure;
}) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className="bg-card border border-line py-2 px-2.5 font-mono text-micro text-ink shadow-[0_2px_8px_rgba(0,0,0,0.08)] min-w-[210px]">
      <div className="uppercase tracking-[0.14em] text-muted mb-1.5">
        {row.title}
      </div>
      <TipRow
        name={MEASURE.mensual}
        value={row.mensual}
        plotted={measure === "mensual"}
      />
      {/* Dropped rather than shown as a blank for the dataset's first year:
          there is no 2019 here to compare 2020 against, and an em dash beside a
          measure invites the reader to wonder which months are missing. */}
      {row.interanual !== undefined && (
        <TipRow
          name={MEASURE.interanual}
          value={row.interanual}
          plotted={measure === "interanual"}
        />
      )}
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
  measure,
  action,
}: {
  title: string;
  rows: Row[];
  measure: Measure;
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
          <span className="text-ink">{MEASURE[measure]}</span> · Máximo{" "}
          {percent(max.value)} ({shortTitle(max.title)}) · Mínimo{" "}
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
      <Header title={title} rows={rows} measure="interanual" />
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
              width={58}
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
              content={(props) => (
                <ChartTooltip {...props} measure="interanual" />
              )}
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

/** One region's line in the comparison chart. */
export type RegionSeries = { id: string; label: string; color: string };

/** A row of the comparison chart: one month, every region's value on it. */
export type MultiRow = { key: string; label: string; title: string } & Record<
  string,
  string | number
>;

/** Tooltip for the comparison chart: every visible region for the hovered
 * month, ranked. Ranked rather than kept in a fixed order because the reason to
 * hover a six-line chart is to find out who is on top *at that moment*, and
 * making the reader do that by matching colours to a legend is making them do
 * the chart's job. */
function MultiTooltip({
  active,
  payload,
  regions,
  hidden,
}: {
  active?: boolean;
  payload?: readonly { payload?: MultiRow }[];
  regions: RegionSeries[];
  hidden: Set<string>;
}) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  const rows = regions
    .filter((r) => !hidden.has(r.id) && typeof row[r.id] === "number")
    .map((r) => ({ ...r, value: row[r.id] as number }))
    .sort((a, b) => b.value - a.value);
  if (rows.length === 0) return null;

  return (
    <div className="bg-card border border-line py-2 px-2.5 font-mono text-micro text-ink shadow-[0_2px_8px_rgba(0,0,0,0.08)] min-w-[220px]">
      <div className="uppercase tracking-[0.14em] text-muted mb-1.5">
        {row.title} · variación interanual
      </div>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-2.5 mt-[3px]">
          <span
            className="w-2 h-2 inline-block shrink-0"
            style={{ background: r.color }}
          />
          <span className="flex-1 text-muted">{r.label}</span>
          <span className="font-medium">{percent(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** The six regions on one pair of axes, as interannual rates.
 *
 * Interannual and not the accumulated index, which is what "since 2020" would
 * literally want: see `multiple` in the data module for why that series can't be
 * drawn over this span. Interannual is also the measure the rest of the page is
 * in, so the lines here can be read against the per-region charts above.
 *
 * The legend toggles. Six lines that share an arc — they all spike in 2024 —
 * are genuinely hard to follow at the crossings, and being able to drop four of
 * them is worth more than any amount of colour tuning. It doubles as the
 * accommodation for a reader who can't separate the colours at all. */
export function ComparacionChart({
  rows,
  regions,
  range,
}: {
  rows: MultiRow[];
  regions: RegionSeries[];
  range: Range;
}) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const { ticks, domain } = yAxis(range);

  return (
    <>
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
            <XAxis
              dataKey="label"
              tick={tickStyle}
              axisLine={{ stroke: AXIS }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={52}
            />
            <YAxis
              width={58}
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
              content={(props) => (
                <MultiTooltip {...props} regions={regions} hidden={hidden} />
              )}
            />
            {regions.map((r) => (
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
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <Legend
        className="mt-3"
        items={regions.map((r) => ({
          id: r.id,
          label: r.label,
          color: r.color,
        }))}
        hidden={hidden}
        onToggle={toggle}
      />
      <p className="font-mono text-micro text-muted mt-2 opacity-80">
        Toca una región de la lista para ocultarla o volver a mostrarla.
      </p>
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
        measure="mensual"
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
              width={58}
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
              content={(props) => <ChartTooltip {...props} measure="mensual" />}
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

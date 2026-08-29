"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

// The interactive halves of the figures on
// /estadisticas/escrituras-provincia-buenos-aires. The `<figure>` shells —
// captions, source notes, and every formatted number — stay in the server
// components that render these: these take rows that are already shaped and
// already formatted, so an axis can never round a figure differently from the
// prose beside it.
//
//   HistoriaChart   the spine — 258 months of deeds, with a switch between the
//                   twelve-month rolling total and the raw monthly count.
//   AnualChart      the same series as one bar per calendar year.
//   HipotecasChart  how much of the market runs on credit, over time.
//   EstacionalidadChart  the average calendar shape of a year.
//   MontoChart      the average declared value of a deed, in dollars.
//
// ── The one decision that shapes four of the five ─────────────────────────
// This series has a season so strong it overwhelms everything else in it:
// December is the peak of every year and January the trough of every year, by
// roughly four to one. Drawn raw and monthly it is a picket fence, and any
// month-on-month reading of it reports Christmas as a boom.
//
// So the default view of the spine is the twelve-month rolling total, not the
// month; the mortgage figure divides two rolling sums rather than two months;
// and `EstacionalidadChart` exists so a reader who wants the monthly view knows
// what they are looking at before they switch to it.

const AXIS = "var(--line)";
const ACCENT = "var(--accent)";
/** For the second series in a two-series figure, and for the bars a chart
 * needs to hold back — a partial year, a month that is still moving. */
const MUTED_BAR = "var(--choro-3)";
const DEEP = "var(--choro-6)";

const tickStyle = {
  fontSize: 11,
  fill: "var(--muted)",
  fontFamily: "var(--font-mono)",
} as const;

const card =
  "bg-card border border-line py-2 px-2.5 font-mono text-micro text-ink shadow-[0_2px_8px_rgba(0,0,0,0.08)]";

/** "2026-06" → "2026". Twenty-one years of months is a run of years on an
 * axis; the month belongs in the tooltip. */
const yearOf = (period: string) => period.slice(0, 4);

/** Januaries, so the axis lands on year boundaries however wide it is drawn. */
const xTicksOf = (rows: { period: string }[]) =>
  rows.filter((r) => r.period.endsWith("-01")).map((r) => r.period);

/** Thousands separators on an axis, abbreviated past ten thousand: the rolling
 * view runs to 148.641 and the raw labels would be wider than the plot. */
const axisCount = (v: number) =>
  v >= 10_000
    ? `${(v / 1000).toLocaleString("es-AR", { maximumFractionDigits: 0 })} mil`
    : v.toLocaleString("es-AR");

function Head({
  title,
  stat,
  children,
}: {
  title: string;
  stat: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          {title}
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          {stat}
        </p>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

function Row({
  label,
  value,
  color,
  strong,
}: {
  label: string;
  value: string;
  color?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 mt-[3px]">
      <span
        className="w-2 h-2 inline-block shrink-0"
        style={color ? { background: color } : undefined}
      />
      <span className="flex-1 text-muted">{label}</span>
      <span className={strong ? "font-semibold" : "text-muted"}>{value}</span>
    </div>
  );
}

function TipShell({
  title,
  note,
  width = 220,
  children,
}: {
  title: string;
  note?: string | null;
  width?: number;
  children: React.ReactNode;
}) {
  return (
    <div className={card} style={{ minWidth: width }}>
      <div className="uppercase tracking-[0.14em] text-muted mb-1.5">
        {title}
      </div>
      {children}
      {note && (
        <div className="text-muted mt-2 pt-1.5 border-t border-line normal-case leading-[1.5]">
          {note}
        </div>
      )}
    </div>
  );
}

// ── 1. The spine ──────────────────────────────────────────────────────────

/** One month. `rolling` is `null` for the first eleven, which have no twelve
 * months behind them. The labels are what the tooltip prints. */
export type HistoriaRow = {
  period: string;
  title: string;
  mensual: number;
  mensualLabel: string;
  rolling: number | null;
  rollingLabel: string | null;
  /** The source's own footnote, or the provisional mark, spelled out. */
  note: string | null;
};

type View = "rolling" | "mensual";

const VIEWS: { value: View; label: string }[] = [
  { value: "rolling", label: "12 meses" },
  { value: "mensual", label: "Mensual" },
];

function HistoriaTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: HistoriaRow }[];
}) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <TipShell title={row.title} note={row.note}>
      <Row label="En el mes" value={row.mensualLabel} color={ACCENT} strong />
      {row.rollingLabel && (
        <Row label="Últimos 12 meses" value={row.rollingLabel} />
      )}
    </TipShell>
  );
}

export function HistoriaChart({
  title,
  statRolling,
  statMensual,
  rows,
}: {
  title: string;
  statRolling: React.ReactNode;
  statMensual: React.ReactNode;
  rows: HistoriaRow[];
}) {
  // The rolling total first. The monthly series is the raw data and it is one
  // click away, but as a *curve* its dominant feature is December — the reader
  // who wants to know whether the market is moving is asked to subtract a
  // sawtooth by eye, and nobody can.
  const [view, setView] = useState<View>("rolling");

  const shown = useMemo(
    () => (view === "rolling" ? rows.filter((r) => r.rolling !== null) : rows),
    [view, rows],
  );
  const values = shown.map((r) =>
    view === "rolling" ? (r.rolling as number) : r.mensual,
  );
  const { ticks, lo, hi } = niceTicks(0, Math.max(...values), 5);

  return (
    <>
      <Head title={title} stat={view === "rolling" ? statRolling : statMensual}>
        <SegmentedControl
          label="Vista"
          options={VIEWS}
          value={view}
          onChange={setView}
        />
      </Head>

      <div className="h-[300px] sm:h-[370px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={shown}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            accessibilityLayer
          >
            <defs>
              <linearGradient id="escrituras-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.22} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke={AXIS}
              strokeDasharray="2 3"
              vertical={false}
            />
            <XAxis
              dataKey="period"
              ticks={xTicksOf(shown)}
              tickFormatter={yearOf}
              tick={tickStyle}
              axisLine={{ stroke: AXIS }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              // Wide enough for "150 mil" on one line: at 54 the label wraps
              // and the tick reads as two stacked words.
              width={64}
              domain={[lo, hi]}
              ticks={ticks}
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              tickFormatter={axisCount}
            />
            <Tooltip
              cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
              isAnimationActive={false}
              content={(props) => <HistoriaTooltip {...props} />}
            />
            <Area
              type="monotone"
              dataKey={view}
              stroke={ACCENT}
              strokeWidth={2}
              fill="url(#escrituras-fill)"
              dot={false}
              activeDot={{ r: 3.5, fill: ACCENT, stroke: "var(--card)" }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

// ── 2. Year by year ───────────────────────────────────────────────────────

export type AnualRow = {
  year: number;
  compraventas: number;
  hipotecas: number;
  compraventasLabel: string;
  hipotecasLabel: string;
  shareLabel: string;
  /** False for the year still running, which is drawn held back and is not
   * part of any "highest year" claim the page makes. */
  complete: boolean;
  note: string | null;
};

function AnualTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: AnualRow }[];
}) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <TipShell title={String(row.year)} note={row.note} width={240}>
      <Row
        label="Compraventas"
        value={row.compraventasLabel}
        color={row.complete ? ACCENT : MUTED_BAR}
        strong
      />
      <Row label="Con hipoteca" value={row.hipotecasLabel} />
      <Row label="Parte con crédito" value={row.shareLabel} />
    </TipShell>
  );
}

export function AnualChart({
  title,
  stat,
  rows,
  /** The average of the complete years, drawn as the line the bars are read
   * against. */
  average,
}: {
  title: string;
  stat: React.ReactNode;
  rows: AnualRow[];
  average: number;
}) {
  const { ticks, lo, hi } = niceTicks(
    0,
    Math.max(...rows.map((r) => r.compraventas)),
    5,
  );

  return (
    <>
      <Head title={title} stat={stat} />

      <div className="h-[280px] sm:h-[330px]">
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
              dataKey="year"
              tick={tickStyle}
              axisLine={{ stroke: AXIS }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={14}
            />
            <YAxis
              // Wide enough for "150 mil" on one line: at 54 the label wraps
              // and the tick reads as two stacked words.
              width={64}
              domain={[lo, hi]}
              ticks={ticks}
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              tickFormatter={axisCount}
            />
            <ReferenceLine y={average} stroke={AXIS} strokeWidth={1.5} />
            <Tooltip
              cursor={{ fill: "var(--accent-soft)" }}
              isAnimationActive={false}
              content={(props) => <AnualTooltip {...props} />}
            />
            <Bar dataKey="compraventas" isAnimationActive={false}>
              {rows.map((r) => (
                <Cell
                  key={r.year}
                  fill={r.complete ? ACCENT : MUTED_BAR}
                  fillOpacity={r.complete ? 1 : 0.55}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

// ── 3. How much of the market runs on credit ──────────────────────────────

export type HipotecaRow = {
  period: string;
  title: string;
  /** Twelve-month hipotecas over twelve-month compraventas, as a percentage.
   * Rolling on both legs: April 2020 alone would read 300 %. */
  share: number | null;
  shareLabel: string | null;
  hipotecas: number;
  hipotecasLabel: string;
  note: string | null;
};

type HipView = "share" | "hipotecas";

const HIP_VIEWS: { value: HipView; label: string }[] = [
  { value: "share", label: "Parte del mercado" },
  { value: "hipotecas", label: "Hipotecas por mes" },
];

function HipotecaTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: HipotecaRow }[];
}) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <TipShell title={row.title} note={row.note} width={250}>
      {row.shareLabel && (
        <Row
          label="Con hipoteca, 12 meses"
          value={row.shareLabel}
          color={DEEP}
          strong
        />
      )}
      <Row label="Hipotecas en el mes" value={row.hipotecasLabel} />
    </TipShell>
  );
}

export function HipotecasChart({
  title,
  statShare,
  statCount,
  rows,
}: {
  title: string;
  statShare: React.ReactNode;
  statCount: React.ReactNode;
  rows: HipotecaRow[];
}) {
  const [view, setView] = useState<HipView>("share");
  const shown = useMemo(
    () => (view === "share" ? rows.filter((r) => r.share !== null) : rows),
    [view, rows],
  );
  const { ticks, lo, hi } = niceTicks(
    0,
    Math.max(
      ...shown.map((r) =>
        view === "share" ? (r.share as number) : r.hipotecas,
      ),
    ),
    5,
  );

  return (
    <>
      <Head title={title} stat={view === "share" ? statShare : statCount}>
        <SegmentedControl
          label="Vista"
          options={HIP_VIEWS}
          value={view}
          onChange={setView}
        />
      </Head>

      <div className="h-[280px] sm:h-[330px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={shown}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            accessibilityLayer
          >
            <CartesianGrid
              stroke={AXIS}
              strokeDasharray="2 3"
              vertical={false}
            />
            <XAxis
              dataKey="period"
              ticks={xTicksOf(shown)}
              tickFormatter={yearOf}
              tick={tickStyle}
              axisLine={{ stroke: AXIS }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              width={view === "share" ? 44 : 64}
              domain={[lo, hi]}
              ticks={ticks}
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) =>
                view === "share" ? `${v} %` : axisCount(v)
              }
            />
            <Tooltip
              cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
              isAnimationActive={false}
              content={(props) => <HipotecaTooltip {...props} />}
            />
            <Line
              type="monotone"
              dataKey={view}
              stroke={DEEP}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3.5, fill: DEEP, stroke: "var(--card)" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

// ── 4. The calendar shape of a year ───────────────────────────────────────

export type SeasonRow = {
  month: string;
  /** Short form for the axis: twelve full month names do not fit. */
  short: string;
  /** Average share of the year, as a percentage. */
  share: number;
  shareLabel: string;
  /** How the month compares with an even twelfth, spelled out. */
  vsFlat: string;
};

function SeasonTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: SeasonRow }[];
}) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <TipShell title={row.month} width={210}>
      <Row label="Del año" value={row.shareLabel} color={ACCENT} strong />
      <Row label="Contra un mes parejo" value={row.vsFlat} />
    </TipShell>
  );
}

export function EstacionalidadChart({
  title,
  stat,
  rows,
  /** The share a month would carry if the year were flat, as a percentage.
   * Everything the bars mean is read against this line. */
  flat,
}: {
  title: string;
  stat: React.ReactNode;
  rows: SeasonRow[];
  flat: number;
}) {
  const { ticks, lo, hi } = niceTicks(
    0,
    Math.max(...rows.map((r) => r.share)),
    5,
  );

  return (
    <>
      <Head title={title} stat={stat} />

      <div className="h-[250px] sm:h-[290px]">
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
              dataKey="short"
              tick={tickStyle}
              axisLine={{ stroke: AXIS }}
              tickLine={false}
              interval={0}
            />
            <YAxis
              width={40}
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
              content={(props) => <SeasonTooltip {...props} />}
            />
            <Bar dataKey="share" isAnimationActive={false}>
              {rows.map((r) => (
                <Cell
                  key={r.short}
                  fill={r.share >= flat ? ACCENT : MUTED_BAR}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

// ── 5. What one deed is worth ─────────────────────────────────────────────

export type MontoRow = {
  period: string;
  title: string;
  usd: number | null;
  usdLabel: string | null;
  ars: number;
  arsLabel: string;
  note: string | null;
};

type Currency = "usd" | "ars";

const CURRENCIES: { value: Currency; label: string }[] = [
  { value: "usd", label: "US$" },
  { value: "ars", label: "$" },
];

function MontoTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: MontoRow }[];
}) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <TipShell title={row.title} note={row.note} width={240}>
      {row.usdLabel && (
        <Row
          label="Promedio en dólares"
          value={row.usdLabel}
          color={ACCENT}
          strong
        />
      )}
      <Row label="Promedio en pesos" value={row.arsLabel} />
    </TipShell>
  );
}

export function MontoChart({
  title,
  statUsd,
  statArs,
  rows,
}: {
  title: string;
  statUsd: React.ReactNode;
  statArs: React.ReactNode;
  rows: MontoRow[];
}) {
  // Dollars first, and it is not a preference: the peso series spans twenty-one
  // years of Argentine inflation, so as a curve it says only that Argentina has
  // inflation. The question this figure is asked — is a property changing hands
  // for more or less than it used to? — is one only the dollar view answers.
  const [currency, setCurrency] = useState<Currency>("usd");
  const shown = useMemo(
    () => (currency === "usd" ? rows.filter((r) => r.usd !== null) : rows),
    [currency, rows],
  );
  const { ticks, lo, hi } = niceTicks(
    0,
    Math.max(
      ...shown.map((r) => (currency === "usd" ? (r.usd as number) : r.ars)),
    ),
    5,
  );

  return (
    <>
      <Head title={title} stat={currency === "usd" ? statUsd : statArs}>
        <SegmentedControl
          label="Moneda"
          options={CURRENCIES}
          value={currency}
          onChange={setCurrency}
        />
      </Head>

      <div className="h-[280px] sm:h-[330px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={shown}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            accessibilityLayer
          >
            <CartesianGrid
              stroke={AXIS}
              strokeDasharray="2 3"
              vertical={false}
            />
            <XAxis
              dataKey="period"
              ticks={xTicksOf(shown)}
              tickFormatter={yearOf}
              tick={tickStyle}
              axisLine={{ stroke: AXIS }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              width={currency === "ars" ? 62 : 64}
              domain={[lo, hi]}
              ticks={ticks}
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) =>
                currency === "ars"
                  ? `${(v / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 0 })} M`
                  : axisCount(v)
              }
            />
            <Tooltip
              cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
              isAnimationActive={false}
              content={(props) => <MontoTooltip {...props} />}
            />
            <Line
              type="monotone"
              dataKey={currency}
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

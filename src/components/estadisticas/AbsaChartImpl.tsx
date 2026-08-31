"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
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

// The interactive halves of the figures on /estadisticas/aumento-absa-2026.
// The `<figure>` shells — captions, source notes and every formatted number —
// stay in the server components that render these. These take rows that are
// already shaped and already formatted, so an axis can never round a figure
// differently from the prose beside it.
//
//   TarifaChart      the staircase: what a cubic metre costs, month by month.
//   BrechaChart      the same series against general prices, two ways.
//
// ── Why both charts are step-shaped ──────────────────────────────────────
// A tariff is not a measurement that drifts; it is a value that holds flat for
// months and then jumps on the day a decree says so. Drawing it with recharts'
// default `monotone` interpolation would put a gentle slope between December
// and February and invite a reader to believe a bill rose gradually across
// January. It did not: it was one number, then another. Every series here that
// carries a tariff uses `type="stepAfter"`, and the IPC line — which really is
// a monthly measurement — uses `monotone`, so the two are visibly different
// kinds of thing before anybody reads the legend.

const AXIS = "var(--line)";
const ACCENT = "var(--accent)";
const IPC_LINE = "var(--choro-3)";
const DEEP = "var(--choro-6)";

const tickStyle = {
  fontSize: 11,
  fill: "var(--muted)",
  fontFamily: "var(--font-mono)",
} as const;

const card =
  "bg-card border border-line py-2 px-2.5 font-mono text-micro text-ink shadow-[0_2px_8px_rgba(0,0,0,0.08)]";

/** Januaries and Julys: the series is 21 months long, so a tick every six
 * months lands on round dates without crowding the axis on a phone. */
const xTicksOf = (rows: { period: string }[]) =>
  rows
    .filter((r) => r.period.endsWith("01") || r.period.endsWith("07"))
    .map((r) => r.period);

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
    <div className="flex items-center gap-2.5 mt-1">
      {color && (
        <span
          className="w-2 h-2 inline-block shrink-0"
          style={{ background: color }}
        />
      )}
      <span className="flex-1 text-muted">{label}</span>
      <span className={strong ? "font-semibold" : "font-medium"}>{value}</span>
    </div>
  );
}

// ── 1. What a cubic metre costs ───────────────────────────────────────────

export type TarifaRow = {
  period: string;
  title: string;
  vm: number;
  vmLabel: string;
  /** Set only on the months a decree took effect. */
  norm: string | null;
  /** Change against the previous step, pre-formatted. Null on the first. */
  changeLabel: string | null;
};

function TarifaTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: TarifaRow }[];
}) {
  const row = active ? payload?.[0]?.payload : null;
  if (!row) return null;
  return (
    <div className={card}>
      <div className="uppercase tracking-[0.14em] text-muted mb-1.5">
        {row.title}
      </div>
      <Row label="Valor del m³" value={row.vmLabel} color={ACCENT} strong />
      {row.changeLabel && (
        <Row label="Contra el valor anterior" value={row.changeLabel} />
      )}
      {row.norm && (
        <div className="mt-2 pt-1.5 border-t border-line text-muted max-w-[15rem]">
          {row.norm}
        </div>
      )}
    </div>
  );
}

export function TarifaChart({
  title,
  stat,
  rows,
}: {
  title: string;
  stat: React.ReactNode;
  rows: TarifaRow[];
}) {
  const { ticks, lo, hi } = niceTicks(0, Math.max(...rows.map((r) => r.vm)), 5);

  return (
    <>
      <Head title={title} stat={stat} />

      <div className="h-[260px] sm:h-[310px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={rows}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            accessibilityLayer
          >
            <defs>
              <linearGradient id="absa-vm" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.28} />
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
              ticks={xTicksOf(rows)}
              tickFormatter={(p: string) => p.slice(0, 4)}
              tick={tickStyle}
              axisLine={{ stroke: AXIS }}
              tickLine={false}
            />
            <YAxis
              width={64}
              domain={[lo, hi]}
              ticks={ticks}
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${v.toLocaleString("es-AR")}`}
            />
            <Tooltip
              cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
              isAnimationActive={false}
              content={(props) => <TarifaTooltip {...props} />}
            />
            <Area
              type="stepAfter"
              dataKey="vm"
              stroke={ACCENT}
              strokeWidth={2}
              fill="url(#absa-vm)"
              isAnimationActive={false}
              dot={false}
              activeDot={{
                r: 3,
                fill: "var(--card)",
                stroke: ACCENT,
                strokeWidth: 1.5,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

// ── 2. The same series against general prices ─────────────────────────────

export type BrechaRow = {
  period: string;
  title: string;
  /** Both indexed to the first month = 100. */
  tarifa: number;
  ipc: number | null;
  /** Tariff over IPC, in percentage points away from parity. */
  brecha: number | null;
  tarifaLabel: string;
  ipcLabel: string | null;
  brechaLabel: string | null;
};

type View = "indices" | "brecha";

const VIEWS: { value: View; label: string }[] = [
  { value: "brecha", label: "Contra la inflación" },
  { value: "indices", label: "Las dos series" },
];

function BrechaTooltip({
  active,
  payload,
  view,
}: {
  active?: boolean;
  payload?: readonly { payload?: BrechaRow }[];
  view: View;
}) {
  const row = active ? payload?.[0]?.payload : null;
  if (!row) return null;
  return (
    <div className={card}>
      <div className="uppercase tracking-[0.14em] text-muted mb-1.5">
        {row.title}
      </div>
      {view === "indices" ? (
        <>
          <Row label="Tarifa de ABSA" value={row.tarifaLabel} color={ACCENT} />
          {row.ipcLabel && (
            <Row
              label="Precios en general"
              value={row.ipcLabel}
              color={IPC_LINE}
            />
          )}
        </>
      ) : null}
      {row.brechaLabel && (
        <div
          className={
            view === "indices" ? "mt-2 pt-1.5 border-t border-line" : ""
          }
        >
          <Row
            label={
              (row.brecha ?? 0) >= 0
                ? "Por encima de la inflación"
                : "Por detrás de la inflación"
            }
            value={row.brechaLabel}
            strong
          />
        </div>
      )}
      {row.ipcLabel === null && (
        <div className="mt-2 pt-1.5 border-t border-line text-muted max-w-[14rem]">
          El IPC de este mes todavía no se publicó.
        </div>
      )}
    </div>
  );
}

export function BrechaChart({
  title,
  stat,
  rows,
}: {
  title: string;
  stat: React.ReactNode;
  rows: BrechaRow[];
}) {
  const [view, setView] = useState<View>("brecha");

  const indexMax = Math.max(...rows.map((r) => Math.max(r.tarifa, r.ipc ?? 0)));
  const indexScale = niceTicks(100, indexMax, 4);

  const gaps = rows.map((r) => r.brecha).filter((v): v is number => v !== null);
  const gapScale = niceTicks(Math.min(...gaps), Math.max(...gaps), 4);

  return (
    <>
      <Head title={title} stat={stat}>
        <SegmentedControl
          options={VIEWS}
          value={view}
          onChange={setView}
          dividers
          label="Cómo ver la serie"
        />
      </Head>

      <div className="h-[260px] sm:h-[310px]">
        <ResponsiveContainer width="100%" height="100%">
          {view === "indices" ? (
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
                dataKey="period"
                ticks={xTicksOf(rows)}
                tickFormatter={(p: string) => p.slice(0, 4)}
                tick={tickStyle}
                axisLine={{ stroke: AXIS }}
                tickLine={false}
              />
              <YAxis
                width={52}
                domain={[indexScale.lo, indexScale.hi]}
                ticks={indexScale.ticks}
                tick={tickStyle}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
                isAnimationActive={false}
                content={(props) => <BrechaTooltip {...props} view={view} />}
              />
              {/* Both series start here; the line makes the base visible rather
                  than implied by the axis. */}
              <ReferenceLine y={100} stroke={AXIS} strokeWidth={1.5} />
              <Line
                type="monotone"
                dataKey="ipc"
                stroke={IPC_LINE}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="stepAfter"
                dataKey="tarifa"
                stroke={ACCENT}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          ) : (
            <AreaChart
              data={rows}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              accessibilityLayer
            >
              <defs>
                <linearGradient id="absa-gap" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={DEEP} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={DEEP} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke={AXIS}
                strokeDasharray="2 3"
                vertical={false}
              />
              <XAxis
                dataKey="period"
                ticks={xTicksOf(rows)}
                tickFormatter={(p: string) => p.slice(0, 4)}
                tick={tickStyle}
                axisLine={{ stroke: AXIS }}
                tickLine={false}
              />
              <YAxis
                width={52}
                domain={[gapScale.lo, gapScale.hi]}
                ticks={gapScale.ticks}
                tick={tickStyle}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v} %`}
              />
              <Tooltip
                cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
                isAnimationActive={false}
                content={(props) => <BrechaTooltip {...props} view={view} />}
              />
              {/* Parity. Above it the tariff has outrun general prices since
                  December 2024; below it, it has fallen behind them. */}
              <ReferenceLine y={0} stroke="var(--muted)" strokeWidth={1.5} />
              <Area
                type="stepAfter"
                dataKey="brecha"
                stroke={DEEP}
                strokeWidth={2}
                fill="url(#absa-gap)"
                connectNulls={false}
                isAnimationActive={false}
                dot={false}
                activeDot={{
                  r: 3,
                  fill: "var(--card)",
                  stroke: DEEP,
                  strokeWidth: 1.5,
                }}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </>
  );
}

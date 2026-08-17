"use client";

import { useMemo, useState } from "react";
import {
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

// The interactive halves of the two time-series figures on
// /estadisticas/precio-m2-construccion-caba. The `<figure>` shells — captions and
// source notes — stay in the server components that render these, and so does
// every formatted number: these take rows that are already shaped and already
// formatted, so an axis can never round a figure differently from the prose
// beside it.
//
// Both charts exist because the raw peso series cannot answer the question the
// page is really being asked. Between 2015 and today the peso figure grew by a
// factor of about 170, almost all of it inflation, so drawn straight it is a
// hockey stick that says nothing except that Argentina has inflation. Each chart
// takes a different way out of that, and the two ways are the two halves of
// "¿está caro construir?":
//
//   CostoChart      converts to dollars, which is how the real cost of building
//                   is actually judged here — and keeps the peso view one click
//                   away, because that is the number the page is named after.
//   CapitulosChart  divides each chapter by the index itself, so the lines show
//                   which part of the cost ran ahead of the rest rather than how
//                   fast all of them ran.

const AXIS = "var(--line)";
const ACCENT = "var(--accent)";

const tickStyle = {
  fontSize: 11,
  fill: "var(--muted)",
  fontFamily: "var(--font-mono)",
} as const;

const card =
  "bg-card border border-line py-2 px-2.5 font-mono text-micro text-ink shadow-[0_2px_8px_rgba(0,0,0,0.08)]";

/** "2026-06" → "2026". An eleven-year monthly axis is a run of years; the month
 * belongs in the tooltip. */
const yearOf = (period: string) => period.slice(0, 4);

const xTicksOf = (rows: { period: string }[]) =>
  rows.filter((r) => r.period.endsWith("-01")).map((r) => r.period);

// ── 1. What a square metre has cost ────────────────────────────────────────

/** One month. `ars` and `usd` are plotted; the strings beside them are what the
 * tooltip prints. `usd` is `null` for the months before the FX series starts. */
export type CostoRow = {
  period: string;
  title: string;
  ars: number;
  arsLabel: string;
  usd: number | null;
  usdLabel: string | null;
  provisional: boolean;
};

type Currency = "usd" | "ars";

const CURRENCIES: { value: Currency; label: string }[] = [
  { value: "usd", label: "US$" },
  { value: "ars", label: "$" },
];

function CostoTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: CostoRow }[];
}) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className={`${card} min-w-[210px]`}>
      <div className="uppercase tracking-[0.14em] text-muted mb-1.5">
        {row.title}
        {row.provisional && " · provisorio"}
      </div>
      <div className="flex items-center gap-2.5 mt-[3px]">
        <span
          className="w-2 h-2 inline-block shrink-0"
          style={{ background: ACCENT }}
        />
        <span className="flex-1 text-muted">Pesos por m²</span>
        <span className="font-semibold">{row.arsLabel}</span>
      </div>
      {row.usdLabel && (
        <div className="flex items-center gap-2.5 mt-[3px]">
          <span className="w-2 h-2 inline-block shrink-0" />
          <span className="flex-1 text-muted">Dólares por m²</span>
          <span className="text-muted">{row.usdLabel}</span>
        </div>
      )}
    </div>
  );
}

export function CostoChart({
  title,
  statUsd,
  statArs,
  rows,
}: {
  title: string;
  /** The figures as text, one line per currency, so the page carries them in
   * its HTML before recharts has measured anything — and so the line under the
   * heading can never describe the other view. */
  statUsd: React.ReactNode;
  statArs: React.ReactNode;
  rows: CostoRow[];
}) {
  // Dollars first. The peso series is the number the page is named after and is
  // in the table above this chart; as a *curve* it only ever shows inflation,
  // and the question a curve is asked here — is building dear right now? — is
  // one only the dollar series answers.
  const [currency, setCurrency] = useState<Currency>("usd");

  // The dollar series starts later than the peso one (the FX series begins in
  // 2017), so the dollar view is cut to the months it can actually draw rather
  // than opening on two years of blank axis.
  const shown = useMemo(
    () => (currency === "usd" ? rows.filter((r) => r.usd !== null) : rows),
    [currency, rows],
  );

  const values = shown.map((r) =>
    currency === "usd" ? (r.usd as number) : r.ars,
  );
  // Six intervals rather than the default four: at four, the dollar view lands
  // on a 500-unit step and gets three gridlines for a series that moves between
  // 358 and 1.082, which is too coarse to read a level off.
  const { ticks, lo, hi } = niceTicks(0, Math.max(...values), 6);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <figcaption className="min-w-0">
          <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
            {title}
          </h3>
          <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
            {currency === "usd" ? statUsd : statArs}
          </p>
        </figcaption>
        <div className="flex flex-wrap gap-2">
          <SegmentedControl
            label="Moneda"
            options={CURRENCIES}
            value={currency}
            onChange={setCurrency}
          />
        </div>
      </div>

      <div className="h-[300px] sm:h-[360px]">
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
              minTickGap={26}
            />
            <YAxis
              width={currency === "ars" ? 68 : 52}
              domain={[lo, hi]}
              ticks={ticks}
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) =>
                v >= 1_000_000
                  ? `${(v / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M`
                  : v.toLocaleString("es-AR")
              }
            />
            <Tooltip
              cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
              isAnimationActive={false}
              content={(props) => <CostoTooltip {...props} />}
            />
            <Line
              type="monotone"
              dataKey={currency}
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

// ── 2. Which part of the cost ran ahead ────────────────────────────────────

/** One month, with each chapter expressed as a percentage of the index itself.
 * 100 means the chapter moved exactly with the overall cost of construction;
 * above it, that chapter ran ahead. */
export type CapituloRow = {
  period: string;
  title: string;
  materiales: number;
  manoObra: number;
  gastosGenerales: number;
};

/** Drawn in this order, and coloured from the choropleth ramp so the three lines
 * belong to the same visual system as the map further down the page. */
const SERIES = [
  { key: "materiales", label: "Materiales", color: "var(--choro-6)" },
  { key: "manoObra", label: "Mano de obra", color: ACCENT },
  {
    key: "gastosGenerales",
    label: "Gastos generales",
    color: "var(--choro-3)",
  },
] as const;

const ONE_DP = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function CapitulosTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: CapituloRow }[];
}) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className={`${card} min-w-[230px]`}>
      <div className="uppercase tracking-[0.14em] text-muted mb-1.5">
        {row.title}
      </div>
      {SERIES.map((s) => (
        <div key={s.key} className="flex items-center gap-2.5 mt-[3px]">
          <span
            className="w-2 h-2 inline-block shrink-0"
            style={{ background: s.color }}
          />
          <span className="flex-1 text-muted">{s.label}</span>
          <span className="font-semibold">{ONE_DP.format(row[s.key])}</span>
        </div>
      ))}
    </div>
  );
}

export function CapitulosChart({
  title,
  stat,
  rows,
}: {
  title: string;
  stat: React.ReactNode;
  rows: CapituloRow[];
}) {
  const all = rows.flatMap((r) => [
    r.materiales,
    r.manoObra,
    r.gastosGenerales,
  ]);
  // Padded a little past the extremes and forced to contain 100, which is the
  // line the whole chart is read against. Six intervals rather than four: the
  // series spans roughly 63 to 138, and at four the axis steps by 50 and draws
  // three gridlines — too coarse to tell "ran a bit ahead" from "ran away".
  const { ticks, lo, hi } = niceTicks(
    Math.min(95, Math.floor(Math.min(...all) - 2)),
    Math.max(105, Math.ceil(Math.max(...all) + 2)),
    6,
  );

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

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3 list-none p-0 m-0">
        {SERIES.map((s) => (
          <li
            key={s.key}
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
            <XAxis
              dataKey="period"
              ticks={xTicksOf(rows)}
              tickFormatter={yearOf}
              tick={tickStyle}
              axisLine={{ stroke: AXIS }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={26}
            />
            <YAxis
              width={46}
              domain={[lo, hi]}
              ticks={ticks}
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
            />
            {/* The whole point of the figure: at 100 a chapter is moving exactly
                with the cost of construction as a whole. */}
            <ReferenceLine y={100} stroke={AXIS} strokeWidth={1.5} />
            <Tooltip
              cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
              isAnimationActive={false}
              content={(props) => <CapitulosTooltip {...props} />}
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

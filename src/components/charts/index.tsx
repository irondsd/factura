"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMonth, formatMonthShort, formatMoney } from "@/lib/format";

export * from "./primitives";

const AXIS = "var(--line)";
const tickStyle = {
  fontSize: 10,
  fill: "var(--muted)",
  fontFamily: "var(--font-mono)",
} as const;

function abbrev(v: number, currency: string): string {
  if (currency === "USD") return "$" + Math.round(v);
  if (currency === "IDX" || currency === "UNIT") return String(Math.round(v));
  if (v >= 1_000_000) return "$" + (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1000) return "$" + Math.round(v / 1000) + "k";
  return "$" + Math.round(v);
}

/** Exact value for tooltips — money for ARS/USD, plain rounded for index/unit lenses. */
function formatExact(v: number, currency: string): string {
  if (currency === "IDX" || currency === "UNIT") return String(Math.round(v));
  return formatMoney(v, currency === "USD" ? "USD" : "ARS");
}

const tooltipBox =
  "bg-card border border-line py-2 px-2.5 font-mono text-micro text-ink shadow-[0_2px_8px_rgba(0,0,0,0.08)]";

const tooltipHeader = "uppercase tracking-[0.14em] text-muted mb-1.5";

type TipPayload = {
  name?: string | number;
  value?: number | string | readonly (string | number)[];
  color?: string;
  dataKey?: string | number | ((obj: unknown) => unknown);
};

/** Stacked-bar tooltip: every vendor's exact amount for the hovered month + total. */
function StackTooltip({
  active,
  payload,
  label,
  currency,
  vendorNames,
}: {
  active?: boolean;
  payload?: readonly TipPayload[];
  label?: string | number;
  currency: string;
  vendorNames: Record<string, string>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload.filter((p) => Number(p.value) > 0);
  if (rows.length === 0) return null;
  const total = rows.reduce((a, p) => a + Number(p.value), 0);
  return (
    <div className={tooltipBox}>
      <div className={tooltipHeader}>{typeof label === "string" ? formatMonth(label) : ""}</div>
      {rows.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 mt-[3px]">
          <span className="w-2 h-2 inline-block shrink-0" style={{ background: p.color }} />
          <span className="flex-1 text-muted">
            {vendorNames[String(p.dataKey)] ?? String(p.dataKey)}
          </span>
          <span className="font-medium">{formatExact(Number(p.value), currency)}</span>
        </div>
      ))}
      <div className="flex justify-between gap-4 mt-[7px] pt-1.5 border-t border-line">
        <span className="text-muted">Total</span>
        <span className="font-semibold">{formatExact(total, currency)}</span>
      </div>
    </div>
  );
}

/** Single/multi-series line tooltip: exact value per series for the hovered month. */
function LineTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: readonly TipPayload[];
  label?: string | number;
  currency: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload.filter((p) => p.value != null);
  if (rows.length === 0) return null;
  return (
    <div className={tooltipBox}>
      <div className={tooltipHeader}>{typeof label === "string" ? formatMonth(label) : ""}</div>
      {rows.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2.5 mt-[3px]">
          <span className="w-2 h-2 inline-block shrink-0" style={{ background: p.color }} />
          <span className="flex-1 text-muted">{String(p.name)}</span>
          <span className="font-medium">{formatExact(Number(p.value), currency)}</span>
        </div>
      ))}
    </div>
  );
}

type LineSeries = {
  label: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
};

/** Multi-series line chart (spend trends, inflation/unit-price lenses). */
export function LineChartFx({
  months,
  series,
  currency = "ARS",
  height = 210,
}: {
  months: string[];
  series: LineSeries[];
  currency?: string;
  height?: number;
}) {
  const data = months.map((m, i) => {
    const row: Record<string, number | string | null> = { month: m };
    for (const s of series) row[s.label] = s.values[i] ?? null;
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={AXIS} strokeDasharray="2 3" vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonthShort}
          tick={tickStyle}
          axisLine={{ stroke: AXIS }}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          width={52}
          tick={tickStyle}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => abbrev(v, currency)}
        />
        <Tooltip
          cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
          isAnimationActive={false}
          content={(props) => <LineTooltip {...props} currency={currency} />}
        />
        {series.map((s) => (
          <Line
            key={s.label}
            type="linear"
            dataKey={s.label}
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.dashed ? "5 4" : undefined}
            dot={{ r: 2.4, fill: "var(--card)", stroke: s.color, strokeWidth: 1.5 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Monthly totals stacked by vendor; incomplete months are dimmed. */
export function StackedBarsFx({
  months,
  stacks,
  vendors,
  currency = "ARS",
  completeFlags,
  height = 220,
}: {
  months: string[];
  stacks: Record<string, number>[];
  vendors: { id: string; color: string; displayName?: string }[];
  currency?: string;
  completeFlags?: boolean[];
  height?: number;
}) {
  const data = months.map((m, i) => ({ month: m, ...stacks[i] }));
  const vendorNames = Object.fromEntries(
    vendors.map((v) => [v.id, v.displayName ?? v.id]),
  );
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={AXIS} strokeDasharray="2 3" vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonthShort}
          tick={tickStyle}
          axisLine={{ stroke: AXIS }}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={20}
        />
        <YAxis
          width={52}
          tick={tickStyle}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => abbrev(v, currency)}
        />
        <Tooltip
          cursor={{ fill: "var(--line)", fillOpacity: 0.3 }}
          isAnimationActive={false}
          content={(props) => (
            <StackTooltip {...props} currency={currency} vendorNames={vendorNames} />
          )}
        />
        {vendors.map((v) => (
          <Bar key={v.id} dataKey={v.id} stackId="a" fill={v.color} isAnimationActive={false}>
            {data.map((_, i) => (
              <Cell
                key={i}
                fillOpacity={completeFlags && !completeFlags[i] ? 0.4 : 1}
              />
            ))}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Vendor-share donut with a Fraunces center label. */
export function DonutFx({
  slices,
  size = 180,
  thickness = 30,
  centerLabel,
  centerSub,
}: {
  // `id` keeps Cell keys unique when slices share a label (same vendor name in
  // different apartments); falls back to label otherwise.
  slices: { label: string; value: number; color: string; id?: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const r = size / 2 - 2;
  return (
    <PieChart width={size} height={size}>
      <Pie
        data={slices}
        dataKey="value"
        nameKey="label"
        cx="50%"
        cy="50%"
        innerRadius={r - thickness}
        outerRadius={r}
        startAngle={90}
        endAngle={-270}
        paddingAngle={0.6}
        stroke="none"
        isAnimationActive={false}
      >
        {slices.map((s) => (
          <Cell key={s.id ?? s.label} fill={s.color} />
        ))}
        {centerLabel && (
          <Label
            position="center"
            content={(props) => {
              const vb = props.viewBox as { cx?: number; cy?: number } | undefined;
              const cx = vb?.cx ?? size / 2;
              const cy = vb?.cy ?? size / 2;
              return (
                <>
                  <text
                    x={cx}
                    y={cy - 2}
                    textAnchor="middle"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 600,
                      fontSize: 20,
                      fill: "var(--ink)",
                    }}
                  >
                    {centerLabel}
                  </text>
                  {centerSub && (
                    <text
                      x={cx}
                      y={cy + 15}
                      textAnchor="middle"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        fill: "var(--muted)",
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                      }}
                    >
                      {centerSub}
                    </text>
                  )}
                </>
              );
            }}
          />
        )}
      </Pie>
    </PieChart>
  );
}

/** Tiny inline trend line with a dot on the last point. */
export function SparklineFx({
  values,
  color,
  width = 96,
  height = 28,
}: {
  values: (number | null)[];
  color: string;
  width?: number;
  height?: number;
}) {
  const data = values.map((v, i) => ({ i, v }));
  const lastIdx = values.length - 1;
  return (
    <LineChart width={width} height={height} data={data} margin={{ top: 3, right: 3, bottom: 3, left: 3 }}>
      <Line
        type="linear"
        dataKey="v"
        stroke={color}
        strokeWidth={1.5}
        connectNulls
        isAnimationActive={false}
        dot={(props: { cx?: number; cy?: number; index?: number; value?: number | null }) =>
          props.index === lastIdx && props.value != null && props.cx != null ? (
            <circle key="last" cx={props.cx} cy={props.cy} r={2} fill={color} />
          ) : (
            <g key={props.index} />
          )
        }
      />
    </LineChart>
  );
}

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
  XAxis,
  YAxis,
} from "recharts";
import { formatMonthShort } from "@/lib/format";

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
  vendors: { id: string; color: string }[];
  currency?: string;
  completeFlags?: boolean[];
  height?: number;
}) {
  const data = months.map((m, i) => ({ month: m, ...stacks[i] }));
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
  slices: { label: string; value: number; color: string }[];
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
          <Cell key={s.label} fill={s.color} />
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

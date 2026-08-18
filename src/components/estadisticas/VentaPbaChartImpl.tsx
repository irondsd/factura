"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SegmentedControl } from "@/components/ui";
import { niceTicks } from "@/lib/svg-chart";

// The interactive half of the history figure on
// /estadisticas/precio-m2-provincia-buenos-aires. The `<figure>` shell — the
// caption and the source note — stays in the server component that renders
// this, and so does the formatting: this takes rows that are already shaped and
// already labelled, so the axis and the tooltip can never round a figure
// differently from the prose beside them.
//
// ── Why the picker is on this side of the seam ────────────────────────────
// It changes the stat line as well as the plot, and a stat line still quoting
// the north under a chart showing the south is worse than no stat line. A
// client component is server-rendered too, so the initial HTML carries the
// heading, the figures and the control; only the plot waits for the browser.
//
// ── Gaps are drawn as gaps ────────────────────────────────────────────────
// `connectNulls` is deliberately off. Two months are missing from the series —
// nothing was captured in 2026-02, and one report failed to appear in
// 2026-04 — and bridging them would draw a straight line through a month
// nobody observed. A broken line is the honest rendering of a broken record.

const AXIS = "var(--line)";
const ACCENT = "var(--accent)";

const tickStyle = {
  fontSize: 11,
  fill: "var(--muted)",
  fontFamily: "var(--font-mono)",
} as const;

const card =
  "bg-card border border-line py-2 px-2.5 font-mono text-micro text-ink shadow-[0_2px_8px_rgba(0,0,0,0.08)]";

export type SerieRow = {
  /** `YYYY-MM`, the join key. */
  period: string;
  /** Axis label, already short. */
  label: string;
  /** One key per partido id, `null` where that month has no figure. */
  [partido: string]: string | number | null;
};

export type PartidoOption = {
  id: string;
  label: string;
  /** The stat line for this partido, formatted by the server. */
  stat: string;
};

export type ZonaOption = {
  id: string;
  label: string;
  partidos: PartidoOption[];
};

export function VentaPbaSerie({
  rows,
  zonas,
  initial,
  unit,
}: {
  rows: SerieRow[];
  zonas: ZonaOption[];
  initial: string;
  unit: string;
}) {
  const [zona, setZona] = useState(initial);
  const active = zonas.find((z) => z.id === zona) ?? zonas[0];

  const values = active.partidos.flatMap((p) =>
    rows.map((r) => r[p.id]).filter((v): v is number => typeof v === "number"),
  );
  const { ticks, lo, hi } = niceTicks(
    Math.min(...values),
    Math.max(...values),
    4,
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
            Cómo se movió el precio, mes a mes
          </h3>
          <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
            {active.label} · {unit}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SegmentedControl
            label="Zona"
            options={zonas.map((z) => ({ value: z.id, label: z.label }))}
            value={zona}
            onChange={setZona}
          />
        </div>
      </div>

      {/* Fixed height: ResponsiveContainer renders nothing until it has
          measured, so an auto-height wrapper collapses and then jumps. */}
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 6, right: 8, bottom: 0, left: -8 }}
          >
            <CartesianGrid
              stroke={AXIS}
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={tickStyle}
              tickLine={false}
              axisLine={{ stroke: AXIS }}
              minTickGap={16}
            />
            <YAxis
              domain={[lo, hi]}
              ticks={ticks}
              tick={tickStyle}
              tickLine={false}
              axisLine={false}
              width={54}
            />
            <Tooltip
              cursor={{ stroke: AXIS }}
              content={({ active: on, payload, label }) =>
                !on || !payload?.length ? null : (
                  <div className={card}>
                    <div className="text-muted mb-1">{label}</div>
                    {[...payload]
                      .sort((a, b) => (b.value as number) - (a.value as number))
                      .map((p) => (
                        <div key={p.dataKey as string}>
                          <span style={{ color: p.color }}>■</span>{" "}
                          {
                            active.partidos.find((x) => x.id === p.dataKey)
                              ?.label
                          }{" "}
                          <span className="tabular-nums">
                            US$ {Number(p.value).toLocaleString("es-AR")}
                          </span>
                        </div>
                      ))}
                  </div>
                )
              }
            />
            {active.partidos.map((p, i) => (
              <Line
                key={p.id}
                type="monotone"
                dataKey={p.id}
                stroke={ACCENT}
                strokeOpacity={
                  1 - (i / Math.max(active.partidos.length, 1)) * 0.72
                }
                strokeWidth={1.6}
                dot={false}
                // See the header: a missing month is a hole, not a straight
                // line between the months either side of it.
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 list-none p-0 m-0">
        {active.partidos.map((p, i) => (
          <li
            key={p.id}
            className="font-mono text-[11px] text-muted leading-[1.6]"
          >
            <span
              aria-hidden
              className="inline-block w-2.5 h-[2px] align-middle mr-1.5"
              style={{
                background: ACCENT,
                opacity: 1 - (i / Math.max(active.partidos.length, 1)) * 0.72,
              }}
            />
            <span className="text-ink">{p.label}</span> {p.stat}
          </li>
        ))}
      </ul>
    </div>
  );
}

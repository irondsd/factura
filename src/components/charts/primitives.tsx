"use client";

import type { CSSProperties, ReactNode } from "react";

// Small presentational helpers shared across the insight screens, ported from
// the design prototype's ui.jsx.

export function ChartCard({
  title,
  caption,
  action,
  children,
  pad = 20,
  style,
}: {
  title?: ReactNode;
  caption?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  pad?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--line)",
        padding: pad,
        // Recharts' ResponsiveContainer renders a fixed-width SVG, which would
        // otherwise pin a grid track's auto-minimum and stop `1fr` from
        // distributing width — collapsing the card. minWidth:0 frees the track.
        minWidth: 0,
        ...style,
      }}
    >
      {(title || action) && (
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div>
            {title && (
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.2em",
                  color: "var(--muted)",
                  margin: 0,
                }}
              >
                {title}
              </p>
            )}
            {caption && (
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--muted)",
                  margin: "4px 0 0",
                  opacity: 0.85,
                }}
              >
                {caption}
              </p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Eyebrow({
  children,
  tone = "muted",
  style,
}: {
  children: ReactNode;
  tone?: "muted" | "accent";
  style?: CSSProperties;
}) {
  return (
    <p
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.22em",
        color: tone === "accent" ? "var(--accent)" : "var(--muted)",
        margin: 0,
        ...style,
      }}
    >
      {children}
    </p>
  );
}

export function Display({
  children,
  size = 30,
  style,
}: {
  children: ReactNode;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        fontFamily: "var(--font-display)",
        fontWeight: 600,
        fontSize: size,
        letterSpacing: "-0.01em",
        color: "var(--ink)",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export type SegmentedOption<T extends string | number> = {
  value: T;
  label: string;
};

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  style,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{ display: "inline-flex", border: "1px solid var(--line)", ...style }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            onClick={() => onChange(o.value)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              padding: "5px 11px",
              border: "none",
              cursor: "pointer",
              transition: "var(--transition-colors)",
              background: active ? "var(--ink)" : "transparent",
              color: active ? "var(--paper)" : "var(--muted)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </span>
  );
}

/** Trend delta chip: ▲ up (accent, "bad" for spend) / ▼ down / · flat. */
export function Delta({
  pct,
  style,
}: {
  pct: number | null | undefined;
  style?: CSSProperties;
}) {
  if (pct == null || !isFinite(pct)) return null;
  const up = pct > 0.5;
  const down = pct < -0.5;
  const glyph = up ? "▲" : down ? "▼" : "·";
  const color = up ? "var(--accent)" : "var(--muted)";
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        color,
        letterSpacing: "0.02em",
        ...style,
      }}
    >
      {glyph} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

export function Legend({
  items,
  style,
}: {
  items: { label: string; color: string }[];
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", ...style }}>
      {items.map((it) => (
        <span
          key={it.label}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--muted)",
          }}
        >
          <span
            style={{ width: 10, height: 10, background: it.color, display: "inline-block" }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

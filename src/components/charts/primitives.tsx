"use client";

import { type ReactNode, useState } from "react";
import { cn } from "@/lib/cn";

export type ChartCurrency = "ARS" | "USD";

// Small presentational helpers shared across the insight screens, ported from
// the design prototype's ui.jsx.

export function ChartCard({
  title,
  caption,
  action,
  children,
  pad = 20,
  className,
}: {
  title?: ReactNode;
  caption?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  pad?: number;
  className?: string;
}) {
  return (
    <div
      // Recharts' ResponsiveContainer renders a fixed-width SVG, which would
      // otherwise pin a grid track's auto-minimum and stop `1fr` from
      // distributing width — collapsing the card. min-w-0 frees the track.
      className={cn("bg-card border border-line min-w-0", className)}
      style={{ padding: pad }}
    >
      {(title || action) && (
        <div className="flex items-baseline justify-between gap-3 mb-[14px]">
          <div>
            {title && (
              <p className="font-mono text-micro uppercase tracking-label-wide text-muted">
                {title}
              </p>
            )}
            {caption && (
              <p className="font-mono text-xs text-muted mt-1 opacity-85">
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
  className,
}: {
  children: ReactNode;
  tone?: "muted" | "accent";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "font-mono text-micro uppercase tracking-[0.22em]",
        tone === "accent" ? "text-accent" : "text-muted",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function Display({
  children,
  size = 30,
  className,
}: {
  children: ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-display font-semibold tracking-tight text-ink",
        className,
      )}
      style={{ fontSize: size }}
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
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex border border-line", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            onClick={() => onChange(o.value)}
            className={cn(
              "font-mono text-micro uppercase tracking-[0.14em] py-[5px] px-[11px] border-none cursor-pointer transition-colors",
              active ? "bg-ink text-paper" : "bg-transparent text-muted",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </span>
  );
}

/** Compact ARS/USD switch for a chart's top-right corner. */
export function CurrencyToggle({
  value,
  onChange,
  className,
}: {
  value: ChartCurrency;
  onChange: (v: ChartCurrency) => void;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex border border-line", className)}>
      {(["ARS", "USD"] as const).map((c) => {
        const active = c === value;
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-pressed={active}
            className={cn(
              "font-mono text-[10px] tracking-[0.12em] py-[3px] px-[7px] border-none cursor-pointer transition-colors",
              active ? "bg-ink text-paper" : "bg-transparent text-muted",
            )}
          >
            {c}
          </button>
        );
      })}
    </span>
  );
}

/** Per-chart currency state + its toggle element, ready for ChartCard's `action`
 * slot. Defaults to ARS; each chart keeps its own independent state. */
export function useChartCurrency(initial: ChartCurrency = "ARS") {
  const [currency, setCurrency] = useState<ChartCurrency>(initial);
  return {
    currency,
    setCurrency,
    toggle: <CurrencyToggle value={currency} onChange={setCurrency} />,
  };
}

/** Trend delta chip: ▲ up (accent, "bad" for spend) / ▼ down / · flat. */
export function Delta({
  pct,
  className,
}: {
  pct: number | null | undefined;
  className?: string;
}) {
  if (pct == null || !isFinite(pct)) return null;
  const up = pct > 0.5;
  const down = pct < -0.5;
  const glyph = up ? "▲" : down ? "▼" : "·";
  return (
    <span
      className={cn(
        "font-mono text-micro tracking-[0.02em]",
        up ? "text-accent" : "text-muted",
        className,
      )}
    >
      {glyph} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

export function Legend({
  items,
  hidden,
  onToggle,
  className,
}: {
  // `id` makes the key unique when two entries share a label (e.g. the same
  // vendor name across different properties); falls back to label otherwise.
  items: { label: string; color: string; id?: string }[];
  // When `onToggle` is supplied the legend becomes interactive: each item is a
  // button that toggles its id in `hidden`, and hidden entries dim to signal
  // they're excluded from the chart. Without it the legend stays static.
  hidden?: Set<string>;
  onToggle?: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-x-[18px] gap-y-2", className)}>
      {items.map((it) => {
        const key = it.id ?? it.label;
        const isHidden = hidden?.has(key) ?? false;
        const swatch = (
          <span
            className="inline-block w-2.5 h-2.5"
            style={{
              background: isHidden ? "transparent" : it.color,
              boxShadow: isHidden ? `inset 0 0 0 1px ${it.color}` : undefined,
            }}
          />
        );
        const content = (
          <span className="inline-flex items-center gap-[7px] font-mono text-micro text-muted">
            {swatch}
            {it.label}
          </span>
        );
        if (!onToggle) {
          return (
            <span key={key} className="inline-flex">
              {content}
            </span>
          );
        }
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            aria-pressed={!isHidden}
            className={cn(
              "inline-flex items-center border-none bg-transparent p-0 cursor-pointer transition-opacity",
              isHidden ? "opacity-40" : "opacity-100",
            )}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

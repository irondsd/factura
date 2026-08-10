"use client";

import { type ReactNode, useEffect, useState } from "react";
import {
  SegmentedControl,
  type SegmentedOption,
} from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/useMediaQuery";

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
  as: Tag = "p",
}: {
  children: ReactNode;
  tone?: "muted" | "accent";
  className?: string;
  /** `div` for an eyebrow that holds interactive, non-phrasing content — a
   * popover trigger and its panel can't live inside a `<p>`. */
  as?: "p" | "div";
}) {
  return (
    <Tag
      className={cn(
        "font-mono text-micro uppercase tracking-[0.22em]",
        tone === "accent" ? "text-accent" : "text-muted",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function Display({
  children,
  size = 30,
  className,
  as: Tag = "span",
}: {
  children: ReactNode;
  size?: number;
  className?: string;
  /** `h1` where the display text is the screen's title rather than one figure
   * among several — a view that renders it that way is the page's heading, and
   * a page with no heading at all leaves screen-reader outline navigation with
   * nothing to jump to. Preflight strips a heading's own size, weight and
   * margin, so the tag swap is invisible. */
  as?: "span" | "h1";
}) {
  return (
    <Tag
      className={cn(
        "font-display font-semibold tracking-tight text-ink",
        className,
      )}
      style={{ fontSize: size }}
    >
      {children}
    </Tag>
  );
}

const CURRENCIES: SegmentedOption<ChartCurrency>[] = [
  { value: "ARS", label: "ARS" },
  { value: "USD", label: "USD" },
];

/** Compact ARS/USD switch for a chart's top-right corner — the smallest step on
 * the scale, since it rides beside a card title rather than carrying a screen. */
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
    <SegmentedControl
      options={CURRENCIES}
      value={value}
      onChange={onChange}
      size={22}
      className={className}
    />
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

/** True for the first beat after mount, then permanently false.
 *
 * Charts use it to play their entrance once — arriving over the skeleton — and
 * then hold still: with recharts' animation left on, every currency toggle,
 * legend click and month pick would replay the whole grow-in, which reads as a
 * reload rather than a filter. Off entirely under reduced-motion, where the
 * charts should simply be there. */
export function useEntranceAnimation(ms = 800) {
  const still = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [on, setOn] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(id);
  }, [ms]);
  return on && !still;
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

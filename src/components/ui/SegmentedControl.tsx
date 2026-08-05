"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// The one segmented switch: a hairline-bordered row of mono uppercase segments,
// the selected one inverted to ink. Drives the EN/ES switch, the header's
// property switcher, the per-chart ARS/USD toggle and the Insights range
// presets — every variant those needed is a prop here, so they can't drift
// apart again.

export type SegmentedOption<T extends string | number> = {
  value: T;
  label: ReactNode;
  /** Spoken label, when `label` is an abbreviation ("EN" → "English"). */
  ariaLabel?: string;
  /** For a segment that doubles as a disclosure — the range CUSTOM chip opens
   * a panel rather than only selecting. */
  ariaExpanded?: boolean;
  disabled?: boolean;
};

/** The compact end of the scale — the per-chart ARS/USD switch. */
const DEFAULT_SIZE = 22;

/** The segment box, inside the group's two hairlines. `size` is the height you
 * measure on the control itself, so the border has to come back off it. */
const innerFor = (size: number) => size - 2;

/** Type and padding ride the height, so one `size` describes the whole control.
 *
 * Type grows far more slowly than the box (and stops at 12px): past a point a
 * taller segment should read as more chrome around the same small mono label,
 * not as bigger text — 16px uppercase mono is a different design language than
 * this one. Height and side padding carry the difference instead. */
const fontFor = (size: number) =>
  Math.min(11.5, Math.max(9, Math.round(6 + innerFor(size) * 0.2)));
const padFor = (size: number) => Math.round(innerFor(size) * 0.5);

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  size = DEFAULT_SIZE,
  transparent = false,
  dividers = false,
  disabled = false,
  label,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  /** Fires on every click, including on the segment that is already selected —
   * a control that doubles as a disclosure (the range CUSTOM chip) needs to
   * hear the second click. Callers that only select guard on `value`. */
  onChange: (v: T) => void;
  /** Height of the control in px, borders included — what you measure on the
   * rendered element. A segment grows past it only if its label has to wrap. */
  size?: number;
  /** Drop the card fill and let the surface behind show through — for the top
   * bar, whose translucent blur a solid segment row would punch a hole in. */
  transparent?: boolean;
  /** Hairline between segments. Earns its keep once the labels are words
   * rather than two-letter codes. */
  dividers?: boolean;
  /** Disables every segment — for an in-flight switch. The selected one stays
   * focusable so a keyboard reader can still hear which is on. */
  disabled?: boolean;
  /** Names the group for screen readers. */
  label?: string;
  className?: string;
}) {
  const fontSize = fontFor(size);
  const paddingInline = padFor(size);
  const minHeight = innerFor(size);

  return (
    <span
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex border border-line",
        transparent ? "bg-transparent" : "bg-card",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-label={o.ariaLabel}
            aria-pressed={active}
            aria-expanded={o.ariaExpanded}
            disabled={disabled || o.disabled}
            onClick={() => onChange(o.value)}
            // `minHeight`, not `height`: a long label under a narrow viewport
            // (the five range presets on a phone, where CUSTOM is
            // "Personalizado") has to be able to wrap and grow the row rather
            // than run off the side of the page. Flex stretches its siblings to
            // match.
            style={{ minHeight, fontSize, paddingInline, paddingBlock: 2 }}
            className={cn(
              "inline-flex items-center justify-center text-center font-mono uppercase leading-tight tracking-label transition-colors",
              dividers && "border-r border-line last:border-r-0",
              active
                ? "cursor-default bg-ink text-paper"
                : "cursor-pointer bg-transparent text-muted enabled:hover:text-accent",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </span>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { SegmentedControl } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/useMediaQuery";

// The header's property switcher. Two properties plus "All" is three short
// words — that fits on one line as a segmented control, and seeing every choice
// at once beats hiding them behind a click. Past that the row grows wider than
// the chrome it sits in, so it collapses into a dropdown; so does any width
// where the top bar is already tight for room.

/** Properties (excluding "All") a segmented row can hold before it's a menu. */
const SEGMENTED_MAX = 2;

/** Below this the switcher is always a dropdown, however few properties. */
export const NARROW = "(max-width: 768px)";

/** Height of the switcher in both its forms. The dropdown trigger below is not
 * a `SegmentedControl`, so it re-states the geometry `size={28}` derives —
 * `min-h-7` is 28px, and 13px/11px are that size's padding and type. Crossing
 * from two properties to three must not resize the top bar. */
const PROPERTY_SIZE = 28;

const ALL = "all";

export type PropertyOption = { id: string; nickname: string };

export function PropertySelector({
  properties,
  value,
  onChange,
  className,
}: {
  properties: PropertyOption[];
  /** Selected property, or undefined for "All". */
  value?: string;
  onChange: (id?: string) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const narrow = useMediaQuery(NARROW);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const options = [
    { value: ALL, label: t.app.propertyAll },
    ...properties.map((p) => ({ value: p.id, label: p.nickname })),
  ];
  const current = value ?? ALL;
  const currentLabel =
    options.find((o) => o.value === current)?.label ?? t.app.propertyAll;

  const select = (v: string) => {
    onChange(v === ALL ? undefined : v);
    setOpen(false);
  };

  // Dismiss on an outside tap or Escape. `pointerdown` rather than `mousedown`
  // so a phone closes the menu on the touch itself.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!narrow && properties.length <= SEGMENTED_MAX) {
    return (
      <SegmentedControl
        options={options}
        value={current}
        onChange={select}
        size={PROPERTY_SIZE}
        // The top bar is a translucent, blurred card; a solid segment row would
        // punch an opaque hole in it.
        transparent
        label={t.app.propertyLabel}
        className={className}
      />
    );
  }

  return (
    <span ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={t.app.propertyLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex min-h-7 cursor-pointer items-center gap-2 border px-[13px] font-mono text-micro uppercase tracking-label transition-colors",
          open
            ? "border-ink bg-ink text-paper"
            : "border-line bg-transparent text-muted hover:text-ink",
        )}
      >
        <span className="max-w-[9ch] truncate">{currentLabel}</span>
        <span aria-hidden="true" className="text-[9px] tracking-normal">
          ▼
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t.app.propertyLabel}
          // Anchored to the trigger's right edge: at the far end of the top bar
          // there is no room to hang left.
          className="absolute right-0 top-[calc(100%+6px)] z-10 max-h-[min(60vh,20rem)] min-w-[max(100%,9rem)] overflow-y-auto overscroll-contain border border-line bg-card shadow-pop"
        >
          {options.map((o) => {
            const active = o.value === current;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => select(o.value)}
                className={cn(
                  "block w-full cursor-pointer border-b border-dashed border-line py-2.5 px-3 text-left font-mono text-micro uppercase tracking-label transition-colors last:border-b-0",
                  active
                    ? "bg-ink text-paper"
                    : "text-muted hover:bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] hover:text-ink",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}

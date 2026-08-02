"use client";

import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { formatMonth } from "@/lib/format";

// The month control on the Overview forecast block. The label in the eyebrow is
// the trigger; opening it reveals the whole ledger as one row per year, twelve
// cells across, so any month is one click away and the reader can see at a
// glance how far back the record goes. On a phone the same picker arrives as a
// bottom sheet instead — thumb-reachable, six cells across, two rows per year.
//
// Both are the same markup: only the container, the column count and the cell
// padding change at the `sm` breakpoint, so there is one set of buttons for a
// screen reader and one piece of state to keep straight.

/** `t.months.short` is keyed by the English abbreviation. */
const MONTH_KEYS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export type MonthOption = { month: string; closed: boolean };

/** Newest year first, each with twelve cells; a cell is pickable only where the
 * ledger reaches that month. */
function yearRows(options: MonthOption[]) {
  const by = new Map(options.map((o) => [o.month, o]));
  const years = [...new Set(options.map((o) => o.month.slice(0, 4)))]
    .sort()
    .reverse();
  return years.map((year) => ({
    year,
    cells: MONTH_KEYS.map((key, i) => {
      const month = `${year}-${String(i + 1).padStart(2, "0")}`;
      const o = by.get(month);
      return { key, month, enabled: Boolean(o), closed: o?.closed ?? true };
    }),
  }));
}

export function MonthSwitcher({
  month,
  options,
  onSelect,
  className,
}: {
  /** The month on screen, "YYYY-MM". */
  month: string;
  /** Every month the ledger can show, oldest → newest, each flagged with
   * whether every bill due that month actually arrived. */
  options: MonthOption[];
  onSelect: (month: string) => void;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const to = t.overview;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const rows = yearRows(options);
  const latest = options[options.length - 1]?.month;
  const away = Boolean(latest) && month !== latest;

  const close = (refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const pick = (m: string) => {
    onSelect(m);
    close(true);
  };

  // Dismiss on an outside click or Escape. The sheet's own scrim handles the
  // touch case; this covers the desktop popover.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Bring the selected year into view. With the list capped at five years a
  // month picked from 2021 would otherwise open off-screen. Written to
  // `scrollTop` rather than via scrollIntoView, which would also scroll the
  // page under the popover — which is why the list carries `relative`: it has
  // to be the rows' offsetParent, or this measures from the panel instead and
  // scrolls the top year half out of view.
  useLayoutEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>("[data-current-year]");
    if (list && row) list.scrollTop = Math.max(0, row.offsetTop - 4);
  }, [open]);

  const labelCls =
    "font-mono text-micro uppercase tracking-label transition-colors";

  return (
    <span
      ref={rootRef}
      className={cn("relative inline-flex items-center gap-2.5", className)}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          labelCls,
          "inline-flex cursor-pointer items-center gap-[7px] text-ink hover:text-accent",
        )}
      >
        <span className="underline decoration-dotted underline-offset-[5px]">
          {formatMonth(month, locale)}
        </span>
        <span className="text-[9px] tracking-normal">▼</span>
      </button>

      {away && (
        <button
          type="button"
          onClick={() => onSelect(latest)}
          className={cn(
            labelCls,
            "cursor-pointer text-accent underline decoration-dotted underline-offset-4 hover:text-ink",
          )}
        >
          {to.backToCurrent}
        </button>
      )}

      {open && (
        <>
          {/* Scrim behind the sheet. Phone only: the popover dismisses on an
              outside click, which needs no surface of its own.

              Both layers clear z-50, where the app's persistent chrome lives —
              top bar, drop overlay, and the upload FAB, which is fixed to the
              same corner the sheet comes up from. They stay under the drawer
              (70) and the modals (90+), which are meant to cover this. */}
          <div
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[60] bg-[rgb(33_29_22/0.3)] sm:hidden"
          />
          <div
            role="dialog"
            aria-label={to.pickMonth}
            className={cn(
              // Phone: a bottom sheet, flush with the edge of the screen.
              "fixed inset-x-0 bottom-0 z-[61] border-t border-line bg-card px-[18px] pt-2.5 pb-[30px] shadow-[0_-8px_30px_-12px_rgb(33_29_22/0.35)]",
              // sm+: a torn receipt hanging off the month label.
              "receipt-edge-sm sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-[calc(100%+10px)] sm:w-[min(560px,calc(100vw-2.5rem))] sm:border sm:px-4 sm:pt-3.5 sm:pb-[26px] sm:shadow-pop",
            )}
          >
            {/* Sheet grabber. */}
            <div className="mx-auto mb-3.5 h-[3px] w-[46px] bg-line sm:hidden" />

            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-label text-muted">
                {to.pickMonth}
              </span>
              <button
                type="button"
                onClick={() => close(true)}
                aria-label={to.closePicker}
                className="cursor-pointer p-1.5 font-mono text-[13px] text-muted sm:hidden"
              >
                ✕
              </button>
            </div>

            {/* A year row is a fixed height at each size — the cells below set
                their own — so the list caps at a whole number of them rather
                than a rounded-off one: five on a desktop, where the popover
                would otherwise hang past the block it belongs to, and about two
                and a half on a phone, bounded by the screen on a short one.
                Anything older scrolls. */}
            <div
              ref={listRef}
              style={
                {
                  "--year-row": "136px",
                  "--year-row-sm": "40px",
                } as CSSProperties
              }
              className="relative max-h-[min(calc(2.5*var(--year-row)),50vh)] overflow-y-auto overscroll-contain sm:max-h-[calc(5*var(--year-row-sm))]"
            >
              {rows.map((row) => (
                <div
                  key={row.year}
                  data-current-year={
                    row.year === month.slice(0, 4) ? "" : undefined
                  }
                  className="border-t border-line py-2.5 sm:flex sm:items-center sm:gap-3.5 sm:py-1.5"
                >
                  <span className="mb-1.5 block font-mono text-[11px] tracking-[0.1em] text-ink sm:mb-0 sm:w-11 sm:flex-none">
                    {row.year}
                  </span>
                  <div className="grid grid-cols-6 gap-[3px] sm:flex-1 sm:grid-cols-12 sm:gap-[2px]">
                    {row.cells.map((c) => {
                      const selected = c.month === month;
                      // A month still owed a bill is marked with the same △ the
                      // awaiting cards carry, in the same accent — so the shape
                      // of the ledger's holes is visible before you go looking
                      // for them, and the mark never rests on colour alone.
                      const owed = c.enabled && !c.closed;
                      return (
                        <button
                          key={c.month}
                          type="button"
                          disabled={!c.enabled}
                          aria-current={selected ? "true" : undefined}
                          aria-label={
                            owed
                              ? `${formatMonth(c.month, locale)} — ${to.incompleteMonth}`
                              : formatMonth(c.month, locale)
                          }
                          onClick={() => pick(c.month)}
                          className={cn(
                            // A phone cell is a 44px touch target; the popover's
                            // is as tight as the type allows. `leading-none`
                            // keeps both a known height — see the row cap above.
                            "font-mono text-micro leading-none uppercase tracking-[0.06em] min-h-11 py-2.5 transition-colors sm:min-h-0 sm:py-2",
                            selected && "bg-ink",
                            owed
                              ? cn(
                                  "text-accent",
                                  !selected &&
                                    "cursor-pointer hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]",
                                )
                              : selected
                                ? "text-paper"
                                : c.enabled
                                  ? "cursor-pointer text-muted hover:bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] hover:text-ink"
                                  : "cursor-default text-[color-mix(in_srgb,var(--muted)_40%,transparent)]",
                          )}
                        >
                          {t.months.short[c.key]}
                          {owed && (
                            <span
                              aria-hidden="true"
                              className="ml-px text-[8px] align-top"
                            >
                              △
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </span>
  );
}

"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { formatMonthShort } from "@/lib/format";
import {
  activeRangeChip,
  type InsightsWindow,
  RANGE_PRESETS,
} from "@/lib/insights";

// The Insights range control, ported from the "Insights range" prototype:
// preset chips (6 / 12 / 24 MO) plus a CUSTOM panel that opens a from→to month
// picker and a draggable range bar. Presets snap the window; the custom panel
// commits on every dropdown pick and on release of a drag. It works purely in
// span-index space and emits concrete { from, to } month tags, so the same
// component drives the signed-in app and /demo unchanged.

const PRESETS = RANGE_PRESETS.map((count) => ({
  key: String(count) as "6" | "12" | "24",
  count,
}));

/** "2024-09" → "Sep 2024" (locale-aware short month + full year). */
function tag(month: string, locale: Parameters<typeof formatMonthShort>[1]) {
  return `${formatMonthShort(month, locale)} ${month.slice(0, 4)}`;
}

type Drag = {
  which: "left" | "right" | "pan";
  origStart: number;
  origEnd: number;
  grab: number;
};

export function RangeControl({
  span,
  value,
  onChange,
  className,
}: {
  /** Every selectable month, oldest → newest (the data-driven span). */
  span: string[];
  value: InsightsWindow;
  onChange: (win: InsightsWindow) => void;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const ti = t.insights;
  const n = span.length;
  const den = Math.max(1, n - 1);

  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [panelOpen, setPanelOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<"from" | "to" | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // Live window during a drag; committed to `onChange` on release. Mirrored in a
  // ref so `pointerup` can read the final value without calling the parent's
  // setState from inside a state updater (which React rightly forbids).
  const [draft, setDraft] = useState<{ start: number; end: number } | null>(
    null,
  );
  const draftRef = useRef<{ start: number; end: number } | null>(null);

  // Committed window as span indices (clamped; the parent guarantees the window
  // sits inside the span, but indexOf can still miss on the very first frame).
  const startIdx = Math.max(0, span.indexOf(value.from));
  const endIdx = Math.max(startIdx, span.indexOf(value.to));

  // Which chip is lit — derived (not stored) from the window the parent hands us,
  // so it can't drift. See `activeRangeChip` for the CUSTOM/ALL/preset rules.
  const mode = activeRangeChip(startIdx, endIdx, n, panelOpen);

  // Close the panel when clicking outside it.
  useEffect(() => {
    if (!panelOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setPanelOpen(false);
        setOpenDropdown(null);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [panelOpen]);

  // Keep the panel on screen: measure its natural (right-anchored) position and
  // nudge it back inside the viewport with an 8px margin when it would spill off
  // an edge — the common case being the left edge on a phone. Written straight to
  // the DOM node (never React state), so there's no reflow-triggered re-render and
  // the correction lands before the browser paints the open panel.
  useLayoutEffect(() => {
    if (!panelOpen) return;
    const measure = () => {
      const el = panelRef.current;
      if (!el) return;
      el.style.transform = ""; // read the natural, un-nudged position
      const r = el.getBoundingClientRect();
      const m = 8;
      let dx = 0;
      if (r.left < m) dx = m - r.left;
      else if (r.right > window.innerWidth - m)
        dx = window.innerWidth - m - r.right;
      if (dx) el.style.transform = `translateX(${dx}px)`;
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [panelOpen, n]);

  const commit = (start: number, end: number) =>
    onChange({ from: span[start], to: span[end] });

  const dispStart = draft ? draft.start : startIdx;
  const dispEnd = draft ? draft.end : endIdx;

  const preset = (p: (typeof PRESETS)[number]) => {
    const end = n - 1;
    const start = Math.max(0, end - (p.count - 1));
    setPanelOpen(false);
    setOpenDropdown(null);
    commit(start, end);
  };

  const selectAll = () => {
    setPanelOpen(false);
    setOpenDropdown(null);
    commit(0, n - 1);
  };

  const toggleCustom = () => {
    setPanelOpen((prev) => (mode === "custom" ? !prev : true));
    setOpenDropdown(null);
  };

  const pickFrom = (i: number) => {
    setOpenDropdown(null);
    commit(i, Math.max(i, endIdx));
  };
  const pickTo = (i: number) => {
    setOpenDropdown(null);
    commit(Math.min(i, startIdx), i);
  };

  // ── drag ──────────────────────────────────────────────────────────────────
  const idxFromEvent = (e: PointerEvent | ReactPointerEvent) => {
    const el = trackRef.current;
    if (!el) return startIdx;
    const r = el.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    return Math.round(f * den);
  };

  const beginDrag = (
    which: Drag["which"],
    e: ReactPointerEvent<HTMLDivElement>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const init = { start: startIdx, end: endIdx };
    draftRef.current = init;
    setDraft(init);
    setDrag({
      which,
      origStart: startIdx,
      origEnd: endIdx,
      grab: which === "pan" ? idxFromEvent(e) : 0,
    });
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const idx = idxFromEvent(e);
      const prev = draftRef.current ?? {
        start: drag.origStart,
        end: drag.origEnd,
      };
      let next: { start: number; end: number };
      if (drag.which === "left")
        next = { start: Math.min(idx, prev.end), end: prev.end };
      else if (drag.which === "right")
        next = { start: prev.start, end: Math.max(idx, prev.start) };
      else {
        const w = drag.origEnd - drag.origStart;
        let ns = drag.origStart + (idx - drag.grab);
        ns = Math.max(0, Math.min(ns, n - 1 - w));
        next = { start: ns, end: ns + w };
      }
      draftRef.current = next;
      setDraft(next);
    };
    const onUp = () => {
      const cur = draftRef.current;
      draftRef.current = null;
      setDraft(null);
      setDrag(null);
      if (cur) commit(cur.start, cur.end);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, n, span]);

  const winLeft = `${((dispStart / den) * 100).toFixed(2)}%`;
  const winRight = `${((1 - dispEnd / den) * 100).toFixed(2)}%`;
  const readout = `${tag(span[dispStart], locale)} – ${tag(span[dispEnd], locale)} · ${dispEnd - dispStart + 1} ${ti.rangeUnit}`;

  const chipCls = (active: boolean) =>
    cn(
      "font-mono text-[11.5px] uppercase tracking-[0.07em] px-[13px] py-2 cursor-pointer transition-colors border-r border-line last:border-r-0",
      active ? "bg-ink text-paper" : "bg-transparent text-muted",
    );

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="inline-flex border border-line bg-card">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => preset(p)}
            className={chipCls(mode === p.key)}
          >
            {ti[`range${p.key}` as "range6" | "range12" | "range24"]}
          </button>
        ))}
        <button
          type="button"
          onClick={selectAll}
          className={chipCls(mode === "all")}
        >
          {ti.rangeAll}
        </button>
        <button
          type="button"
          onClick={toggleCustom}
          aria-expanded={panelOpen}
          className={chipCls(mode === "custom")}
        >
          {ti.rangeCustom}
        </button>
      </div>

      {panelOpen && (
        <div
          ref={panelRef}
          className="absolute right-0 top-[calc(100%+8px)] z-20 w-[min(328px,calc(100vw-16px))] bg-card border border-line shadow-pop px-4 pt-4 pb-7"
        >
          <div className="font-mono text-[9.5px] uppercase tracking-[0.11em] text-muted mb-[11px]">
            {ti.rangeCustomTitle}
          </div>

          <div className="flex items-center gap-2 mb-[13px]">
            <MonthPicker
              label={tag(value.from, locale)}
              aria={ti.rangeFrom}
              open={openDropdown === "from"}
              onToggle={() =>
                setOpenDropdown((d) => (d === "from" ? null : "from"))
              }
              span={span}
              selected={startIdx}
              onPick={pickFrom}
              locale={locale}
            />
            <span className="text-muted font-mono text-[12px]">→</span>
            <MonthPicker
              label={tag(value.to, locale)}
              aria={ti.rangeTo}
              open={openDropdown === "to"}
              onToggle={() =>
                setOpenDropdown((d) => (d === "to" ? null : "to"))
              }
              span={span}
              selected={endIdx}
              onPick={pickTo}
              locale={locale}
            />
          </div>

          {/* draggable range bar */}
          <div
            ref={trackRef}
            className="relative h-[30px] border border-line mb-[14px] touch-none"
            style={{
              background:
                "repeating-linear-gradient(90deg, color-mix(in srgb, var(--line) 65%, transparent) 0 1px, transparent 1px 12px)",
            }}
          >
            <div
              onPointerDown={(e) => beginDrag("pan", e)}
              className="absolute -top-px -bottom-px flex items-center justify-center gap-[3px] cursor-grab touch-none"
              style={{
                left: winLeft,
                right: winRight,
                background:
                  "color-mix(in srgb, var(--accent) 15%, transparent)",
                borderLeft: "2px solid var(--accent)",
                borderRight: "2px solid var(--accent)",
              }}
            >
              <span className="w-px h-[11px] bg-[color-mix(in_srgb,var(--accent)_60%,transparent)]" />
              <span className="w-px h-[11px] bg-[color-mix(in_srgb,var(--accent)_60%,transparent)]" />
              <div
                onPointerDown={(e) => beginDrag("left", e)}
                className="absolute -left-[6px] -top-[2px] -bottom-[2px] w-[11px] flex items-center justify-center cursor-ew-resize"
              >
                <span className="w-1 h-4 bg-accent" />
              </div>
              <div
                onPointerDown={(e) => beginDrag("right", e)}
                className="absolute -right-[6px] -top-[2px] -bottom-[2px] w-[11px] flex items-center justify-center cursor-ew-resize"
              >
                <span className="w-1 h-4 bg-accent" />
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span className="font-mono text-[11px] text-muted">{readout}</span>
            <button
              type="button"
              onClick={() => {
                setPanelOpen(false);
                setOpenDropdown(null);
              }}
              className="font-mono text-[11px] uppercase tracking-[0.06em] text-paper bg-ink px-[15px] py-2 cursor-pointer"
            >
              {ti.rangeApply}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** One from/to month dropdown: a trigger plus a scrollable, highlight-on-select
 * month list. Kept private to the range control. */
function MonthPicker({
  label,
  aria,
  open,
  onToggle,
  span,
  selected,
  onPick,
  locale,
}: {
  label: string;
  aria: string;
  open: boolean;
  onToggle: () => void;
  span: string[];
  selected: number;
  onPick: (i: number) => void;
  locale: Parameters<typeof formatMonthShort>[1];
}) {
  return (
    <div className="relative flex-1">
      <button
        type="button"
        aria-label={aria}
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          "w-full box-border inline-flex items-center justify-between border bg-card px-[10px] py-[7px] font-mono text-[12.5px] text-ink cursor-pointer transition-colors",
          open ? "border-accent" : "border-line",
        )}
      >
        {label} <span className="text-muted">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+3px)] z-30 border border-line bg-card shadow-pop max-h-[184px] overflow-auto">
          {span.map((m, i) => {
            const active = i === selected;
            return (
              <button
                type="button"
                key={m}
                onClick={() => onPick(i)}
                className={cn(
                  "w-full text-left font-mono text-[12px] px-[11px] py-[7px] cursor-pointer border-l-2 transition-colors",
                  active
                    ? "text-ink border-l-accent bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]"
                    : "text-muted border-l-transparent bg-transparent hover:text-ink",
                )}
              >
                {tag(m, locale)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

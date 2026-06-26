"use client";

// Connective tissue shared by the builder cards: the chip language, the card
// shell, the value picker (a searchable dropdown of upstream values), the
// fallback chain, and the transforms pipeline. The cards themselves live in
// sibling files. Ported from the Claude Design prototype into Factura's
// Tailwind primitives (no inline styles).

import { useEffect, useRef, useState } from "react";
import { Button, Select, microLabel } from "@/components/ui";
import { type Dictionary, interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import type { ValueRec } from "@/parsers/builder/evaluate";
import type { ScopeValue, TransformOp } from "@/parsers/engine/types";
import { cn } from "@/lib/cn";

export type ValueOption = {
  name: string;
  origin: "capture" | "derive";
  rec?: ValueRec;
};

function move<T>(arr: T[], i: number, dir: number): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// ── chip ──────────────────────────────────────────────────────────────────────
const CHIP_BASE =
  "inline-block align-middle font-mono leading-tight rounded-none";
// `sm` chips (the dropdown / inline tokens) stay clamped + ellipsis to keep
// lists tidy — their full value shows in the title tooltip. `md` chips (the
// editor's live readouts) must show the whole value, wrapping if it's long.
const CHIP_CLAMP =
  "max-w-[230px] overflow-hidden text-ellipsis whitespace-nowrap";
const CHIP_FULL = "whitespace-normal break-all";

export function ValueChip({
  value,
  error,
  size = "md",
  title,
}: {
  value?: ScopeValue;
  error?: string | null;
  size?: "sm" | "md";
  title?: string;
}) {
  const { t } = useI18n();
  const sz =
    size === "sm" ? "text-[10.5px] py-px px-1.5" : "text-[11.5px] py-0.5 px-2";
  const wrap = size === "sm" ? CHIP_CLAMP : CHIP_FULL;
  if (error) {
    return (
      <span
        title={title ?? error}
        className={cn(
          CHIP_BASE,
          sz,
          wrap,
          "text-accent border border-accent bg-[color-mix(in_srgb,var(--accent)_7%,transparent)]",
        )}
      >
        △ {error}
      </span>
    );
  }
  if (value === undefined || value === null || value === "") {
    return (
      <span
        className={cn(
          CHIP_BASE,
          sz,
          "whitespace-nowrap text-muted border border-dashed border-line",
        )}
      >
        {t.builder.shared.noMatch}
      </span>
    );
  }
  return (
    <span
      title={title ?? String(value)}
      className={cn(
        CHIP_BASE,
        sz,
        wrap,
        "text-accent border border-accent font-medium",
      )}
    >
      {String(value)}
    </span>
  );
}

// ── card shell ──────────────────────────────────────────────────────────────
export function CardShell({
  derived,
  focused,
  children,
  onMouseEnter,
  onMouseLeave,
}: {
  derived?: boolean;
  focused?: boolean;
  children: React.ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        "border border-line bg-card p-3 mb-2.5 transition-[background,border-color,box-shadow] duration-150",
        derived &&
          "border-l-[color-mix(in_srgb,var(--accent)_45%,var(--line))] border-l-2 border-dashed",
        focused &&
          "shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_45%,transparent)]",
      )}
    >
      {children}
    </div>
  );
}

// ── small buttons ──────────────────────────────────────────────────────────────
export function XBtn({
  onClick,
  title,
}: {
  onClick: () => void;
  title?: string;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? t.builder.shared.remove}
      className="border-none bg-transparent cursor-pointer text-muted hover:text-accent text-xs font-mono px-0.5 leading-none"
    >
      ✕
    </button>
  );
}

export const arrowBtn =
  "border-none bg-transparent cursor-pointer text-muted hover:text-accent text-[10px] font-mono px-0.5 leading-none";

// ── Value Picker ──────────────────────────────────────────────────────────────
function useClickAway(
  ref: React.RefObject<HTMLElement | null>,
  onAway: () => void,
) {
  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onAway();
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ref, onAway]);
}

function ValueList({
  options,
  value,
  onPick,
  onPreview,
  onClose,
}: {
  options: ValueOption[];
  value: string;
  onPick: (name: string) => void;
  onPreview?: (name: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const ts = t.builder.shared;
  const [q, setQ] = useState("");
  const showSearch = options.length > 9;
  const filtered = q
    ? options.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()))
    : options;
  return (
    <div
      onMouseLeave={() => onPreview?.(null)}
      className="absolute top-[calc(100%+4px)] left-0 z-[60] w-[280px] bg-card border border-ink shadow-[var(--shadow-pop)] max-h-[300px] overflow-y-auto"
    >
      {showSearch && (
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={ts.filterValues}
          className="w-full box-border border-none border-b border-line bg-paper font-mono text-xs py-2 px-2.5 outline-none"
        />
      )}
      {value && (
        <button
          type="button"
          onClick={() => {
            onPick("");
            onClose();
          }}
          className="pb-vrow w-full text-left border-none border-b border-line bg-transparent cursor-pointer py-[7px] px-2.5 font-mono text-[11px] text-muted flex justify-between hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
        >
          <span>{ts.clearReference}</span>
          <span>✕</span>
        </button>
      )}
      {filtered.length === 0 && (
        <div className="p-2.5 font-mono text-[11.5px] text-muted">
          {ts.noValues}
        </div>
      )}
      {filtered.map((o) => {
        const active = o.name === value;
        return (
          <button
            type="button"
            key={o.name}
            onClick={() => {
              onPick(o.name);
              onClose();
            }}
            onMouseEnter={() => onPreview?.(o.name)}
            className={cn(
              "w-full text-left border-none border-b border-line cursor-pointer py-[7px] px-2.5 flex items-center justify-between gap-2.5 hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]",
              active
                ? "bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
                : "bg-transparent",
            )}
          >
            <span className="inline-flex items-center gap-1.5 min-w-0">
              {o.origin === "derive" && (
                <span
                  title={ts.computedValue}
                  className="text-accent text-[11px]"
                >
                  ≈
                </span>
              )}
              <span
                className={cn(
                  "font-mono text-xs text-ink truncate",
                  active && "font-semibold",
                )}
              >
                {o.name}
              </span>
            </span>
            <ValueChip value={o.rec?.value} error={o.rec?.error} size="sm" />
          </button>
        );
      })}
    </div>
  );
}

export function ValuePicker({
  value,
  options,
  onChange,
  onPreview,
  variant = "A",
  placeholder,
}: {
  value: string;
  options: ValueOption[];
  onChange: (name: string) => void;
  onPreview?: (name: string | null) => void;
  variant?: "A" | "B";
  placeholder?: string;
}) {
  const { t } = useI18n();
  const ph = placeholder ?? t.builder.shared.pickValue;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | HTMLSpanElement>(null);
  useClickAway(ref, () => {
    setOpen(false);
    onPreview?.(null);
  });
  const opt = value ? options.find((o) => o.name === value) : undefined;
  const rec = opt?.rec;
  const isDerived = opt?.origin === "derive";
  const list = open ? (
    <ValueList
      options={options}
      value={value}
      onPick={onChange}
      onPreview={onPreview}
      onClose={() => setOpen(false)}
    />
  ) : null;

  if (variant === "B") {
    const empty = !value;
    return (
      <span
        ref={ref as React.RefObject<HTMLSpanElement>}
        className="relative inline-block"
        onMouseEnter={() => value && onPreview?.(value)}
        onMouseLeave={() => !open && onPreview?.(null)}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "inline-flex items-center gap-1.5 cursor-pointer py-[3px] px-[7px] font-mono text-[11.5px] border rounded-none",
            empty
              ? "border-dashed border-line bg-transparent text-muted"
              : "border-line bg-paper text-ink",
          )}
        >
          {empty ? (
            <span>{t.builder.shared.addValue}</span>
          ) : (
            <>
              {isDerived && <span className="text-accent">≈</span>}
              <span>{value}</span>
              <ValueChip value={rec?.value} error={rec?.error} size="sm" />
              <span className="text-muted text-[9px]">▾</span>
            </>
          )}
        </button>
        {list}
      </span>
    );
  }

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className="relative"
      onMouseEnter={() => value && onPreview?.(value)}
      onMouseLeave={() => !open && onPreview?.(null)}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full box-border flex items-center justify-between gap-2 bg-paper cursor-pointer py-[7px] px-2.5 rounded-none border transition-colors",
          open ? "border-accent" : "border-line",
        )}
      >
        <span className="inline-flex items-center gap-1.5 min-w-0">
          {value ? (
            <>
              {isDerived && <span className="text-accent text-[11px]">≈</span>}
              <span className="font-mono text-[12.5px] text-ink truncate">
                {value}
              </span>
            </>
          ) : (
            <span className="font-mono text-xs text-muted">{ph}</span>
          )}
        </span>
        <span className="inline-flex items-center gap-2">
          {value && (
            <ValueChip value={rec?.value} error={rec?.error} size="sm" />
          )}
          <span className="text-muted text-[10px]">▾</span>
        </span>
      </button>
      {list}
    </div>
  );
}

// ── fallback chain ──────────────────────────────────────────────────────────────
export function FallbackChain({
  refs,
  options,
  onChange,
  onPreview,
}: {
  refs: string[];
  options: ValueOption[];
  onChange: (refs: string[]) => void;
  onPreview?: (name: string | null) => void;
}) {
  const { t } = useI18n();
  const ts = t.builder.shared;
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {refs.map((r, i) => (
        <span key={i} className="inline-flex items-center gap-0.5">
          {i > 0 && (
            <span className="font-mono text-[10px] text-muted mr-1">
              {ts.then}
            </span>
          )}
          <ValuePicker
            value={r}
            options={options}
            variant="B"
            onPreview={onPreview}
            onChange={(v) => {
              const n = refs.slice();
              if (v === "") n.splice(i, 1);
              else n[i] = v;
              onChange(n);
            }}
          />
          {i > 0 && (
            <button
              type="button"
              onClick={() => onChange(move(refs, i, -1))}
              title={ts.earlier}
              className={arrowBtn}
            >
              ‹
            </button>
          )}
        </span>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange([...refs, ""])}
      >
        {ts.addFallback}
      </Button>
    </div>
  );
}

// ── transforms pipeline ──────────────────────────────────────────────────────
// Values are stable engine identifiers; labels come from the dictionary
// (builder.shared.transformOpts), keyed by value.
const TRANSFORM_VALUES = [
  "numberAR",
  "numberUS",
  "centsToAmount",
  "stripLeadingZeros",
  "toInt",
  "monthOf",
  "monthYear",
  "lowercase",
  "parseDate:DMY",
  "parseDate:YYMMDD",
] as const;

type TransformsDict = Dictionary["builder"]["shared"];

function transformLabel(op: string | TransformOp, ts: TransformsDict): string {
  if (typeof op === "string") {
    return ts.transformOpts[op as keyof typeof ts.transformOpts] ?? op;
  }
  if ("parseDate" in op) return interpolate(ts.dateOf, { x: op.parseDate });
  if ("slice" in op) return interpolate(ts.firstChars, { n: op.slice });
  if ("lookup" in op)
    return interpolate(ts.lookup, { x: Object.keys(op.lookup).join("/") });
  return JSON.stringify(op);
}

export function TransformsEditor({
  transforms,
  onChange,
}: {
  transforms: (string | TransformOp)[];
  onChange: (t: (string | TransformOp)[]) => void;
}) {
  const { t } = useI18n();
  const ts = t.builder.shared;
  return (
    <div className="mt-2">
      <span className={microLabel}>{ts.transforms}</span>
      <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
        {transforms.map((op, i) =>
          typeof op === "object" ? (
            <span
              key={i}
              className="inline-flex items-center gap-1 border border-line bg-paper py-1 px-[7px] font-mono text-[11px] text-ink"
            >
              {transformLabel(op, ts)}
              <XBtn
                onClick={() => onChange(transforms.filter((_, j) => j !== i))}
              />
            </span>
          ) : (
            <span key={i} className="inline-flex items-center gap-0.5">
              <Select
                value={op}
                className="w-auto py-1 px-1.5 text-[11.5px]"
                onChange={(e) =>
                  onChange(
                    transforms.map((x, j) => (j === i ? e.target.value : x)),
                  )
                }
              >
                {TRANSFORM_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {ts.transformOpts[v]}
                  </option>
                ))}
              </Select>
              <XBtn
                onClick={() => onChange(transforms.filter((_, j) => j !== i))}
              />
            </span>
          ),
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange([...transforms, TRANSFORM_VALUES[0]])}
        >
          {ts.addTransform}
        </Button>
      </div>
    </div>
  );
}

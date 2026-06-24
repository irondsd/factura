"use client";

// The structured-builder cards: Capture (Extract), Derive, Role, Custom — plus
// the connective Value Picker and the chip language they all share. Ported from
// the Claude Design prototype into Factura's Tailwind primitives (no inline
// styles). Live records (value / error / spans) come from the page's single
// pipeline evaluation; hovering a value calls onPreview to highlight its span.

import { useEffect, useRef, useState } from "react";
import { Button, Input, Select, microLabel } from "@/components/ui";
import type { ScopeValue, TransformOp } from "@/parsers/engine/types";
import type { ValueRec } from "@/parsers/builder/evaluate";
import type {
  BuilderCapture,
  BuilderDerive,
  CustomDef,
  DeriveKind,
  RoleDef,
} from "@/parsers/builder/model";
import { newOutput } from "@/parsers/builder/model";
import { cn } from "@/lib/cn";

export const hint = "font-mono text-[11.5px] text-muted leading-[1.6]";

export type ValueOption = {
  name: string;
  origin: "capture" | "derive";
  rec?: ValueRec;
};

const TRANSFORM_OPTS: { value: string; label: string }[] = [
  { value: "numberAR", label: "AR number (1.234,56)" },
  { value: "numberUS", label: "US number (1,234.56)" },
  { value: "centsToAmount", label: "cents ÷ 100" },
  { value: "stripLeadingZeros", label: "strip leading zeros" },
  { value: "toInt", label: "to integer" },
  { value: "monthOf", label: "month of date" },
  { value: "monthYear", label: "month-year → period" },
  { value: "lowercase", label: "lowercase" },
  { value: "parseDate:DMY", label: "date DD/MM/YYYY" },
  { value: "parseDate:YYMMDD", label: "date YYMMDD" },
];

function transformLabel(op: string | TransformOp): string {
  if (typeof op === "string") {
    return TRANSFORM_OPTS.find((o) => o.value === op)?.label ?? op;
  }
  if ("parseDate" in op) return `date ${op.parseDate}`;
  if ("slice" in op) return `first ${op.slice} chars`;
  if ("lookup" in op) return `lookup ${Object.keys(op.lookup).join("/")}`;
  return JSON.stringify(op);
}

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
        no match
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
function XBtn({ onClick, title }: { onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? "remove"}
      className="border-none bg-transparent cursor-pointer text-muted hover:text-accent text-xs font-mono px-0.5 leading-none"
    >
      ✕
    </button>
  );
}

const arrowBtn =
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
          placeholder="filter values…"
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
          <span>clear reference</span>
          <span>✕</span>
        </button>
      )}
      {filtered.length === 0 && (
        <div className="p-2.5 font-mono text-[11.5px] text-muted">
          No values defined yet.
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
                  title="computed value"
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
  placeholder = "pick a value",
}: {
  value: string;
  options: ValueOption[];
  onChange: (name: string) => void;
  onPreview?: (name: string | null) => void;
  variant?: "A" | "B";
  placeholder?: string;
}) {
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
            <span>+ value</span>
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
            <span className="font-mono text-xs text-muted">{placeholder}</span>
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
function FallbackChain({
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
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {refs.map((r, i) => (
        <span key={i} className="inline-flex items-center gap-0.5">
          {i > 0 && (
            <span className="font-mono text-[10px] text-muted mr-1">then</span>
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
              title="earlier"
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
        + fallback
      </Button>
    </div>
  );
}

// ── transforms pipeline ──────────────────────────────────────────────────────
function TransformsEditor({
  transforms,
  onChange,
}: {
  transforms: (string | TransformOp)[];
  onChange: (t: (string | TransformOp)[]) => void;
}) {
  return (
    <div className="mt-2">
      <span className={microLabel}>Transforms</span>
      <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
        {transforms.map((t, i) =>
          typeof t === "object" ? (
            <span
              key={i}
              className="inline-flex items-center gap-1 border border-line bg-paper py-1 px-[7px] font-mono text-[11px] text-ink"
            >
              {transformLabel(t)}
              <XBtn
                onClick={() => onChange(transforms.filter((_, j) => j !== i))}
              />
            </span>
          ) : (
            <span key={i} className="inline-flex items-center gap-0.5">
              <Select
                value={t}
                className="w-auto py-1 px-1.5 text-[11.5px]"
                onChange={(e) =>
                  onChange(
                    transforms.map((x, j) => (j === i ? e.target.value : x)),
                  )
                }
              >
                {TRANSFORM_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
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
          onClick={() => onChange([...transforms, TRANSFORM_OPTS[0].value])}
        >
          + transform
        </Button>
      </div>
    </div>
  );
}

// ── Capture card (Extract) ────────────────────────────────────────────────────
export function CaptureCard({
  cap,
  recOf,
  onChange,
  onRemove,
  onPreview,
}: {
  cap: BuilderCapture;
  recOf: (name: string) => ValueRec | undefined;
  onChange: (c: BuilderCapture) => void;
  onRemove?: () => void;
  onPreview: (name: string | null) => void;
}) {
  let invalid = false;
  if (cap.pattern.trim()) {
    try {
      new RegExp(cap.pattern, cap.flags || undefined);
    } catch {
      invalid = true;
    }
  }
  const multi = cap.outputs.length > 1;
  const setOut = (
    i: number,
    patch: Partial<BuilderCapture["outputs"][number]>,
  ) =>
    onChange({
      ...cap,
      outputs: cap.outputs.map((o, j) => (j === i ? { ...o, ...patch } : o)),
    });

  return (
    <CardShell>
      <div className="flex items-center gap-2 mb-2">
        <span className={cn(microLabel, "flex-none")}>Regex</span>
        <div className="flex-1 min-w-0 flex gap-1.5">
          <Input
            value={cap.pattern}
            placeholder="regex with a (capture group)"
            className={cn("text-xs", invalid && "border-accent")}
            onChange={(e) => onChange({ ...cap, pattern: e.target.value })}
          />
          <Input
            value={cap.flags}
            placeholder="i"
            className="w-11! flex-none text-center"
            onChange={(e) => onChange({ ...cap, flags: e.target.value })}
          />
        </div>
        {onRemove && <XBtn onClick={onRemove} title="remove capture" />}
      </div>
      {invalid && (
        <p className={cn(hint, "text-accent mb-2")}>
          △ invalid regex — still typing?
        </p>
      )}
      {multi && (
        <p className={cn(hint, "mb-2")}>
          One regex, {cap.outputs.length} named values — the groups below feed
          each.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {cap.outputs.map((o, i) => {
          const rec = recOf(o.name);
          return (
            <div
              key={o.id}
              onMouseEnter={() => onPreview(o.name)}
              onMouseLeave={() => onPreview(null)}
              className={cn(
                "pt-2",
                i === 0 ? "pt-0" : "border-t border-dashed border-line",
              )}
            >
              <div className="flex items-center gap-2">
                <Input
                  value={o.name}
                  placeholder="value name"
                  className="text-xs font-medium"
                  onChange={(e) => setOut(i, { name: e.target.value })}
                />
                <span className="inline-flex items-center gap-1 flex-none">
                  <span className={microLabel}>grp</span>
                  <Input
                    value={String(o.group)}
                    className="w-14! text-center text-xs"
                    onChange={(e) => setOut(i, { group: e.target.value })}
                  />
                </span>
                {multi && (
                  <XBtn
                    onClick={() =>
                      onChange({
                        ...cap,
                        outputs: cap.outputs.filter((_, j) => j !== i),
                      })
                    }
                    title="remove output"
                  />
                )}
              </div>
              <div className="mt-1.5">
                <ValueChip value={rec?.value} error={rec?.error} />
              </div>
              <TransformsEditor
                transforms={o.transforms}
                onChange={(t) => setOut(i, { transforms: t })}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            onChange({ ...cap, outputs: [...cap.outputs, newOutput()] })
          }
        >
          + add output
        </Button>
      </div>
    </CardShell>
  );
}

// ── Derive card ─────────────────────────────────────────────────────────────
const DERIVE_KINDS: { value: DeriveKind; label: string }[] = [
  { value: "fallback", label: "Fallback — first that exists" },
  { value: "math", label: "Math — an expression" },
  { value: "dateParts", label: "Date from parts" },
  { value: "datePart", label: "Pick part of a date" },
  { value: "constWhen", label: "Constant when present" },
];

function MathField({
  expr,
  options,
  rec,
  onChange,
}: {
  expr: string;
  options: ValueOption[];
  rec?: ValueRec;
  onChange: (e: string) => void;
}) {
  const names = options.map((o) => o.name);
  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 border bg-paper py-1.5 px-2.5",
          rec?.error ? "border-accent" : "border-line",
        )}
      >
        <span className="font-mono text-[13px] text-accent">ƒ</span>
        <input
          value={expr}
          onChange={(e) => onChange(e.target.value)}
          list="pb-value-names"
          spellCheck={false}
          placeholder="e.g. kwh / periodMonths"
          className="flex-1 border-none bg-transparent outline-none font-mono text-[13px] text-ink"
        />
      </div>
      <datalist id="pb-value-names">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {rec?.error ? (
        <p className={cn(hint, "text-accent mt-1.5")}>△ {rec.error}</p>
      ) : (
        <p className={cn(hint, "mt-1.5")}>
          References:{" "}
          {names.length
            ? names.slice(0, 6).join(" · ") + (names.length > 6 ? " …" : "")
            : "no values above yet"}
        </p>
      )}
    </div>
  );
}

function DerivePicker({
  label,
  value,
  options,
  onPreview,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  options: ValueOption[];
  onPreview: (name: string | null) => void;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="min-w-[150px]">
      <span className={microLabel}>{label}</span>
      <div className="mt-1">
        <ValuePicker
          value={value}
          options={options}
          onPreview={onPreview}
          onChange={onChange}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}

export function DeriveCard({
  der,
  recOf,
  options,
  onChange,
  onRemove,
  onPreview,
  focusKey,
  moveUp,
  moveDown,
}: {
  der: BuilderDerive;
  recOf: (name: string) => ValueRec | undefined;
  options: ValueOption[];
  onChange: (d: BuilderDerive) => void;
  onRemove: () => void;
  onPreview: (name: string | null) => void;
  focusKey: string | null;
  moveUp: () => void;
  moveDown: () => void;
}) {
  const rec = recOf(der.name);
  return (
    <CardShell
      derived
      focused={focusKey === der.name}
      onMouseEnter={() => onPreview(der.name)}
      onMouseLeave={() => onPreview(null)}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-accent text-xs flex-none" title="computed value">
          ≈
        </span>
        <Input
          value={der.name}
          placeholder="value name"
          className="text-xs font-semibold max-w-[170px]"
          onChange={(e) => onChange({ ...der, name: e.target.value })}
        />
        <Select
          value={der.kind}
          className="w-auto text-[11.5px] py-1.5 px-2"
          onChange={(e) =>
            onChange({ ...der, kind: e.target.value as DeriveKind })
          }
        >
          {DERIVE_KINDS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <span className="ml-auto inline-flex items-center gap-1">
          <ValueChip value={rec?.value} error={rec?.error} />
          <button
            type="button"
            onClick={moveUp}
            title="move up"
            className={arrowBtn}
          >
            ▲
          </button>
          <button
            type="button"
            onClick={moveDown}
            title="move down"
            className={arrowBtn}
          >
            ▼
          </button>
          <XBtn onClick={onRemove} title="remove" />
        </span>
      </div>

      {der.kind === "fallback" && (
        <FallbackChain
          refs={der.sources ?? []}
          options={options}
          onPreview={onPreview}
          onChange={(sources) => onChange({ ...der, sources })}
        />
      )}
      {der.kind === "math" && (
        <MathField
          expr={der.expr ?? ""}
          options={options}
          rec={rec}
          onChange={(expr) => onChange({ ...der, expr })}
        />
      )}
      {der.kind === "dateParts" && (
        <div className="flex flex-wrap gap-3.5 items-end">
          <DerivePicker
            label="Year"
            value={der.yearRef ?? ""}
            options={options}
            onPreview={onPreview}
            onChange={(v) => onChange({ ...der, yearRef: v })}
            placeholder="year value"
          />
          <DerivePicker
            label="Month"
            value={der.monthRef ?? ""}
            options={options}
            onPreview={onPreview}
            onChange={(v) => onChange({ ...der, monthRef: v })}
            placeholder="month value"
          />
          <label className="flex flex-col gap-1.5 w-16">
            <span className={microLabel}>Day</span>
            <Input
              value={String(der.day ?? 1)}
              className="text-center"
              onChange={(e) =>
                onChange({ ...der, day: Number(e.target.value) || 1 })
              }
            />
          </label>
          <label className="flex flex-col gap-1.5 w-[74px]">
            <span className={microLabel}>± months</span>
            <Input
              type="number"
              value={String(der.shift ?? 0)}
              className="text-center"
              onChange={(e) =>
                onChange({
                  ...der,
                  shift: Math.trunc(Number(e.target.value) || 0),
                })
              }
            />
          </label>
        </div>
      )}
      {der.kind === "datePart" && (
        <div className="flex flex-wrap gap-3.5 items-end">
          <div className="min-w-[180px] flex-1">
            <DerivePicker
              label="Date value"
              value={der.dateRef ?? ""}
              options={options}
              onPreview={onPreview}
              onChange={(v) => onChange({ ...der, dateRef: v })}
              placeholder="a date value"
            />
          </div>
          <label className="flex flex-col gap-1.5 w-[110px]">
            <span className={microLabel}>Take</span>
            <Select
              value={der.part ?? "year"}
              onChange={(e) =>
                onChange({
                  ...der,
                  part: e.target.value as "year" | "month" | "day",
                })
              }
            >
              <option value="year">year</option>
              <option value="month">month</option>
              <option value="day">day</option>
            </Select>
          </label>
        </div>
      )}
      {der.kind === "constWhen" && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="font-mono text-xs text-muted">use</span>
          <Input
            value={String(der.constValue ?? "")}
            className="w-[70px]! text-center text-[13px]"
            onChange={(e) =>
              onChange({ ...der, constValue: Number(e.target.value) })
            }
          />
          <span className="font-mono text-xs text-muted">when</span>
          <ValuePicker
            value={der.whenRef ?? ""}
            options={options}
            variant="B"
            onPreview={onPreview}
            placeholder="value exists"
            onChange={(v) => onChange({ ...der, whenRef: v })}
          />
          <span className="font-mono text-xs text-muted">exists</span>
        </div>
      )}
    </CardShell>
  );
}

// ── Role card ─────────────────────────────────────────────────────────────────
export function RoleCard({
  label,
  role,
  options,
  resolved,
  onChange,
  onPreview,
  focusKey,
}: {
  label: string;
  role: RoleDef;
  options: ValueOption[];
  resolved?: { value: ScopeValue; disagree: boolean };
  onChange: (r: RoleDef) => void;
  onPreview: (name: string | null) => void;
  focusKey: string | null;
}) {
  const disagree = resolved?.disagree ?? false;
  const focused =
    !!focusKey &&
    (role.primary === focusKey || role.fallbacks.includes(focusKey));
  return (
    <CardShell focused={focused}>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="font-mono text-xs font-semibold text-ink flex-1">
          {label}
        </span>
        {resolved ? (
          <ValueChip
            value={resolved.value}
            error={disagree ? "review" : null}
            title={disagree ? "sources disagree" : ""}
          />
        ) : (
          <ValueChip />
        )}
      </div>
      <div className="flex flex-col gap-2.5">
        <div>
          <span className={microLabel}>Use this value</span>
          <div className="mt-1">
            <ValuePicker
              value={role.primary}
              options={options}
              onPreview={onPreview}
              onChange={(v) => onChange({ ...role, primary: v })}
            />
          </div>
        </div>
        <div>
          <span className={microLabel}>If missing, try…</span>
          <div className="mt-1">
            <FallbackChain
              refs={role.fallbacks}
              options={options}
              onPreview={onPreview}
              onChange={(fallbacks) => onChange({ ...role, fallbacks })}
            />
          </div>
        </div>
        <label
          className={cn(
            "inline-flex items-center gap-2 cursor-pointer font-mono text-[11.5px]",
            disagree ? "text-accent" : "text-muted",
          )}
        >
          <input
            type="checkbox"
            checked={role.mustAgree}
            onChange={(e) => onChange({ ...role, mustAgree: e.target.checked })}
          />
          Must agree — flag for review if present sources disagree
          {disagree && <span className="text-accent">△ disagree</span>}
        </label>
      </div>
    </CardShell>
  );
}

// ── Custom field card ──────────────────────────────────────────────────────────
export function CustomCard({
  field,
  options,
  recOf,
  onChange,
  onRemove,
  onPreview,
  focusKey,
}: {
  field: CustomDef;
  options: ValueOption[];
  recOf: (name: string) => ValueRec | undefined;
  onChange: (f: CustomDef) => void;
  onRemove: () => void;
  onPreview: (name: string | null) => void;
  focusKey: string | null;
}) {
  const rec = field.source ? recOf(field.source) : undefined;
  return (
    <CardShell focused={!!focusKey && field.source === focusKey}>
      <div className="flex items-center gap-2 mb-2.5">
        <Input
          value={field.name}
          placeholder="field name (e.g. consumption)"
          className="text-xs font-semibold flex-1"
          onChange={(e) => onChange({ ...field, name: e.target.value })}
        />
        <ValueChip value={rec?.value} error={rec?.error} />
        <XBtn onClick={onRemove} title="remove field" />
      </div>
      <div className="flex flex-col gap-2.5">
        <div>
          <span className={microLabel}>Source value</span>
          <div className="mt-1">
            <ValuePicker
              value={field.source}
              options={options}
              onPreview={onPreview}
              onChange={(v) => onChange({ ...field, source: v })}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-3.5 items-end">
          <label className="flex flex-col gap-1.5 w-[120px]">
            <span className={microLabel}>Type</span>
            <Select
              value={field.type}
              onChange={(e) =>
                onChange({
                  ...field,
                  type: e.target.value as CustomDef["type"],
                })
              }
            >
              {["money", "number", "date", "string", "quantity"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </label>
          {field.type === "quantity" && (
            <label className="flex flex-col gap-1.5 w-[100px]">
              <span className={microLabel}>Unit</span>
              <Input
                value={field.unit}
                placeholder="kWh, m³…"
                onChange={(e) => onChange({ ...field, unit: e.target.value })}
              />
            </label>
          )}
          <label className="flex flex-col gap-1.5 flex-1 min-w-[160px]">
            <span className={microLabel}>Only when (optional)</span>
            <Input
              value={field.includeWhen}
              placeholder="e.g. barcode.surcharge > 0"
              className="text-xs"
              onChange={(e) =>
                onChange({ ...field, includeWhen: e.target.value })
              }
            />
          </label>
        </div>
      </div>
    </CardShell>
  );
}

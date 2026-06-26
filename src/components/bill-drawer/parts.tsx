"use client";

import type { ReactNode } from "react";
import { Delta } from "@/components/charts/primitives";
import { Field, Input, microLabel, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatMonthShort } from "@/lib/format";
import type { RouterOutputs } from "@/lib/trpc";

type Bill = NonNullable<RouterOutputs["bills"]["get"]>;

/** The editable shape both drawers seed from a loaded bill. */
export type Draft = {
  vendorId: string;
  propertyId: string;
  period: string;
  totalAmount: string;
  dueDate: string;
};

export function draftFromBill(bill: Bill): Draft {
  return {
    vendorId: bill.vendorId ?? "",
    propertyId: bill.propertyId ?? "",
    period: bill.period ? bill.period.slice(0, 7) : "",
    totalAmount: bill.totalAmount ?? "",
    dueDate: bill.dueDate ?? "",
  };
}

/** Render an engine custom field (string | number | {value,unit}). */
export function formatCustom(v: unknown): string {
  if (v && typeof v === "object" && "value" in v) {
    const q = v as { value: number; unit?: string };
    return `${q.value}${q.unit ? ` ${q.unit}` : ""}`;
  }
  return String(v);
}

export type ReviewKind = "unrecognized" | "parse_failed" | "needs_home" | null;

/** The three flavours of needs_review, each with a different primary action. */
export function reviewKindOf(bill: Bill): ReviewKind {
  if (bill.status !== "needs_review") return null;
  const extra = (bill.extra ?? {}) as Record<string, unknown>;
  const parseError = extra.parseError as string | undefined;
  return !bill.parserKey
    ? "unrecognized"
    : parseError
      ? "parse_failed"
      : "needs_home";
}

export function reviewLabelOf(kind: ReviewKind, parseError?: string): string {
  return kind === "unrecognized"
    ? "Needs review · no parser recognized this bill"
    : kind === "parse_failed"
      ? `Needs review · ${parseError ?? "parser failed"}`
      : kind === "needs_home"
        ? "Needs review · pick a property"
        : "Edit bill";
}

// ── Presentational pieces ────────────────────────────────────────────────────
export function DrawerHeader({
  reviewLabel,
  review,
  title,
  fileName,
  onClose,
}: {
  reviewLabel: string;
  review: boolean;
  title: ReactNode;
  fileName?: string | null;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 pt-[22px] px-6 pb-4 border-b border-dashed border-line">
      <div>
        <p
          className={cn(
            "font-mono text-[10px] uppercase tracking-[0.22em]",
            review ? "text-accent" : "text-muted",
          )}
        >
          {reviewLabel}
        </p>
        <h2 className="font-display font-semibold text-[22px] mt-2 tracking-tight">
          {title}
        </h2>
        <p className="font-mono text-micro text-muted mt-1">{fileName}</p>
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        className="bg-transparent border-none cursor-pointer text-muted text-base leading-none transition-colors hover:text-accent"
      >
        ✕
      </button>
    </div>
  );
}

export function YoyStrip({ yoy }: { yoy: Bill["yoy"] }) {
  if (!yoy) return null;
  return (
    <div className="mt-4 mx-6 py-2.5 px-[14px] border border-line flex items-center gap-2.5 flex-wrap">
      <span className="font-mono text-micro text-muted">
        vs {formatMonthShort(yoy.prevPeriod)} {yoy.prevPeriod.slice(0, 4)}:
      </span>
      <span className="font-mono text-xs">
        <Delta pct={yoy.arsPct} /> in ARS
      </span>
      {yoy.usdPct != null && (
        <span className="font-mono text-xs text-muted">
          · {yoy.usdPct > 0 ? "+" : ""}
          {yoy.usdPct.toFixed(0)}% in USD
        </span>
      )}
    </div>
  );
}

type VendorOpt = { id: string; displayName: string };
type PropertyOpt = { id: string; nickname: string };

/** The five editable bill fields. Shared by the real drawer (interactive) and
 * the demo drawer (`disabled`, no `onChange`). */
export function BillFields({
  draft,
  onChange,
  vendors,
  properties,
  disabled = false,
}: {
  draft: Draft;
  onChange?: (next: Draft) => void;
  vendors: VendorOpt[];
  properties: PropertyOpt[];
  disabled?: boolean;
}) {
  const set = (patch: Partial<Draft>) => onChange?.({ ...draft, ...patch });
  return (
    <div className="py-5 px-6 grid grid-cols-1 md:grid-cols-2 gap-[14px]">
      <Field label="Vendor">
        <Select
          value={draft.vendorId}
          disabled={disabled}
          onChange={(e) => set({ vendorId: e.target.value })}
        >
          <option value="" disabled>
            Vendor
          </option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.displayName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Property">
        <Select
          value={draft.propertyId}
          disabled={disabled}
          onChange={(e) => set({ propertyId: e.target.value })}
        >
          <option value="" disabled>
            Property
          </option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nickname}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Period">
        <Input
          type="month"
          value={draft.period}
          disabled={disabled}
          className={cn(disabled && "opacity-55 cursor-not-allowed")}
          onChange={(e) => set({ period: e.target.value })}
        />
      </Field>
      <Field label="Due date">
        <Input
          type="date"
          value={draft.dueDate}
          disabled={disabled}
          className={cn(disabled && "opacity-55 cursor-not-allowed")}
          onChange={(e) => set({ dueDate: e.target.value })}
        />
      </Field>
      <Field label="Amount (ARS)">
        <Input
          type="number"
          value={draft.totalAmount}
          disabled={disabled}
          className={cn(disabled && "opacity-55 cursor-not-allowed")}
          onChange={(e) => set({ totalAmount: e.target.value })}
        />
      </Field>
    </div>
  );
}

/** Read-only parser-extracted custom fields. */
export function ExtractedFields({
  fields,
}: {
  fields: Record<string, unknown>;
}) {
  const entries = Object.entries(fields);
  if (entries.length === 0) return null;
  return (
    <div className="px-6 pb-1">
      <p className={cn(microLabel, "mb-1.5")}>Extracted fields</p>
      <div className="border border-line bg-paper">
        {entries.map(([k, v], i) => (
          <div
            key={k}
            className={cn(
              "flex justify-between gap-3 py-2 px-3 font-mono text-xs",
              i === 0 ? "" : "border-t border-dashed border-line",
            )}
          >
            <span className="text-muted">{k}</span>
            <span>{formatCustom(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A labeled hairline box — used for the parser and original-file rows. */
export function LabeledRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="px-6 pb-1">
      <p className={cn(microLabel, "mb-1.5")}>{label}</p>
      <div className="flex items-center gap-2.5 border border-line py-2.5 px-3 bg-paper">
        {children}
      </div>
    </div>
  );
}

export function OriginalFileRow({
  fileName,
  downloadUrl,
}: {
  fileName?: string | null;
  downloadUrl?: string | null;
}) {
  return (
    <>
      <LabeledRow label="Original file">
        <span className="font-mono text-xs flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
          {fileName ?? "(pasted text)"}
          <span className="text-muted"> · PDF</span>
        </span>
        {downloadUrl ? (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-micro uppercase tracking-[0.1em] text-accent underline decoration-dotted underline-offset-[3px] whitespace-nowrap transition-colors hover:text-ink"
          >
            View PDF ›
          </a>
        ) : (
          <span className="font-mono text-micro text-muted">not stored</span>
        )}
      </LabeledRow>
      <p className="font-mono text-[10.5px] text-muted mt-2 px-6">
        Stored securely (S3) alongside the extracted text below.
      </p>
    </>
  );
}

export function ExtractedText({ text }: { text: string }) {
  return (
    <div className="pt-4 px-6 pb-1">
      <p className={cn(microLabel, "mb-1.5")}>Extracted text</p>
      <pre className="ruled font-mono text-[12.5px] whitespace-pre-wrap text-ink bg-paper border border-line pt-1 px-3 pb-2.5 max-h-[240px] overflow-y-auto">
        {text}
      </pre>
    </div>
  );
}

export function ReparseOption({
  title,
  caption,
  onClick,
  disabled,
}: {
  title: string;
  caption: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex-1 text-left bg-transparent border border-line py-2.5 px-3 transition-colors hover:border-accent",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer opacity-100",
      )}
    >
      <span className="block font-mono text-xs font-medium text-ink">
        {title}
      </span>
      <span className="block font-mono text-[10.5px] text-muted mt-1 leading-[1.5]">
        {caption}
      </span>
    </button>
  );
}

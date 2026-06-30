"use client";

import type { ReactNode } from "react";
import { Delta } from "@/components/charts/primitives";
import { Field, Input, microLabel, Select } from "@/components/ui";
import type { Dictionary } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { formatMonthShort } from "@/lib/format";
import type { RouterOutputs } from "@/lib/trpc";
import type { CustomField } from "@/parsers/engine/types";

type Bill = NonNullable<RouterOutputs["bills"]["get"]>;

/** The editable shape both drawers seed from a loaded bill. `custom` holds the
 * raw input strings for parser custom fields, keyed by field name. */
export type Draft = {
  vendorId: string;
  propertyId: string;
  period: string;
  totalAmount: string;
  dueDate: string;
  custom: Record<string, string>;
};

/** Stringify a stored custom value back into an editable input string. */
function customToInput(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && "value" in v)
    return String((v as { value: unknown }).value ?? "");
  return String(v);
}

export function draftFromBill(bill: Bill): Draft {
  const extra = (bill.extra ?? {}) as Record<string, unknown>;
  const fields = (extra.fields ?? {}) as Record<string, unknown>;
  const custom: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) custom[k] = customToInput(v);
  return {
    vendorId: bill.vendorId ?? "",
    propertyId: bill.propertyId ?? "",
    period: bill.period ? bill.period.slice(0, 7) : "",
    totalAmount: bill.totalAmount ?? "",
    dueDate: bill.dueDate ?? "",
    custom,
  };
}

/** Turn the draft's raw custom inputs back into the engine's stored shapes,
 * keyed by field name. Empty inputs are skipped. Returns undefined when nothing
 * was filled, so `bills.update` leaves `extra.fields` untouched. */
export function buildCustomPayload(
  defs: CustomField[],
  values: Record<string, string>,
): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const def of defs) {
    const raw = values[def.name]?.trim();
    if (!raw) continue;
    if (def.type === "quantity") {
      out[def.name] = { value: Number(raw), unit: def.unit ?? "" };
    } else if (def.type === "money" || def.type === "number") {
      out[def.name] = Number(raw);
    } else {
      out[def.name] = raw;
    }
  }
  return Object.keys(out).length ? out : undefined;
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

export function reviewLabelOf(
  kind: ReviewKind,
  t: Dictionary["billDrawer"],
  parseError?: string,
): string {
  return kind === "unrecognized"
    ? t.reviewUnrecognized
    : kind === "parse_failed"
      ? `${t.reviewParseFailedPrefix}${parseError ?? t.reviewParseFailedDefault}`
      : kind === "needs_home"
        ? t.reviewNeedsHome
        : t.editBill;
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
  const { t } = useI18n();
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
        aria-label={t.billDrawer.close}
        className="bg-transparent border-none cursor-pointer text-muted text-base leading-none transition-colors hover:text-accent"
      >
        ✕
      </button>
    </div>
  );
}

export function YoyStrip({ yoy }: { yoy: Bill["yoy"] }) {
  const { t, locale } = useI18n();
  if (!yoy) return null;
  return (
    <div className="mt-4 mx-6 py-2.5 px-[14px] border border-line flex items-center gap-2.5 flex-wrap">
      <span className="font-mono text-micro text-muted">
        {t.billDrawer.vs} {formatMonthShort(yoy.prevPeriod, locale)}{" "}
        {yoy.prevPeriod.slice(0, 4)}:
      </span>
      <span className="font-mono text-xs">
        <Delta pct={yoy.arsPct} /> {t.billDrawer.inArs}
      </span>
      {yoy.usdPct != null && (
        <span className="font-mono text-xs text-muted">
          · {yoy.usdPct > 0 ? "+" : ""}
          {yoy.usdPct.toFixed(0)}% {t.billDrawer.inUsd}
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
  const { t } = useI18n();
  const tb = t.billDrawer;
  const set = (patch: Partial<Draft>) => onChange?.({ ...draft, ...patch });
  return (
    <div className="py-5 px-6 grid grid-cols-1 md:grid-cols-2 gap-[14px]">
      <Field label={tb.vendor}>
        <Select
          value={draft.vendorId}
          disabled={disabled}
          onChange={(e) => set({ vendorId: e.target.value })}
        >
          <option value="" disabled>
            {tb.vendor}
          </option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.displayName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={tb.property}>
        <Select
          value={draft.propertyId}
          disabled={disabled}
          onChange={(e) => set({ propertyId: e.target.value })}
        >
          <option value="" disabled>
            {tb.property}
          </option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nickname}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={tb.period}>
        <Input
          type="month"
          value={draft.period}
          disabled={disabled}
          className={cn(disabled && "opacity-55 cursor-not-allowed")}
          onChange={(e) => set({ period: e.target.value })}
        />
      </Field>
      <Field label={tb.dueDate}>
        <Input
          type="date"
          value={draft.dueDate}
          disabled={disabled}
          className={cn(disabled && "opacity-55 cursor-not-allowed")}
          onChange={(e) => set({ dueDate: e.target.value })}
        />
      </Field>
      <Field label={tb.amountArs}>
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
  const { t } = useI18n();
  const entries = Object.entries(fields);
  if (entries.length === 0) return null;
  return (
    <div className="px-6 pb-1">
      <p className={cn(microLabel, "mb-1.5")}>{t.billDrawer.extractedFields}</p>
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

/** Editable parser custom fields, for hand-filling a needs_review bill the
 * parser couldn't complete. The field list comes from the bill's parser; values
 * are typed back into the engine's stored shapes on save (see
 * `buildCustomPayload`). */
export function EditableCustomFields({
  defs,
  values,
  onChange,
}: {
  defs: CustomField[];
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const { t } = useI18n();
  if (defs.length === 0) return null;
  return (
    <div className="py-1 px-6">
      <p className={cn(microLabel, "mb-1.5")}>{t.billDrawer.extractedFields}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[14px]">
        {defs.map((def) => (
          <Field
            key={def.name}
            label={def.unit ? `${def.name} (${def.unit})` : def.name}
          >
            <Input
              type={
                def.type === "date"
                  ? "date"
                  : def.type === "string"
                    ? "text"
                    : "number"
              }
              value={values[def.name] ?? ""}
              onChange={(e) =>
                onChange({ ...values, [def.name]: e.target.value })
              }
            />
          </Field>
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
  const { t } = useI18n();
  const tb = t.billDrawer;
  return (
    <>
      <LabeledRow label={tb.originalFile}>
        <span className="font-mono text-xs flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
          {fileName ?? tb.pastedText}
          <span className="text-muted"> · PDF</span>
        </span>
        {downloadUrl ? (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-micro uppercase tracking-[0.1em] text-accent underline decoration-dotted underline-offset-[3px] whitespace-nowrap transition-colors hover:text-ink"
          >
            {tb.viewPdf}
          </a>
        ) : (
          <span className="font-mono text-micro text-muted">
            {tb.notStored}
          </span>
        )}
      </LabeledRow>
      <p className="font-mono text-[10.5px] text-muted mt-2 px-6">
        {tb.storedSecurely}
      </p>
    </>
  );
}

export function ExtractedText({ text }: { text: string }) {
  const { t } = useI18n();
  return (
    <div className="pt-4 px-6 pb-1">
      <p className={cn(microLabel, "mb-1.5")}>{t.billDrawer.extractedText}</p>
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

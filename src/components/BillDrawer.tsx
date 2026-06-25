"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Delta } from "@/components/charts/primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  Badge,
  Button,
  Field,
  FinePrint,
  Input,
  microLabel,
  Select,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatMonth, formatMonthShort } from "@/lib/format";
import { trpc } from "@/lib/trpc";

type Draft = {
  vendorId: string;
  propertyId: string;
  period: string;
  totalAmount: string;
  dueDate: string;
};

/** Render an engine custom field (string | number | {value,unit}). */
function formatCustom(v: unknown): string {
  if (v && typeof v === "object" && "value" in v) {
    const q = v as { value: number; unit?: string };
    return `${q.value}${q.unit ? ` ${q.unit}` : ""}`;
  }
  return String(v);
}

export function BillDrawer({
  billId,
  onClose,
  onToast,
}: {
  billId: string | null;
  onClose: () => void;
  onToast: (text: string) => void;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const billQuery = trpc.bills.get.useQuery(
    { id: billId! },
    { enabled: Boolean(billId) },
  );
  const [closing, setClosing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [syncedId, setSyncedId] = useState<string | null>(null);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Vendors belong to an property, so scope the picker to the bill's chosen
  // property (all accessible vendors until one is chosen).
  const vendors = trpc.vendors.list.useQuery(
    draft?.propertyId ? { propertyId: draft.propertyId } : undefined,
  );
  const properties = trpc.properties.list.useQuery();
  const parsers = trpc.parsers.list.useQuery();

  const updateBill = trpc.bills.update.useMutation();
  const deleteBill = trpc.bills.delete.useMutation();
  const reparseText = trpc.bills.reparseText.useMutation();
  const reparseFile = trpc.bills.reparseFile.useMutation();

  const bill = billQuery.data;

  // Reset the close-animation flag whenever the drawer is (re)opened. Keyed off
  // billId (the open signal from the parent) rather than the loaded bill — the
  // bill query is cached, so reopening the *same* bill yields unchanged data and
  // would otherwise leave `closing` stuck true, rendering the drawer off-screen.
  if (billId && billId !== openedId) {
    setOpenedId(billId);
    setClosing(false);
    setConfirmingDelete(false);
  } else if (!billId && openedId) {
    setOpenedId(null);
  }

  // Seed the editable draft from the loaded bill (render-time sync, keyed by
  // bill id — the React-recommended alternative to a state-setting effect).
  if (bill && bill.id !== syncedId) {
    setSyncedId(bill.id);
    setDraft({
      vendorId: bill.vendorId ?? "",
      propertyId: bill.propertyId ?? "",
      period: bill.period ? bill.period.slice(0, 7) : "",
      totalAmount: bill.totalAmount ?? "",
      dueDate: bill.dueDate ?? "",
    });
  }

  if (!billId) return null;

  const close = () => {
    setClosing(true);
    setTimeout(onClose, 240);
  };

  const vendor = vendors.data?.find((v) => v.id === bill?.vendorId);
  const review = bill?.status === "needs_review";
  const extra = (bill?.extra ?? {}) as Record<string, unknown>;
  // Unfiled bills have no vendor row yet — the parser stashed the name on extra.
  const vendorLabel =
    vendor?.displayName ??
    (extra.vendorName as string | undefined) ??
    "Unrecognized";
  const parseError = extra.parseError as string | undefined;
  const customFields = (extra.fields ?? {}) as Record<string, unknown>;

  // The three flavors of needs_review, each with a different primary action.
  const reviewKind: "unrecognized" | "parse_failed" | "needs_home" | null =
    !review
      ? null
      : !bill?.parserKey
        ? "unrecognized"
        : parseError
          ? "parse_failed"
          : "needs_home";

  const parser = parsers.data?.find((p) => p.slug === bill?.parserKey);
  const reviewLabel =
    reviewKind === "unrecognized"
      ? "Needs review · no parser recognized this bill"
      : reviewKind === "parse_failed"
        ? `Needs review · ${parseError ?? "parser failed"}`
        : reviewKind === "needs_home"
          ? "Needs review · pick a property"
          : "Edit bill";

  const openBuilder = () => {
    if (!bill) return;
    const params = new URLSearchParams({ bill: bill.id });
    if (bill.parserKey) params.set("parser", bill.parserKey);
    // Close the drawer explicitly before navigating instead of leaving it open
    // over the builder page.
    close();
    router.push(`/app/builder?${params.toString()}`);
  };

  const save = async () => {
    if (!bill || !draft) return;
    await updateBill.mutateAsync({
      id: bill.id,
      vendorId: draft.vendorId || undefined,
      propertyId: draft.propertyId || undefined,
      period: draft.period ? `${draft.period}-01` : undefined,
      totalAmount: draft.totalAmount ? Number(draft.totalAmount) : undefined,
      dueDate: draft.dueDate || undefined,
    });
    onToast("Bill updated · ledger recalculated");
    utils.invalidate();
    close();
  };

  const remove = async () => {
    if (!bill) return;
    try {
      await deleteBill.mutateAsync({ id: bill.id });
    } catch {
      // Storage cleanup failed before the row was removed — the bill is still
      // intact, so keep the drawer open and let the user retry.
      setConfirmingDelete(false);
      onToast("Couldn't delete the bill — please try again");
      return;
    }
    onToast("Bill deleted");
    utils.invalidate();
    close();
  };

  const onReparseText = async () => {
    if (!bill) return;
    await reparseText.mutateAsync({ id: bill.id });
    onToast("Reparsed from stored text · ledger recalculated");
    utils.invalidate();
  };

  const onReparseFile = async () => {
    if (!bill?.downloadUrl) {
      onToast("No stored PDF for this bill");
      return;
    }
    try {
      const blob = await fetch(bill.downloadUrl).then((r) => r.blob());
      const { default: pdfToText } = await import("react-pdftotext");
      const rawText = await pdfToText(
        new File([blob], bill.fileName ?? "bill.pdf", {
          type: "application/pdf",
        }),
      );
      await reparseFile.mutateAsync({ id: bill.id, rawText });
      onToast("Reparsed from the stored PDF · ledger recalculated");
      utils.invalidate();
    } catch {
      onToast("Could not re-read the stored PDF");
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div
        onClick={close}
        className={cn(
          "absolute inset-0 bg-[color-mix(in_srgb,var(--ink)_28%,transparent)] transition-opacity duration-[240ms]",
          closing ? "opacity-0" : "opacity-100",
        )}
      />
      <div
        className={cn(
          "relative w-[min(460px,92vw)] h-full bg-card border-l border-line shadow-pop overflow-y-auto transition-transform duration-[240ms] ease-[cubic-bezier(0.2,0,0.2,1)]",
          closing ? "translate-x-full" : "translate-x-0",
        )}
      >
        {!bill || !draft ? (
          <FinePrint className="p-6" />
        ) : (
          <>
            {/* header */}
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
                  {vendorLabel}
                  {bill.period ? " · " + formatMonth(bill.period) : ""}
                </h2>
                <p className="font-mono text-micro text-muted mt-1">
                  {bill.fileName}
                </p>
              </div>
              <button
                onClick={close}
                aria-label="Close"
                className="bg-transparent border-none cursor-pointer text-muted text-base leading-none transition-colors hover:text-accent"
              >
                ✕
              </button>
            </div>

            {/* yoy context */}
            {bill.yoy && (
              <div className="mt-4 mx-6 py-2.5 px-[14px] border border-line flex items-center gap-2.5 flex-wrap">
                <span className="font-mono text-micro text-muted">
                  vs {formatMonthShort(bill.yoy.prevPeriod)}{" "}
                  {bill.yoy.prevPeriod.slice(0, 4)}:
                </span>
                <span className="font-mono text-xs">
                  <Delta pct={bill.yoy.arsPct} /> in ARS
                </span>
                {bill.yoy.usdPct != null && (
                  <span className="font-mono text-xs text-muted">
                    · {bill.yoy.usdPct > 0 ? "+" : ""}
                    {bill.yoy.usdPct.toFixed(0)}% in USD
                  </span>
                )}
              </div>
            )}

            {/* editable fields */}
            <div className="py-5 px-6 grid grid-cols-1 md:grid-cols-2 gap-[14px]">
              <Field label="Vendor">
                <Select
                  value={draft.vendorId}
                  onChange={(e) =>
                    setDraft({ ...draft, vendorId: e.target.value })
                  }
                >
                  <option value="" disabled>
                    Vendor
                  </option>
                  {(vendors.data ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.displayName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Property">
                <Select
                  value={draft.propertyId}
                  onChange={(e) =>
                    setDraft({ ...draft, propertyId: e.target.value })
                  }
                >
                  <option value="" disabled>
                    Property
                  </option>
                  {(properties.data ?? []).map((p) => (
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
                  onChange={(e) =>
                    setDraft({ ...draft, period: e.target.value })
                  }
                />
              </Field>
              <Field label="Due date">
                <Input
                  type="date"
                  value={draft.dueDate}
                  onChange={(e) =>
                    setDraft({ ...draft, dueDate: e.target.value })
                  }
                />
              </Field>
              <Field label="Amount (ARS)">
                <Input
                  type="number"
                  value={draft.totalAmount}
                  onChange={(e) =>
                    setDraft({ ...draft, totalAmount: e.target.value })
                  }
                />
              </Field>
            </div>

            {/* parser-extracted custom fields (read-only) */}
            {Object.keys(customFields).length > 0 && (
              <div className="px-6 pb-1">
                <p className={cn(microLabel, "mb-1.5")}>Extracted fields</p>
                <div className="border border-line bg-paper">
                  {Object.entries(customFields).map(([k, v], i) => (
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
            )}

            {/* parser used + builder entry */}
            <div className="pt-4 px-6 pb-1">
              <p className={cn(microLabel, "mb-1.5")}>Parser</p>
              <div className="flex items-center gap-2.5 border border-line py-2.5 px-3 bg-paper">
                <span className="font-mono text-xs flex-1">
                  {bill.parserKey ? (
                    <>
                      {parser?.displayName ?? bill.parserKey}
                      {parser ? (
                        bill.parserVersion && (
                          <span className="text-muted">
                            {" "}
                            · v{bill.parserVersion}
                          </span>
                        )
                      ) : (
                        <span className="text-muted">
                          {" "}
                          · not a saved parser
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted">
                      No parser recognized this bill
                    </span>
                  )}
                </span>
                {reviewKind === "needs_home" ? (
                  <Badge tone="neutral">parsed OK</Badge>
                ) : (
                  <Button size="sm" onClick={openBuilder}>
                    {parser
                      ? reviewKind === "parse_failed"
                        ? "Fix parser"
                        : "Edit parser"
                      : "Set up a parser"}
                  </Button>
                )}
              </div>
              {reviewKind === "needs_home" && (
                <p className="font-mono text-[10.5px] text-muted mt-2">
                  Parsed cleanly — just choose a property above and save.
                </p>
              )}
            </div>

            {/* original file */}
            <div className="px-6 pb-1">
              <p className={cn(microLabel, "mb-1.5")}>Original file</p>
              <div className="flex items-center gap-2.5 border border-line py-2.5 px-3 bg-paper">
                <span className="font-mono text-xs flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                  {bill.fileName ?? "(pasted text)"}
                  <span className="text-muted"> · PDF</span>
                </span>
                {bill.downloadUrl ? (
                  <a
                    href={bill.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-micro uppercase tracking-[0.1em] text-accent underline decoration-dotted underline-offset-[3px] whitespace-nowrap transition-colors hover:text-ink"
                  >
                    View PDF ›
                  </a>
                ) : (
                  <span className="font-mono text-micro text-muted">
                    not stored
                  </span>
                )}
              </div>
              <p className="font-mono text-[10.5px] text-muted mt-2">
                Stored securely (S3) alongside the extracted text below.
              </p>
            </div>

            {/* raw text */}
            <div className="pt-4 px-6 pb-1">
              <p className={cn(microLabel, "mb-1.5")}>Extracted text</p>
              <pre className="ruled font-mono text-[12.5px] whitespace-pre-wrap text-ink bg-paper border border-line pt-1 px-3 pb-2.5 max-h-[240px] overflow-y-auto">
                {bill.rawText}
              </pre>
            </div>

            {/* reparse — two paths */}
            <div className="pt-3 px-6 pb-5">
              <p className={cn(microLabel, "mb-2")}>Reparse</p>
              <div className="flex gap-2">
                <ReparseOption
                  title="From the file"
                  caption="Re-reads the stored PDF — use when the text extractor improves"
                  disabled={!bill.downloadUrl || reparseFile.isPending}
                  onClick={onReparseFile}
                />
                <ReparseOption
                  title="From the text"
                  caption="Re-runs the vendor parser on the stored text — faster"
                  disabled={reparseText.isPending}
                  onClick={onReparseText}
                />
              </div>
            </div>

            {/* footer */}
            <div className="sticky bottom-0 flex gap-2 py-3.5 px-6 border-t border-line bg-card">
              <Button
                variant="solid"
                onClick={save}
                disabled={updateBill.isPending}
              >
                Save changes
              </Button>
              <Button
                variant="ghost"
                className="ml-auto"
                onClick={() => setConfirmingDelete(true)}
                disabled={deleteBill.isPending}
              >
                Delete
              </Button>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmingDelete && !!bill}
        eyebrow="Delete bill"
        title="This can't be undone"
        description="The bill and its stored PDF will be permanently removed."
        confirmLabel="Delete bill"
        busyLabel="Deleting…"
        busy={deleteBill.isPending}
        onConfirm={remove}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}

function ReparseOption({
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

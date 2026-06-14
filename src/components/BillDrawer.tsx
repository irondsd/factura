"use client";

import { type CSSProperties, useState } from "react";
import { Delta } from "@/components/charts/primitives";
import { Button, Input, Select } from "@/components/ui";
import { formatMonth, formatMonthShort } from "@/lib/format";
import { trpc } from "@/lib/trpc";

type Draft = {
  vendorId: string;
  propertyId: string;
  period: string;
  totalAmount: string;
  dueDate: string;
  consumptionValue: string;
  extraordinaryAmount: string;
};

const flabel: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  color: "var(--muted)",
};
const field: CSSProperties = { display: "flex", flexDirection: "column", gap: 5 };

export function BillDrawer({
  billId,
  onClose,
  onToast,
}: {
  billId: string | null;
  onClose: () => void;
  onToast: (text: string) => void;
}) {
  const utils = trpc.useUtils();
  const billQuery = trpc.bills.get.useQuery(
    { id: billId! },
    { enabled: Boolean(billId) },
  );
  const vendors = trpc.vendors.list.useQuery();
  const properties = trpc.properties.list.useQuery();

  const updateBill = trpc.bills.update.useMutation();
  const deleteBill = trpc.bills.delete.useMutation();
  const reparseText = trpc.bills.reparseText.useMutation();
  const reparseFile = trpc.bills.reparseFile.useMutation();

  const [closing, setClosing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [syncedId, setSyncedId] = useState<string | null>(null);

  const bill = billQuery.data;

  // Seed the editable draft from the loaded bill (render-time sync, keyed by
  // bill id — the React-recommended alternative to a state-setting effect).
  if (bill && bill.id !== syncedId) {
    setSyncedId(bill.id);
    setClosing(false);
    setDraft({
      vendorId: bill.vendorId ?? "",
      propertyId: bill.propertyId ?? "",
      period: bill.period ? bill.period.slice(0, 7) : "",
      totalAmount: bill.totalAmount ?? "",
      dueDate: bill.dueDate ?? "",
      consumptionValue: bill.consumptionValue ?? "",
      extraordinaryAmount: bill.extraordinaryAmount ?? "",
    });
  }

  if (!billId) return null;

  const close = () => {
    setClosing(true);
    setTimeout(onClose, 240);
  };

  const vendor = vendors.data?.find((v) => v.id === bill?.vendorId);
  const draftVendor = vendors.data?.find((v) => v.id === draft?.vendorId) ?? vendor;
  const review = bill?.status === "needs_review";
  const extra = (bill?.extra ?? {}) as Record<string, unknown>;
  const parseError = extra.parseError as string | undefined;
  const hasUnit =
    draftVendor?.category === "electricity" ||
    draftVendor?.category === "gas" ||
    draftVendor?.category === "water";
  const consumptionUnit =
    draftVendor?.category === "electricity" ? ("kWh" as const) : ("m3" as const);
  const isExpensas = draftVendor?.category === "expensas";

  const save = async () => {
    if (!bill || !draft) return;
    await updateBill.mutateAsync({
      id: bill.id,
      vendorId: draft.vendorId || undefined,
      propertyId: draft.propertyId || undefined,
      period: draft.period ? `${draft.period}-01` : undefined,
      totalAmount: draft.totalAmount ? Number(draft.totalAmount) : undefined,
      dueDate: draft.dueDate || undefined,
      ...(hasUnit && draft.consumptionValue
        ? {
            consumptionValue: Number(draft.consumptionValue),
            consumptionUnit,
          }
        : {}),
      ...(isExpensas && draft.extraordinaryAmount
        ? { extraordinaryAmount: Number(draft.extraordinaryAmount) }
        : {}),
    });
    onToast("Bill updated · ledger recalculated");
    utils.invalidate();
    close();
  };

  const remove = async () => {
    if (!bill) return;
    await deleteBill.mutateAsync({ id: bill.id });
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
        new File([blob], bill.fileName ?? "bill.pdf", { type: "application/pdf" }),
      );
      await reparseFile.mutateAsync({ id: bill.id, rawText });
      onToast("Reparsed from the stored PDF · ledger recalculated");
      utils.invalidate();
    } catch {
      onToast("Could not re-read the stored PDF");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={close}
        style={{
          position: "absolute",
          inset: 0,
          background: "color-mix(in srgb, var(--ink) 28%, transparent)",
          opacity: closing ? 0 : 1,
          transition: "opacity 240ms",
        }}
      />
      <div
        style={{
          position: "relative",
          width: "min(460px, 92vw)",
          height: "100%",
          background: "var(--card)",
          borderLeft: "1px solid var(--line)",
          boxShadow: "var(--shadow-pop)",
          overflowY: "auto",
          transform: closing ? "translateX(100%)" : "translateX(0)",
          transition: "transform 240ms cubic-bezier(0.2,0,0.2,1)",
        }}
      >
        {!bill || !draft ? (
          <div style={{ padding: 24, fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--muted)" }}>
            Reading the fine print…
          </div>
        ) : (
          <>
            {/* header */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
                padding: "22px 24px 16px",
                borderBottom: "1px dashed var(--line)",
              }}
            >
              <div>
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.22em",
                    color: review ? "var(--accent)" : "var(--muted)",
                    margin: 0,
                  }}
                >
                  {review ? "Needs review · " + (parseError ?? "") : "Edit bill"}
                </p>
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 600,
                    fontSize: 22,
                    margin: "8px 0 0",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {vendor ? vendor.displayName : "Unrecognized"}
                  {bill.period ? " · " + formatMonth(bill.period) : ""}
                </h2>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", margin: "4px 0 0" }}>
                  {bill.fileName}
                </p>
              </div>
              <button
                onClick={close}
                aria-label="Close"
                className="fx-x"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 16, lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {/* yoy context */}
            {bill.yoy && (
              <div
                style={{
                  margin: "16px 24px 0",
                  padding: "10px 14px",
                  border: "1px solid var(--line)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
                  vs {formatMonthShort(bill.yoy.prevPeriod)} {bill.yoy.prevPeriod.slice(0, 4)}:
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  <Delta pct={bill.yoy.arsPct} /> in ARS
                </span>
                {bill.yoy.usdPct != null && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>
                    · {bill.yoy.usdPct > 0 ? "+" : ""}
                    {bill.yoy.usdPct.toFixed(0)}% in USD
                  </span>
                )}
              </div>
            )}

            {/* editable fields */}
            <div style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label style={field}>
                <span style={flabel}>Vendor</span>
                <Select value={draft.vendorId} onChange={(e) => setDraft({ ...draft, vendorId: e.target.value })}>
                  <option value="" disabled>
                    Vendor
                  </option>
                  {(vendors.data ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.displayName}
                    </option>
                  ))}
                </Select>
              </label>
              <label style={field}>
                <span style={flabel}>Property</span>
                <Select value={draft.propertyId} onChange={(e) => setDraft({ ...draft, propertyId: e.target.value })}>
                  <option value="" disabled>
                    Property
                  </option>
                  {(properties.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nickname}
                    </option>
                  ))}
                </Select>
              </label>
              <label style={field}>
                <span style={flabel}>Period</span>
                <Input type="month" value={draft.period} onChange={(e) => setDraft({ ...draft, period: e.target.value })} />
              </label>
              <label style={field}>
                <span style={flabel}>Due date</span>
                <Input type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
              </label>
              <label style={field}>
                <span style={flabel}>Amount (ARS)</span>
                <Input type="number" value={draft.totalAmount} onChange={(e) => setDraft({ ...draft, totalAmount: e.target.value })} />
              </label>
              {hasUnit && (
                <label style={field}>
                  <span style={flabel}>Consumption ({consumptionUnit})</span>
                  <Input
                    type="number"
                    value={draft.consumptionValue}
                    onChange={(e) => setDraft({ ...draft, consumptionValue: e.target.value })}
                  />
                </label>
              )}
              {isExpensas && (
                <label style={field}>
                  <span style={flabel}>Extraordinarias</span>
                  <Input
                    type="number"
                    value={draft.extraordinaryAmount}
                    onChange={(e) => setDraft({ ...draft, extraordinaryAmount: e.target.value })}
                  />
                </label>
              )}
            </div>

            {/* original file */}
            <div style={{ padding: "0 24px 4px" }}>
              <p style={{ ...flabel, marginBottom: 6 }}>Original file</p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  border: "1px solid var(--line)",
                  padding: "10px 12px",
                  background: "var(--paper)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {bill.fileName ?? "(pasted text)"}
                  <span style={{ color: "var(--muted)" }}> · PDF</span>
                </span>
                {bill.downloadUrl ? (
                  <a
                    href={bill.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="fx-pdf-link"
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "var(--accent)",
                      textDecorationLine: "underline",
                      textDecorationStyle: "dotted",
                      textUnderlineOffset: 3,
                      whiteSpace: "nowrap",
                    }}
                  >
                    View PDF ›
                  </a>
                ) : (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
                    not stored
                  </span>
                )}
              </div>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--muted)", margin: "8px 0 0" }}>
                Stored securely (S3) alongside the extracted text below.
              </p>
            </div>

            {/* raw text */}
            <div style={{ padding: "16px 24px 4px" }}>
              <p style={{ ...flabel, marginBottom: 6 }}>Extracted text</p>
              <pre
                className="ruled"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12.5,
                  whiteSpace: "pre-wrap",
                  color: "var(--ink)",
                  margin: 0,
                  background: "var(--paper)",
                  border: "1px solid var(--line)",
                  padding: "4px 12px 10px",
                  maxHeight: 240,
                  overflowY: "auto",
                }}
              >
                {bill.rawText}
              </pre>
            </div>

            {/* reparse — two paths */}
            <div style={{ padding: "12px 24px 20px" }}>
              <p style={{ ...flabel, marginBottom: 8 }}>Reparse</p>
              <div style={{ display: "flex", gap: 8 }}>
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
            <div
              style={{
                position: "sticky",
                bottom: 0,
                display: "flex",
                gap: 8,
                padding: "14px 24px",
                borderTop: "1px solid var(--line)",
                background: "var(--card)",
              }}
            >
              <Button variant="solid" onClick={save} disabled={updateBill.isPending}>
                Save changes
              </Button>
              <Button variant="ghost" style={{ marginLeft: "auto" }} onClick={remove} disabled={deleteBill.isPending}>
                Delete
              </Button>
            </div>
          </>
        )}
      </div>
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
      className="fx-reparse"
      style={{
        flex: 1,
        textAlign: "left",
        cursor: disabled ? "not-allowed" : "pointer",
        background: "transparent",
        border: "1px solid var(--line)",
        padding: "10px 12px",
        transition: "var(--transition-colors)",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, color: "var(--ink)" }}>
        {title}
      </span>
      <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>
        {caption}
      </span>
    </button>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app/context";
import { Display, Eyebrow } from "@/components/charts/primitives";
import { Badge } from "@/components/ui";
import { formatARS, formatMonthShort, formatUSD } from "@/lib/format";
import { vendorColor } from "@/lib/vendorColors";
import { trpc } from "@/lib/trpc";

export default function BillsPage() {
  const { propertyId, openBill } = useApp();
  const [vendorId, setVendorId] = useState<string>("all");
  const [page, setPage] = useState(0);

  // Reset to the first page whenever the filters change (render-time sync —
  // avoids a state-setting effect).
  const filterKey = `${propertyId ?? "all"}|${vendorId}`;
  const [prevFilter, setPrevFilter] = useState(filterKey);
  if (filterKey !== prevFilter) {
    setPrevFilter(filterKey);
    setPage(0);
  }

  const vendors = trpc.vendors.list.useQuery();
  const properties = trpc.properties.list.useQuery();
  const vendorsPresent = trpc.bills.vendorsPresent.useQuery({ propertyId });
  const paged = trpc.bills.listPaged.useQuery({
    propertyId,
    vendorId: vendorId === "all" ? undefined : vendorId,
    page,
  });

  // Tabs reflect vendors that actually have bills (for the current property),
  // so a vendor shows up as soon as a bill is filed under it.
  const vendorsHere = useMemo(() => {
    const ids = new Set(vendorsPresent.data ?? []);
    return (vendors.data ?? []).filter((v) => ids.has(v.id));
  }, [vendors.data, vendorsPresent.data]);

  const vendorById = useMemo(
    () => new Map((vendors.data ?? []).map((v) => [v.id, v])),
    [vendors.data],
  );
  const vendorName = (id: string | null) =>
    id ? vendorById.get(id)?.displayName ?? "—" : "unrecognized";
  const propName = (id: string | null) =>
    properties.data?.find((p) => p.id === id)?.nickname ?? "—";

  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "0 0 10px",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--muted)",
  };
  const td: React.CSSProperties = {
    padding: "12px 0",
    fontSize: 13,
    fontFamily: "var(--font-mono)",
    borderTop: "1px solid color-mix(in srgb, var(--line) 60%, transparent)",
  };

  const d = paged.data;
  const rows = d?.rows ?? [];
  const pageCount = d?.pageCount ?? 1;
  const safePage = d?.page ?? 0;

  return (
    <div style={{ maxWidth: "64rem", margin: "0 auto", padding: "32px 20px 80px" }}>
      <Eyebrow>Bills · {propertyId ? propName(propertyId) : "All properties"}</Eyebrow>
      <Display size={34} style={{ display: "block", marginTop: 6 }}>
        The ledger
      </Display>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginTop: 18,
          borderBottom: "1px solid var(--line)",
          paddingBottom: 12,
        }}
      >
        <FilterTab label="All vendors" active={vendorId === "all"} onClick={() => setVendorId("all")} />
        {vendorsHere.map((v) => (
          <FilterTab
            key={v.id}
            label={v.displayName}
            color={vendorColor(v)}
            active={vendorId === v.id}
            onClick={() => setVendorId(v.id)}
          />
        ))}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
        <thead>
          <tr>
            <th style={th}>Period</th>
            <th style={th}>Vendor</th>
            {!propertyId && <th style={th}>Property</th>}
            <th style={{ ...th, textAlign: "right" }}>Amount</th>
            <th style={{ ...th, textAlign: "right" }}>USD</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => {
            const review = b.status === "needs_review";
            return (
              <tr key={b.id} className="fx-row" onClick={() => openBill(b.id)} style={{ cursor: "pointer" }}>
                <td style={{ ...td, color: review ? "var(--accent)" : "var(--ink)" }}>
                  {b.period
                    ? `${formatMonthShort(b.period)} ${b.period.slice(0, 4)}`
                    : b.fileName ?? "—"}
                </td>
                <td style={td}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    {b.vendorId && vendorById.get(b.vendorId) && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          background: vendorColor(vendorById.get(b.vendorId)!),
                          display: "inline-block",
                        }}
                      />
                    )}
                    {vendorName(b.vendorId)}
                  </span>
                </td>
                {!propertyId && <td style={{ ...td, color: "var(--muted)" }}>{propName(b.propertyId)}</td>}
                <td style={{ ...td, textAlign: "right", fontWeight: 500 }}>
                  {review ? <Badge>needs review</Badge> : formatARS(b.totalAmount)}
                </td>
                <td style={{ ...td, textAlign: "right", color: "var(--muted)" }}>
                  {review ? "—" : formatUSD(b.usdAmount)}
                </td>
                <td style={{ ...td, textAlign: "right", color: "var(--muted)" }}>›</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} style={{ ...td, textAlign: "center", color: "var(--muted)", padding: "28px 0" }}>
                No bills yet — drop a PDF anywhere.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* pagination */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)" }}>
          {d?.total ?? 0} bills · page {safePage + 1} of {pageCount}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <PageBtn disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            ‹ Prev
          </PageBtn>
          {Array.from({ length: pageCount }, (_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                width: 28,
                height: 28,
                cursor: "pointer",
                border: "1px solid " + (i === safePage ? "var(--ink)" : "var(--line)"),
                background: i === safePage ? "var(--ink)" : "transparent",
                color: i === safePage ? "var(--paper)" : "var(--muted)",
                transition: "var(--transition-colors)",
              }}
            >
              {i + 1}
            </button>
          ))}
          <PageBtn disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
            Next ›
          </PageBtn>
        </div>
      </div>
    </div>
  );
}

function FilterTab({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        padding: "5px 11px",
        cursor: "pointer",
        border: "1px solid " + (active ? "var(--ink)" : "transparent"),
        background: active ? "var(--ink)" : "transparent",
        color: active ? "var(--paper)" : "var(--muted)",
        transition: "var(--transition-colors)",
      }}
    >
      {color && <span style={{ width: 8, height: 8, background: color, display: "inline-block" }} />}
      {label}
    </button>
  );
}

function PageBtn({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        padding: "0 10px",
        height: 28,
        cursor: disabled ? "not-allowed" : "pointer",
        border: "1px solid var(--line)",
        background: "transparent",
        color: disabled ? "color-mix(in srgb, var(--muted) 45%, transparent)" : "var(--ink)",
        transition: "var(--transition-colors)",
      }}
    >
      {children}
    </button>
  );
}

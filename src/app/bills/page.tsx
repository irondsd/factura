"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app/context";
import { Display, Eyebrow } from "@/components/charts/primitives";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatARS, formatMonthShort, formatUSD } from "@/lib/format";
import { vendorColorClass } from "@/lib/vendorColors";
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

  const d = paged.data;
  const rows = d?.rows ?? [];
  const pageCount = d?.pageCount ?? 1;
  const safePage = d?.page ?? 0;

  return (
    <div className="mx-auto max-w-[64rem] px-5 pt-8 pb-20">
      <Eyebrow>Bills · {propertyId ? propName(propertyId) : "All properties"}</Eyebrow>
      <Display size={34} className="block mt-1.5">
        The ledger
      </Display>

      <div className="flex flex-wrap gap-1.5 mt-[18px] border-b border-line pb-3">
        <FilterTab label="All vendors" active={vendorId === "all"} onClick={() => setVendorId("all")} />
        {vendorsHere.map((v) => (
          <FilterTab
            key={v.id}
            label={v.displayName}
            colorClass={vendorColorClass(v.color)}
            active={vendorId === v.id}
            onClick={() => setVendorId(v.id)}
          />
        ))}
      </div>

      <div className="overflow-x-auto [-webkit-overflow-scrolling:touch] mt-4">
      <table className="w-full min-w-[440px] border-collapse">
        <thead>
          <tr>
            <th className="fd-th">Period</th>
            <th className="fd-th">Vendor</th>
            {!propertyId && <th className="fd-th">Property</th>}
            <th className="fd-th text-right">Amount</th>
            <th className="fd-th text-right">USD</th>
            <th className="fd-th"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => {
            const review = b.status === "needs_review";
            return (
              <tr
                key={b.id}
                onClick={() => openBill(b.id)}
                className="cursor-pointer [&:hover>td]:bg-[color-mix(in_srgb,var(--accent)_4%,transparent)]"
              >
                <td className={cn("fd-td", review ? "text-accent" : "text-ink")}>
                  {b.period
                    ? `${formatMonthShort(b.period)} ${b.period.slice(0, 4)}`
                    : b.fileName ?? "—"}
                </td>
                <td className="fd-td">
                  <span className="inline-flex items-center gap-[7px]">
                    {b.vendorId && vendorById.get(b.vendorId) && (
                      <span
                        className={cn(
                          "inline-block w-2 h-2",
                          vendorColorClass(vendorById.get(b.vendorId)?.color),
                        )}
                      />
                    )}
                    {vendorName(b.vendorId)}
                  </span>
                </td>
                {!propertyId && <td className="fd-td text-muted">{propName(b.propertyId)}</td>}
                <td className="fd-td text-right font-medium">
                  {review ? <Badge>needs review</Badge> : formatARS(b.totalAmount)}
                </td>
                <td className="fd-td text-right text-muted">
                  {review ? "—" : formatUSD(b.usdAmount)}
                </td>
                <td className="fd-td text-right text-muted">›</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="fd-td text-center text-muted py-7">
                No bills yet — drop a PDF anywhere.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      {/* pagination */}
      <div className="flex items-center justify-between mt-[18px] gap-3 flex-wrap">
        <span className="font-mono text-micro uppercase tracking-[0.08em] text-muted">
          {d?.total ?? 0} bills · page {safePage + 1} of {pageCount}
        </span>
        {/* Prev/Next + a 5-page window. The labels collapse to bare arrows on mobile. */}
        <div className="flex gap-1 flex-wrap justify-end">
          <PageBtn disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="Previous page">
            ‹<span className="hidden md:inline">Prev</span>
          </PageBtn>
          {pageWindow(safePage, pageCount).map((item, idx) => (
            <PageNum key={typeof item === "number" ? item : `gap-${idx}`} item={item} active={item === safePage} onClick={setPage} />
          ))}
          <PageBtn disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} aria-label="Next page">
            <span className="hidden md:inline">Next</span>›
          </PageBtn>
        </div>
      </div>
    </div>
  );
}

// Condensed page list: always the first and last page, plus the current one
// and its immediate neighbours (5 numbers total), with "…" filling any gaps.
// The item count stays fixed regardless of how many pages exist, so the
// control never overflows — e.g. "1 2 3 4 5 … 17" or "1 … 8 9 10 … 17".
function pageWindow(current: number, count: number): (number | "…")[] {
  const range = (start: number, end: number) =>
    Array.from({ length: end - start + 1 }, (_, i) => start + i);

  if (count <= 7) return range(0, count - 1);

  const last = count - 1;
  if (current <= 3) return [...range(0, 4), "…", last];
  if (current >= last - 3) return [0, "…", ...range(last - 4, last)];
  return [0, "…", current - 1, current, current + 1, "…", last];
}

function FilterTab({
  label,
  colorClass,
  active,
  onClick,
}: {
  label: string;
  colorClass?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-[7px] font-mono text-micro uppercase tracking-[0.12em] py-[5px] px-[11px] cursor-pointer border transition-colors",
        active ? "border-ink bg-ink text-paper" : "border-transparent bg-transparent text-muted",
      )}
    >
      {colorClass && <span className={cn("inline-block w-2 h-2", colorClass)} />}
      {label}
    </button>
  );
}

const PAGENUM_BASE =
  "font-mono text-micro w-7 h-7 inline-flex items-center justify-center";

function PageNum({
  item,
  active,
  onClick,
}: {
  item: number | "…";
  active: boolean;
  onClick: (page: number) => void;
}) {
  if (item === "…") {
    return <span className={cn(PAGENUM_BASE, "text-muted")}>…</span>;
  }
  return (
    <button
      onClick={() => onClick(item)}
      className={cn(
        PAGENUM_BASE,
        "cursor-pointer border transition-colors",
        active ? "border-ink bg-ink text-paper" : "border-line bg-transparent text-muted",
      )}
    >
      {item + 1}
    </button>
  );
}

function PageBtn({
  disabled,
  onClick,
  children,
  ...rest
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      {...rest}
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-micro uppercase tracking-[0.08em] px-2.5 h-7 border border-line bg-transparent transition-colors",
        disabled
          ? "cursor-not-allowed text-[color-mix(in_srgb,var(--muted)_45%,transparent)]"
          : "cursor-pointer text-ink",
      )}
    >
      {children}
    </button>
  );
}

import { describe, expect, it } from "vitest";
import { type StatBill, summarizeLedger } from "./account.stats";

/** A bill with just the columns the summary reads. */
function bill(p: {
  total?: number | null;
  usd?: number | null;
  period?: string | null;
  dueDate?: string | null;
  vendorId?: string | null;
  storageKey?: string | null;
  createdBy?: string;
}): StatBill {
  return {
    createdBy: p.createdBy ?? "me",
    storageKey: p.storageKey ?? null,
    totalAmount:
      p.total === undefined || p.total === null ? null : String(p.total),
    usdAmount: p.usd ?? null,
    period: p.period ?? null,
    dueDate: p.dueDate ?? null,
    vendorId: p.vendorId ?? null,
  };
}

const opts = {
  userId: "me",
  now: "2026-08",
  vendorName: (id: string | null) => (id ? `Vendor ${id}` : null),
};

describe("summarizeLedger", () => {
  it("counts bills, stored files and the caller's own uploads", () => {
    const s = summarizeLedger(
      [
        bill({ storageKey: "a.pdf" }),
        bill({ storageKey: "b.pdf", createdBy: "them" }),
        bill({ createdBy: "them" }),
      ],
      opts,
    );
    expect(s.bills).toEqual({ total: 3, files: 2, mine: 1 });
  });

  it("sums pesos over every priced bill and dollars over the converted ones", () => {
    const s = summarizeLedger(
      [
        bill({ total: 1000, usd: 1, period: "2026-01-01" }),
        bill({ total: 2000, usd: null, period: "2026-02-01" }),
        bill({ total: null, period: "2026-03-01" }), // still in review
      ],
      opts,
    );
    expect(s.money).toEqual({ ars: 3000, usd: 1, counted: 2 });
  });

  it("ranks the biggest bill by USD, not by its peso face value", () => {
    // The older bill is worth more pesos and less money.
    const s = summarizeLedger(
      [
        bill({ total: 9000, usd: 9, period: "2023-05-01", vendorId: "v1" }),
        bill({ total: 5000, usd: 25, period: "2026-05-01", vendorId: "v2" }),
      ],
      opts,
    );
    expect(s.biggest).toEqual({
      ars: 5000,
      usd: 25,
      month: "2026-05",
      vendor: "Vendor v2",
    });
  });

  it("falls back to peso ranking when no bill has a rate at all", () => {
    const s = summarizeLedger(
      [
        bill({ total: 9000, period: "2023-05-01", vendorId: "v1" }),
        bill({ total: 5000, period: "2026-05-01", vendorId: "v2" }),
      ],
      opts,
    );
    expect(s.biggest?.ars).toBe(9000);
    expect(s.biggest?.usd).toBeNull();
  });

  it("picks the priciest month by USD and totals every bill in it", () => {
    const s = summarizeLedger(
      [
        bill({ total: 8000, usd: 8, period: "2026-01-01" }),
        bill({ total: 1000, usd: 10, period: "2026-02-01" }),
        bill({ total: 1000, usd: 11, period: "2026-02-01" }),
      ],
      opts,
    );
    expect(s.topMonth).toEqual({
      month: "2026-02",
      ars: 2000,
      usd: 21,
      bills: 2,
    });
  });

  it("dates history by period, falling back to the due date", () => {
    const s = summarizeLedger(
      [
        bill({ total: 100, usd: 1, dueDate: "2026-06-10" }),
        bill({ total: 100, usd: 1, period: "2026-02-01" }),
        bill({ total: 100, usd: 1, period: "2026-02-01" }),
      ],
      opts,
    );
    // Feb and Jun hold bills; Feb → Aug is a seven-month window.
    expect(s.history).toEqual({
      firstMonth: "2026-02",
      monthsCovered: 2,
      monthsSpan: 7,
    });
  });

  it("returns an empty summary for an empty ledger", () => {
    const s = summarizeLedger([], opts);
    expect(s.bills.total).toBe(0);
    expect(s.money).toEqual({ ars: 0, usd: 0, counted: 0 });
    expect(s.history.firstMonth).toBeNull();
    expect(s.biggest).toBeNull();
    expect(s.topMonth).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  type EnrichedBill,
  type VendorHere,
  amountIn,
  completeFlagsFor,
  currencyViews,
  monthList,
  monthlySeries,
  perVendorTrend,
  readCustom,
  rebase,
  shareList,
} from "./insights.aggregate";

/** Build a parsed bill with just the fields the aggregators read. */
function bill(p: {
  vendorId: string | null;
  period: string | null;
  total: number | null;
  usd?: number | null;
  extra?: unknown;
}): EnrichedBill {
  return {
    vendorId: p.vendorId,
    period: p.period,
    totalAmount: p.total === null ? null : String(p.total),
    usdAmount: p.usd ?? null,
    extra: p.extra ?? null,
  } as unknown as EnrichedBill;
}

const vendor = (id: string): VendorHere => ({
  id,
  displayName: id,
  color: `var(--vendor-${id})`,
});

describe("monthList", () => {
  it("returns n months ending at `end`, oldest → newest", () => {
    expect(monthList("2026-03", 3)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("spans year boundaries", () => {
    expect(monthList("2026-01", 3)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });

  it("returns a single month for n=1", () => {
    expect(monthList("2026-06", 1)).toEqual(["2026-06"]);
  });
});

describe("amountIn", () => {
  it("returns the peso total for ARS", () => {
    expect(
      amountIn(bill({ vendorId: "a", period: null, total: 1500 }), "ARS"),
    ).toBe(1500);
  });

  it("returns the USD-enriched value for USD", () => {
    expect(
      amountIn(
        bill({ vendorId: "a", period: null, total: 1500, usd: 1.5 }),
        "USD",
      ),
    ).toBe(1.5);
  });

  it("returns null when the total is missing", () => {
    expect(
      amountIn(bill({ vendorId: "a", period: null, total: null }), "ARS"),
    ).toBe(null);
  });
});

describe("readCustom", () => {
  it("reads a bare numeric field", () => {
    const b = bill({
      vendorId: "a",
      period: null,
      total: 1,
      extra: { fields: { kwh: 320 } },
    });
    expect(readCustom(b, "kwh")).toBe(320);
  });

  it("reads the value out of a quantity object", () => {
    const b = bill({
      vendorId: "a",
      period: null,
      total: 1,
      extra: { fields: { gas: { value: 12.5, unit: "m3" } } },
    });
    expect(readCustom(b, "gas")).toBe(12.5);
  });

  it("returns null for missing fields and string fields", () => {
    const b = bill({
      vendorId: "a",
      period: null,
      total: 1,
      extra: { fields: { note: "hello" } },
    });
    expect(readCustom(b, "note")).toBe(null);
    expect(readCustom(b, "absent")).toBe(null);
    expect(
      readCustom(bill({ vendorId: "a", period: null, total: 1 }), "x"),
    ).toBe(null);
  });
});

describe("monthlySeries", () => {
  const bills = [
    bill({ vendorId: "a", period: "2026-01-01", total: 100 }),
    bill({ vendorId: "b", period: "2026-01-01", total: 50 }),
    bill({ vendorId: "a", period: "2026-02-01", total: 200 }),
  ];

  it("sums per vendor and overall per month", () => {
    const series = monthlySeries(["2026-01", "2026-02"], bills, "ARS");
    expect(series[0]).toEqual({
      month: "2026-01",
      byVendor: { a: 100, b: 50 },
      total: 150,
    });
    expect(series[1]).toEqual({
      month: "2026-02",
      byVendor: { a: 200 },
      total: 200,
    });
  });

  it("skips bills with no vendor or no amount", () => {
    const series = monthlySeries(
      ["2026-01"],
      [
        bill({ vendorId: null, period: "2026-01-01", total: 999 }),
        bill({ vendorId: "a", period: "2026-01-01", total: null }),
        bill({ vendorId: "a", period: "2026-01-01", total: 10 }),
      ],
      "ARS",
    );
    expect(series[0]).toEqual({
      month: "2026-01",
      byVendor: { a: 10 },
      total: 10,
    });
  });

  it("emits zeroed months with no matching bills", () => {
    const series = monthlySeries(["2026-03"], bills, "ARS");
    expect(series[0]).toEqual({ month: "2026-03", byVendor: {}, total: 0 });
  });
});

describe("completeFlagsFor", () => {
  it("marks a month complete only when every started vendor billed it", () => {
    const bills = [
      bill({ vendorId: "a", period: "2026-01-01", total: 1 }),
      bill({ vendorId: "a", period: "2026-02-01", total: 1 }),
      bill({ vendorId: "b", period: "2026-02-01", total: 1 }),
    ];
    // b's first bill is Feb, so Jan isn't "incomplete" for lacking b.
    expect(completeFlagsFor(["2026-01", "2026-02"], bills)).toEqual([
      true,
      true,
    ]);
  });

  it("marks a month incomplete when a started vendor is missing", () => {
    const bills = [
      bill({ vendorId: "a", period: "2026-01-01", total: 1 }),
      bill({ vendorId: "b", period: "2026-01-01", total: 1 }),
      bill({ vendorId: "a", period: "2026-02-01", total: 1 }),
      // b has no Feb bill though it started in Jan → Feb incomplete.
    ];
    expect(completeFlagsFor(["2026-01", "2026-02"], bills)).toEqual([
      true,
      false,
    ]);
  });

  it("returns all-false when there are no vendors at all", () => {
    expect(completeFlagsFor(["2026-01", "2026-02"], [])).toEqual([
      false,
      false,
    ]);
  });
});

describe("rebase", () => {
  it("indexes a series to 100 at its first non-null value", () => {
    expect(rebase([200, 300, 100])).toEqual([100, 150, 50]);
  });

  it("anchors on the first non-null, preserving leading nulls", () => {
    expect(rebase([null, 50, 100])).toEqual([null, 100, 200]);
  });

  it("returns all-null when there is no data", () => {
    expect(rebase([null, null])).toEqual([null, null]);
  });

  it("rebases a real 0 to 0 without nulling the series", () => {
    expect(rebase([200, 0, 100])).toEqual([100, 0, 50]);
  });

  it("skips a leading 0 when choosing the 100-base", () => {
    expect(rebase([0, 200, 100])).toEqual([0, 100, 50]);
  });

  it("returns all-null when the only values are 0", () => {
    expect(rebase([0, 0])).toEqual([null, null]);
  });
});

describe("shareList", () => {
  it("totals vendor spend over complete months, sorted high → low", () => {
    const series = monthlySeries(
      ["2026-01", "2026-02"],
      [
        bill({ vendorId: "a", period: "2026-01-01", total: 100 }),
        bill({ vendorId: "b", period: "2026-01-01", total: 300 }),
        bill({ vendorId: "a", period: "2026-02-01", total: 50 }),
      ],
      "ARS",
    );
    const out = shareList(series, [true, true], [vendor("a"), vendor("b")]);
    expect(out).toEqual([
      { vendorId: "b", value: 300 },
      { vendorId: "a", value: 150 },
    ]);
  });

  it("ignores incomplete months", () => {
    const series = monthlySeries(
      ["2026-01", "2026-02"],
      [
        bill({ vendorId: "a", period: "2026-01-01", total: 100 }),
        bill({ vendorId: "a", period: "2026-02-01", total: 999 }),
      ],
      "ARS",
    );
    const out = shareList(series, [true, false], [vendor("a")]);
    expect(out).toEqual([{ vendorId: "a", value: 100 }]);
  });
});

describe("perVendorTrend", () => {
  it("computes the % delta between first and last known values", () => {
    const series = monthlySeries(
      ["2026-01", "2026-02", "2026-03"],
      [
        bill({ vendorId: "a", period: "2026-01-01", total: 100 }),
        bill({ vendorId: "a", period: "2026-03-01", total: 150 }),
      ],
      "ARS",
    );
    const [trend] = perVendorTrend(series, [vendor("a")]);
    expect(trend.values).toEqual([100, null, 150]);
    expect(trend.last).toBe(150);
    expect(trend.pct).toBe(50);
  });

  it("yields a null pct and last when the vendor has no data", () => {
    const series = monthlySeries(["2026-01"], [], "ARS");
    const [trend] = perVendorTrend(series, [vendor("a")]);
    expect(trend.last).toBe(null);
    expect(trend.pct).toBe(null);
  });
});

describe("currencyViews", () => {
  it("builds an ARS and a USD view from the same inputs", () => {
    const bills = [
      bill({ vendorId: "a", period: "2026-01-01", total: 1000, usd: 1 }),
    ];
    const views = currencyViews(["2026-01"], bills, [true], [vendor("a")]);
    expect(views.ARS.series[0].total).toBe(1000);
    expect(views.USD.series[0].total).toBe(1);
    expect(views.ARS.share[0]).toEqual({ vendorId: "a", value: 1000 });
    expect(views.USD.share[0]).toEqual({ vendorId: "a", value: 1 });
  });
});

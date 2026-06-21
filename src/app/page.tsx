"use client";

import Link from "next/link";
import { useApp } from "@/components/app/context";
import {
  ChartCard,
  Delta,
  Display,
  DonutFx,
  Eyebrow,
  Legend,
  SparklineFx,
  StackedBarsFx,
  useChartCurrency,
} from "@/components/charts";
import {
  formatMoney,
  formatMonth,
  formatMonthShort,
  formatUSD,
} from "@/lib/format";
import { trpc } from "@/lib/trpc";

export default function OverviewPage() {
  const { propertyId } = useApp();
  const overview = trpc.insights.overview.useQuery({ propertyId });
  const donut = useChartCurrency();
  const bars = useChartCurrency();
  const trend = useChartCurrency();

  if (!overview.data) {
    return (
      <div
        style={{
          maxWidth: "64rem",
          margin: "0 auto",
          padding: "32px 20px",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          color: "var(--muted)",
        }}
      >
        Reading the fine print…
      </div>
    );
  }

  const d = overview.data;
  const vendorById = new Map(d.vendors.map((v) => [v.id, v]));
  const pending = d.billsExpected - d.billsIn;
  const donutShare = d.byCurrency[donut.currency].share;
  const moneySym = donut.currency === "USD" ? "US$" : "AR$";
  const shareTotal = donutShare.reduce((a, s) => a + s.value, 0) || 1;
  const slices = donutShare.map((s) => {
    const v = vendorById.get(s.vendorId);
    return {
      id: s.vendorId,
      label: v?.displayName ?? "—",
      value: s.value,
      color: v?.color ?? "var(--muted)",
    };
  });

  return (
    <div style={{ maxWidth: "64rem", margin: "0 auto", padding: "32px 20px 80px" }}>
      {/* hero */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <Eyebrow>
            {d.property ? d.property.nickname : "All properties"} ·{" "}
            {formatMonth(d.month)} so far
          </Eyebrow>
          <div style={{ marginTop: 8 }}>
            <Display size={44}>{formatMoney(d.thisMonthTotal, "ARS")}</Display>
          </div>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              color: "var(--muted)",
              margin: "8px 0 0",
            }}
          >
            {d.billsIn} of {d.billsExpected} bills in
            {d.thisMonthUsd > 0 && <span> · ≈ {formatUSD(d.thisMonthUsd)}</span>}
            {pending > 0 && <span> · {pending} awaiting</span>}
          </p>
        </div>
        <Link
          href="/insights"
          className="fx-link"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            border: "1px solid var(--line)",
            padding: "9px 14px",
            color: "var(--ink)",
            textDecoration: "none",
            transition: "var(--transition-colors)",
          }}
        >
          See all insights ›
        </Link>
      </div>

      {/* awaiting model */}
      {d.awaiting.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <Eyebrow style={{ marginBottom: 12 }}>This month</Eyebrow>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(184px, 1fr))",
              gap: 12,
            }}
          >
            {d.awaiting.map((a) => (
              <div
                key={a.accountId}
                style={{
                  border: "1px solid var(--line)",
                  background: "var(--card)",
                  padding: "12px 14px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{ width: 9, height: 9, background: a.vendor.color, display: "inline-block" }}
                  />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500 }}>
                    {a.vendor.displayName}
                  </span>
                </div>
                {a.received ? (
                  <>
                    <p
                      style={{
                        fontFamily: "var(--font-display)",
                        fontWeight: 600,
                        fontSize: 18,
                        margin: "10px 0 0",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {formatMoney(a.amount, "ARS")}
                    </p>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", margin: "3px 0 0" }}>
                      received · in ledger
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)", margin: "10px 0 0", lineHeight: 1.5 }}>
                      last{" "}
                      {a.lastPeriod
                        ? `${formatMonthShort(a.lastPeriod)} ${a.lastPeriod.slice(0, 4)}`
                        : "—"}
                      {a.lastAmount != null && <span> · {formatMoney(a.lastAmount, "ARS")}</span>}
                    </p>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, margin: "4px 0 0", color: "var(--accent)" }}>
                      △ awaiting
                    </p>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* where the money goes + trend */}
      <div
        className="fx-stack-sm"
        style={{
          marginTop: 28,
          display: "grid",
          gridTemplateColumns: "minmax(280px, 1fr) minmax(360px, 1.4fr)",
          gap: 16,
          alignItems: "start",
        }}
      >
        <ChartCard
          title="Where the money goes"
          caption="Last 12 complete months"
          action={donut.toggle}
        >
          <div className="fx-wrap-sm" style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <DonutFx slices={slices} centerLabel={moneySym} centerSub="by vendor" />
            <div style={{ display: "flex", flexDirection: "column", gap: 9, flex: 1 }}>
              {slices.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ width: 10, height: 10, background: s.color, display: "inline-block", flex: "none" }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, flex: 1 }}>{s.label}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500 }}>
                    {Math.round((s.value / shareTotal) * 100)}%
                  </span>
                </div>
              ))}
              {slices.length === 0 && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>
                  No complete months yet.
                </span>
              )}
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Monthly spend" caption="Stacked by vendor" action={bars.toggle}>
          <StackedBarsFx
            months={d.months}
            stacks={d.byCurrency[bars.currency].series.map((s) => s.byVendor)}
            vendors={d.vendors}
            currency={bars.currency}
            completeFlags={d.completeFlags}
            height={210}
          />
          <Legend
            items={d.vendors.map((v) => ({ id: v.id, label: v.displayName, color: v.color }))}
            style={{ marginTop: 12 }}
          />
        </ChartCard>
      </div>

      {/* per-vendor sparklines */}
      {d.byCurrency[trend.currency].perVendor.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <ChartCard
            title="Per-vendor trend"
            caption="Spend over the last 12 months"
            action={trend.toggle}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
              {d.byCurrency[trend.currency].perVendor.map((pv) => (
                <div
                  key={pv.vendor.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "8px 0",
                    borderTop: "1px solid color-mix(in srgb, var(--line) 60%, transparent)",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ width: 8, height: 8, background: pv.vendor.color, display: "inline-block" }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, whiteSpace: "nowrap" }}>
                        {pv.vendor.displayName}
                      </span>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                      {formatMoney(pv.last, trend.currency)} <Delta pct={pv.pct} style={{ marginLeft: 4 }} />
                    </div>
                  </div>
                  <SparklineFx values={pv.values} color={pv.vendor.color} />
                </div>
              ))}
            </div>
          </ChartCard>
        </div>
      )}
    </div>
  );
}

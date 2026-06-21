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
      <div className="mx-auto max-w-[64rem] px-5 py-8 font-mono text-[13px] text-muted">
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
    <div className="mx-auto max-w-[64rem] px-5 pt-8 pb-20">
      {/* hero */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>
            {d.property ? d.property.nickname : "All properties"} ·{" "}
            {formatMonth(d.month)} so far
          </Eyebrow>
          <div className="mt-2">
            <Display size={44}>{formatMoney(d.thisMonthTotal, "ARS")}</Display>
          </div>
          <p className="font-mono text-[13px] text-muted mt-2">
            {d.billsIn} of {d.billsExpected} bills in
            {d.thisMonthUsd > 0 && <span> · ≈ {formatUSD(d.thisMonthUsd)}</span>}
            {pending > 0 && <span> · {pending} awaiting</span>}
          </p>
        </div>
        <Link
          href="/insights"
          className="font-mono text-micro uppercase tracking-label border border-line py-[9px] px-[14px] text-ink no-underline transition-colors hover:border-accent hover:text-accent"
        >
          See all insights ›
        </Link>
      </div>

      {/* awaiting model */}
      {d.awaiting.length > 0 && (
        <div className="mt-7">
          <Eyebrow className="mb-3">This month</Eyebrow>
          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(184px,1fr))]">
            {d.awaiting.map((a) => (
              <div
                key={a.accountId}
                className="border border-line bg-card py-3 px-[14px]"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-[9px] h-[9px]"
                    style={{ background: a.vendor.color }}
                  />
                  <span className="font-mono text-[13px] font-medium">
                    {a.vendor.displayName}
                  </span>
                </div>
                {a.received ? (
                  <>
                    <p className="font-display font-semibold text-lg mt-2.5 tracking-tight">
                      {formatMoney(a.amount, "ARS")}
                    </p>
                    <p className="font-mono text-micro text-muted mt-[3px]">
                      received · in ledger
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-mono text-xs text-muted mt-2.5 leading-[1.5]">
                      last{" "}
                      {a.lastPeriod
                        ? `${formatMonthShort(a.lastPeriod)} ${a.lastPeriod.slice(0, 4)}`
                        : "—"}
                      {a.lastAmount != null && <span> · {formatMoney(a.lastAmount, "ARS")}</span>}
                    </p>
                    <p className="font-mono text-micro mt-1 text-accent">
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
      <div className="mt-7 grid grid-cols-1 md:grid-cols-[minmax(280px,1fr)_minmax(360px,1.4fr)] gap-4 items-start">
        <ChartCard
          title="Where the money goes"
          caption="Last 12 complete months"
          action={donut.toggle}
        >
          <div className="flex flex-wrap items-center gap-[18px] md:flex-nowrap">
            <DonutFx slices={slices} centerLabel={moneySym} centerSub="by vendor" />
            <div className="flex flex-col gap-[9px] flex-1">
              {slices.map((s) => (
                <div key={s.id} className="flex items-center gap-[9px]">
                  <span
                    className="inline-block w-2.5 h-2.5 flex-none"
                    style={{ background: s.color }}
                  />
                  <span className="font-mono text-xs flex-1">{s.label}</span>
                  <span className="font-mono text-xs font-medium">
                    {Math.round((s.value / shareTotal) * 100)}%
                  </span>
                </div>
              ))}
              {slices.length === 0 && (
                <span className="font-mono text-xs text-muted">
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
            className="mt-3"
          />
        </ChartCard>
      </div>

      {/* per-vendor sparklines */}
      {d.byCurrency[trend.currency].perVendor.length > 0 && (
        <div className="mt-4">
          <ChartCard
            title="Per-vendor trend"
            caption="Spend over the last 12 months"
            action={trend.toggle}
          >
            <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
              {d.byCurrency[trend.currency].perVendor.map((pv) => (
                <div
                  key={pv.vendor.id}
                  className="flex items-center gap-3 py-2 border-t border-[color-mix(in_srgb,var(--line)_60%,transparent)]"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-[7px]">
                      <span
                        className="inline-block w-2 h-2"
                        style={{ background: pv.vendor.color }}
                      />
                      <span className="font-mono text-xs whitespace-nowrap">
                        {pv.vendor.displayName}
                      </span>
                    </div>
                    <div className="font-mono text-micro text-muted mt-1">
                      {formatMoney(pv.last, trend.currency)} <Delta pct={pv.pct} className="ml-1" />
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

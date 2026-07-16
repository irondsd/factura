"use client";

import Link from "next/link";
import {
  ChartCard,
  Delta,
  Display,
  Eyebrow,
  SparklineFx,
  SpendOverTime,
  useChartCurrency,
  VendorShare,
} from "@/components/charts";
import { useI18n } from "@/i18n/I18nProvider";
import { interpolate } from "@/i18n/config";
import {
  formatMoney,
  formatMonth,
  formatMonthShort,
  formatUSD,
} from "@/lib/format";
import { toSlices } from "@/lib/insights";
import type { RouterOutputs } from "@/lib/trpc";

type Overview = RouterOutputs["insights"]["overview"];

/** Presentational Overview screen. The data is injected by the caller (tRPC in
 * the signed-in app, static fixtures in /demo); everything interactive here —
 * the per-chart ARS/USD toggles — is local client state over that same data.
 * `insightsHref` lets the demo point the "see all insights" link at /demo. */
export function OverviewView({
  data: d,
  insightsHref = "/app/insights",
}: {
  data: Overview;
  insightsHref?: string;
}) {
  const { t, locale } = useI18n();
  const to = t.overview;
  const donut = useChartCurrency();
  const bars = useChartCurrency();
  const trend = useChartCurrency();

  const pending = d.billsExpected - d.billsIn;
  const moneySym = donut.currency === "USD" ? "US$" : "AR$";
  const slices = toSlices(d.byCurrency[donut.currency].share, d.vendors);

  // The selected property lives in the URL (?property=<nickname>); carry it
  // forward so "see all insights" keeps the selection, like the TopBar nav.
  const insightsUrl = d.property
    ? `${insightsHref}?${new URLSearchParams({ property: d.property.nickname.toLowerCase() })}`
    : insightsHref;

  return (
    <div className="mx-auto max-w-[64rem] px-5 pt-8 pb-20">
      {/* hero */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>
            {d.property ? d.property.nickname : t.common.allProperties} ·{" "}
            {formatMonth(d.month, locale)} {to.soFar}
          </Eyebrow>
          <div className="mt-2">
            <Display size={44}>{formatMoney(d.thisMonthTotal, "ARS")}</Display>
          </div>
          <p className="font-mono text-[13px] text-muted mt-2">
            {interpolate(to.billsIn, {
              in: d.billsIn,
              expected: d.billsExpected,
            })}
            {d.thisMonthUsd > 0 && (
              <span> · ≈ {formatUSD(d.thisMonthUsd)}</span>
            )}
            {pending > 0 && (
              <span>
                {" · "}
                {pending === 1
                  ? to.awaitingOne
                  : interpolate(to.awaitingOther, { n: pending })}
              </span>
            )}
          </p>
        </div>
        <Link
          href={insightsUrl}
          className="font-mono text-micro uppercase tracking-label border border-line py-[9px] px-[14px] text-ink no-underline transition-colors hover:border-accent hover:text-accent"
        >
          {to.seeInsights}
        </Link>
      </div>

      {/* awaiting model */}
      {d.awaiting.length > 0 && (
        <div className="mt-7">
          <Eyebrow className="mb-3">{to.thisMonth}</Eyebrow>
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
                      {to.received}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-mono text-xs text-muted mt-2.5 leading-[1.5]">
                      {to.last}{" "}
                      {a.lastPeriod
                        ? `${formatMonthShort(a.lastPeriod, locale)} ${a.lastPeriod.slice(0, 4)}`
                        : "—"}
                      {a.lastAmount != null && (
                        <span> · {formatMoney(a.lastAmount, "ARS")}</span>
                      )}
                    </p>
                    <p className="font-mono text-micro mt-1 text-accent">
                      {to.awaitingTag}
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
          title={to.whereMoneyGoes}
          caption={to.last12Complete}
          action={donut.toggle}
        >
          <VendorShare
            slices={slices}
            centerLabel={moneySym}
            centerSub={to.byVendor}
          />
        </ChartCard>

        <ChartCard
          title={to.monthlySpend}
          caption={to.stackedByVendor}
          action={bars.toggle}
        >
          <SpendOverTime
            months={d.months}
            stacks={d.byCurrency[bars.currency].series.map((s) => s.byVendor)}
            vendors={d.vendors}
            currency={bars.currency}
            completeFlags={d.completeFlags}
            height={210}
          />
        </ChartCard>
      </div>

      {/* per-vendor sparklines */}
      {d.byCurrency[trend.currency].perVendor.length > 0 && (
        <div className="mt-4">
          <ChartCard
            title={to.perVendorTrend}
            caption={to.spendLast12}
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
                      {formatMoney(pv.last, trend.currency)}{" "}
                      <Delta pct={pv.pct} className="ml-1" />
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

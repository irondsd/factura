"use client";

import { MonthSwitcher } from "@/components/demo/MonthSwitcher";
import {
  ChartCard,
  Delta,
  Display,
  Eyebrow,
  SparklineFx,
  SpendOverTime,
  useChartCurrency,
  useEntranceAnimation,
  VendorShare,
} from "@/components/charts";
import { Button } from "@/components/ui";
import { useLocale, useT } from "@/i18n/I18nProvider";
import { interpolate } from "@/i18n/config";
import { cn } from "@/lib/cn";
import {
  formatMoney,
  formatMonthShort,
  formatUSD,
  roundSignificant,
} from "@/lib/format";
import { toSlices } from "@/lib/insights";
import type { DemoOverviewData } from "@/lib/demo/fixtures";

/** Presentational Overview screen for the public demo. Everything interactive
 * here — the per-chart ARS/USD toggles — is local state over static fixtures.
 *
 * The month on screen is the caller's state too: `onMonthChange` hands back a
 * pick from the switcher, and the next `data` is that month's snapshot. */
export function OverviewView({
  data: d,
  insightsHref = "/demo/insights",
  onMonthChange,
  pending = false,
}: {
  data: DemoOverviewData;
  insightsHref?: string;
  onMonthChange: (month: string) => void;
  /** The snapshot on screen is a month behind the pick — fade it out until the
   * new one lands, so a switch reads as a transition rather than a flicker. */
  pending?: boolean;
}) {
  const tCommon = useT("common");
  const to = useT("overview");
  const locale = useLocale();
  const donut = useChartCurrency();
  const bars = useChartCurrency();
  const trend = useChartCurrency();
  // The screen arrives over its skeleton: the text fades up into the bones it
  // replaces, and the charts draw themselves once on the way in. Both are
  // first-mount only — a currency toggle or a month pick isn't an arrival.
  const entering = useEntranceAnimation();

  const awaited = d.billsExpected - d.billsIn;
  // Lead with what the month is expected to cost rather than what has landed so
  // far. A partial-month accumulator reads "$0" for the first week of every
  // month — the loudest element on the screen saying the least. Needs an actual
  // estimate to show: an account with no history contributes nothing, so a
  // brand-new property falls back to the plain total rather than "≈ $0".
  // A month with a bill still missing leads with the estimate whether or not it
  // has ended — a June that never got its gas bill is not a smaller June.
  const showExpected = awaited > 0 && d.expectedTotal > 0;
  const moneySym = donut.currency === "USD" ? "US$" : "AR$";
  const slices = toSlices(d.byCurrency[donut.currency].share, d.vendors);

  // The selected property lives in the URL (?property=<nickname>); carry it
  // forward so "see all insights" keeps the selection, like the TopBar nav.
  const insightsUrl = d.property
    ? `${insightsHref}?${new URLSearchParams({ property: d.property.nickname.toLowerCase() })}`
    : insightsHref;

  // Everything the month switcher governs fades together while the next
  // snapshot loads; the charts below it don't move with the pick.
  const fade = cn(
    "transition-[opacity,transform] duration-200",
    pending && "opacity-40 translate-y-[3px]",
  );

  // Three states, not two: the month you're in, a month that's done, and a past
  // month still owed a bill. The last one is the one worth colouring — it's an
  // upload the reader can still go and make.
  const monthLabel = d.isCurrentMonth
    ? to.thisMonth
    : d.closed
      ? to.closedMonth
      : to.incompleteMonth;
  const monthTone = !d.isCurrentMonth && !d.closed ? "accent" : "muted";

  return (
    <div className="mx-auto max-w-[64rem] px-5 pt-8 pb-20 motion-safe:animate-[fd-fade-in_360ms_ease-out]">
      {/* hero */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className={fade}>
          <Eyebrow as="div" className="flex flex-wrap items-center gap-x-2.5">
            <span>
              {d.property ? d.property.nickname : tCommon.allProperties} ·
            </span>
            <MonthSwitcher
              month={d.month}
              options={d.monthOptions}
              onSelect={onMonthChange}
            />
            {/* "so far" describes a partial total, not a whole-month estimate —
                and never a closed month, which is neither. */}
            {d.isCurrentMonth && !showExpected && <span>{to.soFar}</span>}
          </Eyebrow>
          <div className="mt-2">
            <Display size={44}>
              {showExpected
                ? `≈ ${formatMoney(roundSignificant(d.expectedTotal), "ARS")}`
                : formatMoney(d.thisMonthTotal, "ARS")}
            </Display>
          </div>
          <p className="font-mono text-[13px] text-muted mt-2">
            {showExpected ? (
              <>
                {to.expected}
                {d.thisMonthTotal > 0 && (
                  <span>
                    {" · "}
                    {formatMoney(d.thisMonthTotal, "ARS")} {to.confirmed}
                  </span>
                )}
                <span>
                  {" · "}
                  {awaited === 1
                    ? to.awaitingOne
                    : interpolate(to.awaitingOther, { n: awaited })}
                </span>
              </>
            ) : (
              <>
                {/* A closed month has no expectation left to report against, so
                    it counts what it holds rather than "4 of 4". */}
                {!d.isCurrentMonth && d.closed
                  ? `${to.closed} · ${
                      d.billsIn === 1
                        ? to.inLedgerOne
                        : interpolate(to.inLedgerOther, { n: d.billsIn })
                    }`
                  : interpolate(to.billsIn, {
                      in: d.billsIn,
                      expected: d.billsExpected,
                    })}
                {d.thisMonthUsd > 0 && (
                  <span> · ≈ {formatUSD(d.thisMonthUsd)}</span>
                )}
                {awaited > 0 && (
                  <span>
                    {" · "}
                    {awaited === 1
                      ? to.awaitingOne
                      : interpolate(to.awaitingOther, { n: awaited })}
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        <Button href={insightsUrl} className="h-9.5">
          {to.seeInsights}
        </Button>
      </div>

      {/* awaiting model — in a closed month, simply what the ledger holds */}
      {(d.awaiting.length > 0 || !d.isCurrentMonth) && (
        <div className={cn("mt-7", fade)}>
          <Eyebrow className="mb-3" tone={monthTone}>
            {monthLabel}
          </Eyebrow>
          {d.awaiting.length === 0 && (
            <p className="font-mono text-[13px] text-muted">
              {to.noBillsThisMonth}
            </p>
          )}
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
                      {d.isCurrentMonth ? to.received : to.settled}
                    </p>
                    {/* Only ever present when we committed to a number before
                     * this bill arrived — so it reads as a score, not a
                     * post-hoc comparison. */}
                    {a.vsExpected != null && (
                      <p className="mt-1 flex items-center gap-1">
                        <Delta pct={a.vsExpected * 100} />
                        <span className="font-mono text-micro text-muted">
                          {to.vsExpected}
                        </span>
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    {/* The estimate sits where a received card puts its amount,
                     * so an awaiting card reads as an itemization of the hero
                     * rather than a hole. Muted and prefixed "≈" to keep the
                     * distinction between an estimate and a bill. */}
                    {a.expected != null && a.expected > 0 && (
                      <p className="font-display font-semibold text-lg mt-2.5 tracking-tight text-muted">
                        ≈ {formatMoney(roundSignificant(a.expected), "ARS")}
                      </p>
                    )}
                    <p
                      className={`font-mono text-xs text-muted leading-[1.5] ${
                        a.expected != null && a.expected > 0 ? "mt-1" : "mt-2.5"
                      }`}
                    >
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
            animate={entering}
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
            animate={entering}
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

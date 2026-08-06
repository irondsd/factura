"use client";

import {
  ChartCard,
  CurrencyToggle,
  Display,
  Eyebrow,
} from "@/components/charts";
import { Bone, Button } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";

/** First paint of the Overview, before the ledger answers.
 *
 * Every box here is the box `OverviewView` will put in its place — same grid,
 * same padding, same type sizes — so the swap when the query lands is a
 * cross-fade rather than a reflow. What's *defined* stays defined: chart
 * titles, captions and the ARS/USD switches are the same strings either way and
 * would only flicker if they were boned. What the server has to tell us —
 * property, month, totals, vendor names, amounts, the charts themselves — is a
 * bone.
 *
 * We don't know the vendor count before the answer arrives, so we assume four:
 * the common shape (expensas, gas, power, internet) and close enough that the
 * page doesn't visibly resize when the real count lands. */
const VENDORS = 4;

/** The trailing window both charts cover. */
const MONTHS = 12;

// The bar chart's geometry, copied from what recharts derives inside
// SpendOverTime: height 210 with an 8px top margin and a 30px axis strip leaves
// a 172px plot, and the YAxis reserves 52px. Matching it here is what keeps the
// bars from jumping when the real chart replaces this one.
const PLOT_TOP = 8;
const PLOT_H = 172;
const AXIS_W = 52;
const AXIS_H = 30;
/** Five gridlines, evenly spread, as recharts' default tick count gives. */
const GRID = [0, 0.25, 0.5, 0.75, 1].map((f) => PLOT_TOP + f * PLOT_H);

/** Bar stubs, held at roughly the same fraction of the plot so the row reads as
 * a chart waiting for numbers rather than as twelve equal blocks. */
const STUBS = [
  0.38, 0.4, 0.37, 0.42, 0.36, 0.39, 0.41, 0.38, 0.44, 0.4, 0.37, 0.42,
];

/** The donut's ring, as DonutFx draws it: a 180px square, outer radius 88,
 * 30px thick. Punched out of a bone with a mask so it shimmers like the rest. */
const DONUT_SIZE = 180;
const RING = `radial-gradient(circle, transparent 0 58px, #000 58px 88px, transparent 88px)`;

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** A dead copy of the currency switch. It's the same control the loaded card
 * carries — boning it would only make a fixed label flicker — but there is no
 * chart under it yet for a pick to change. */
function DeadToggle() {
  return (
    <CurrencyToggle
      value="ARS"
      onChange={() => {}}
      className="pointer-events-none"
    />
  );
}

export function OverviewSkeleton() {
  const { t } = useI18n();
  const to = t.overview;

  return (
    <div className="mx-auto max-w-[64rem] px-5 pt-8 pb-20" aria-busy="true">
      <span className="sr-only">{t.app.loading}</span>

      {/* hero */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow as="div" className="flex flex-wrap items-center gap-x-2.5">
            <span>
              <Bone chars={7} /> ·
            </span>
            {/* the month switcher's trigger: label + its ▼. The bone is wrapped
                in a span of its own — a bone dropped straight into a flex
                container gets blockified, and its padding would then count
                against the line and push the row taller than the real one. */}
            <span className="inline-flex items-center gap-[7px]">
              <span>
                <Bone chars={11} />
              </span>
              <span className="text-[9px] tracking-normal text-muted">▼</span>
            </span>
          </Eyebrow>
          <div className="mt-2">
            <Display size={44}>
              <Bone chars={10} />
            </Display>
          </div>
          <p className="font-mono text-[13px] text-muted mt-2">
            <Bone chars={42} />
          </p>
        </div>
        <Button href="/app/insights">{to.seeInsights}</Button>
      </div>

      {/* awaiting model — the label is one of three ("this month" / "closed" /
          "incomplete") and only the ledger knows which, so it's a bone too */}
      <div className="mt-7">
        <Eyebrow className="mb-3">
          <Bone chars={10} />
        </Eyebrow>
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(184px,1fr))]">
          {range(VENDORS).map((i) => (
            <div key={i} className="border border-line bg-card py-3 px-[14px]">
              <div className="flex items-center gap-2">
                <Bone w={9} h={9} className="flex-none" />
                <span className="font-mono text-[13px] font-medium">
                  <Bone chars={8} />
                </span>
              </div>
              <p className="font-display font-semibold text-lg mt-2.5 tracking-tight text-muted">
                <Bone chars={9} />
              </p>
              {/* Two lines, because that's what the real note takes: "last Jul
                  2026 · $ 29.778" always wraps at this tile width, and a
                  received card spends the same two lines on its status and its
                  vs-expected delta. One line here and the whole row of tiles
                  would grow 18px when the data lands. */}
              <p className="font-mono text-xs text-muted leading-[1.5] mt-1">
                <Bone chars={15} />
                <br />
                <Bone chars={9} />
              </p>
              <p className="font-mono text-micro mt-1 text-accent">
                <Bone chars={9} />
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* where the money goes + trend */}
      <div className="mt-7 grid grid-cols-1 md:grid-cols-[minmax(280px,1fr)_minmax(360px,1.4fr)] gap-4 items-start">
        <ChartCard
          title={to.whereMoneyGoes}
          caption={to.last12Complete}
          action={<DeadToggle />}
        >
          <div className="flex flex-wrap items-center gap-4 md:flex-nowrap">
            <div
              className="fd-bone flex-none"
              style={{
                width: DONUT_SIZE,
                height: DONUT_SIZE,
                WebkitMaskImage: RING,
                maskImage: RING,
              }}
            />
            <div className="flex flex-col gap-2 flex-1">
              {range(VENDORS).map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <Bone w={10} h={10} className="flex-none" />
                  <span className="font-mono text-xs flex-1">
                    <Bone chars={8} />
                  </span>
                  <span className="font-mono text-xs font-medium">
                    <Bone chars={3} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        <ChartCard
          title={to.monthlySpend}
          caption={to.stackedByVendor}
          action={<DeadToggle />}
        >
          <div className="flex" style={{ height: PLOT_TOP + PLOT_H + AXIS_H }}>
            <div className="relative flex-none" style={{ width: AXIS_W }}>
              {GRID.map((top) => (
                <span
                  key={top}
                  className="absolute right-[5px] -translate-y-1/2 font-mono text-[10px]"
                  style={{ top }}
                >
                  <Bone chars={4} />
                </span>
              ))}
            </div>
            {/* min-w-0 throughout: twelve columns of month bones have a
                min-content width that a phone-width card can't afford, and
                without it they'd refuse to shrink and run past the card edge —
                where the real chart just draws narrower bars. */}
            <div className="relative flex-1 min-w-0 mr-2">
              {GRID.map((top) => (
                <div
                  key={top}
                  className="absolute inset-x-0 border-t border-dotted border-line"
                  style={{ top }}
                />
              ))}
              <div
                className="flex items-end gap-1"
                style={{ height: PLOT_H, marginTop: PLOT_TOP }}
              >
                {STUBS.map((f, i) => (
                  <Bone key={i} h={f * PLOT_H} className="flex-1 min-w-0" />
                ))}
              </div>
              <div
                className="flex items-center gap-1"
                style={{ height: AXIS_H }}
              >
                {range(MONTHS).map((i) => (
                  <span
                    key={i}
                    className="flex flex-1 min-w-0 justify-center overflow-hidden"
                  >
                    <Bone w="72%" h={11} />
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-[18px] gap-y-2">
            {range(VENDORS).map((i) => (
              <span
                key={i}
                className="inline-flex items-center gap-[7px] font-mono text-micro"
              >
                <Bone w={10} h={10} />
                <span>
                  <Bone chars={8} />
                </span>
              </span>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* per-vendor sparklines */}
      <div className="mt-4">
        <ChartCard
          title={to.perVendorTrend}
          caption={to.spendLast12}
          action={<DeadToggle />}
        >
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
            {range(VENDORS).map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 py-2 border-t border-[color-mix(in_srgb,var(--line)_60%,transparent)]"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-[7px]">
                    <Bone w={8} h={8} className="flex-none" />
                    <span className="font-mono text-xs whitespace-nowrap">
                      <Bone chars={8} />
                    </span>
                  </div>
                  <div className="font-mono text-micro text-muted mt-1">
                    <Bone chars={12} />
                  </div>
                </div>
                <Bone w={96} h={28} className="flex-none" />
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

"use client";

import {
  ChartCard,
  Legend,
  LineChartFx,
  SpendOverTime,
  useChartCurrency,
  VendorShare,
} from "@/components/charts";
import { FinePrint } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { toSlices } from "@/lib/insights";
import { type SeriesData, USD_LINE } from "./shared";

export function AllVendorsCharts({ data }: { data: SeriesData | undefined }) {
  const { t } = useI18n();
  const ti = t.insights;
  const bars = useChartCurrency();
  const donut = useChartCurrency();
  if (!data) {
    return <FinePrint className="mt-5" />;
  }
  const slices = toSlices(data.byCurrency[donut.currency].share, data.vendors);

  return (
    <>
      <ChartCard
        title={ti.totalSpend}
        caption={ti.stackedByVendor}
        action={bars.toggle}
        className="mt-4"
      >
        <SpendOverTime
          months={data.months}
          stacks={data.byCurrency[bars.currency].series.map((s) => s.byVendor)}
          vendors={data.vendors}
          currency={bars.currency}
          completeFlags={data.completeFlags}
          height={230}
        />
      </ChartCard>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-[minmax(280px,1fr)_minmax(360px,1.5fr)] gap-4 items-start">
        <ChartCard
          title={ti.vendorShare}
          caption={ti.whereInRange}
          action={donut.toggle}
        >
          <VendorShare
            slices={slices}
            centerLabel={donut.currency === "USD" ? "US$" : "AR$"}
            centerSub={ti.total}
          />
        </ChartCard>

        <ChartCard title={ti.inflationLens} caption={ti.inflationCaption}>
          <LineChartFx
            months={data.months}
            currency="IDX"
            series={[
              {
                label: ti.whatYouPay,
                color: "var(--accent)",
                values: data.inflation.arsIdx,
              },
              {
                label: ti.realCost,
                color: USD_LINE,
                values: data.inflation.usdIdx,
                dashed: true,
              },
            ]}
            height={200}
          />
          <Legend
            className="mt-3"
            items={[
              { label: ti.whatYouPay, color: "var(--accent)" },
              { label: ti.realCostBlue, color: USD_LINE },
            ]}
          />
          <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6]">
            {ti.inflationNote}
          </p>
        </ChartCard>
      </div>
    </>
  );
}

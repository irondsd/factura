"use client";

import { useState } from "react";
import {
  ChartCard,
  Delta,
  Display,
  Eyebrow,
  Legend,
  LineChartFx,
  Segmented,
  StackedBarsFx,
  useChartCurrency,
  VendorShare,
} from "@/components/charts";
import { FilterPill, FinePrint } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { toSlices } from "@/lib/insights";
import type { RouterOutputs } from "@/lib/trpc";

export type InsightsRange = 12 | 24;

type SeriesData = RouterOutputs["insights"]["series"];
type VendorDetail = NonNullable<RouterOutputs["insights"]["vendorDetail"]>;
type CustomFieldSeries = VendorDetail["fields"][number];

/** How the Insights screen reads its data. The signed-in app backs these with
 * tRPC queries (the vendor-detail one fetches lazily); /demo backs them with
 * static fixtures. Both are hooks, so the view calls them unconditionally in a
 * stable order (Rules of Hooks). `vendorDetail` is ignored while "all" vendors
 * are selected. */
export type InsightsSource = {
  useSeries: (
    propertyId: string | undefined,
    range: InsightsRange,
  ) => SeriesData | undefined;
  useVendorDetail: (
    propertyId: string | undefined,
    vendorId: string,
    range: InsightsRange,
  ) => VendorDetail | null | undefined;
};

const USD_LINE = "#4a4034";

export function InsightsView({
  source,
  propertyId,
}: {
  source: InsightsSource;
  propertyId?: string;
}) {
  const { t } = useI18n();
  const [vendorId, setVendorId] = useState<string>("all");
  const [range, setRange] = useState<InsightsRange>(12);

  const series = source.useSeries(propertyId, range);
  const detail = source.useVendorDetail(propertyId, vendorId, range);

  const vendorsHere = series?.vendors ?? [];

  return (
    <div className="mx-auto max-w-[64rem] px-5 pt-8 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-[14px]">
        <div>
          <Eyebrow>{t.nav.insights}</Eyebrow>
          <Display size={34} className="block mt-1.5">
            {t.insights.title}
          </Display>
        </div>
        <Segmented
          options={[
            { value: 12, label: t.insights.range12 },
            { value: 24, label: t.insights.range24 },
          ]}
          value={range}
          onChange={setRange}
        />
      </div>

      {/* vendor filter */}
      <div className="flex flex-wrap gap-1.5 mt-[18px] border-b border-line pb-3">
        <FilterPill
          label={t.common.allVendors}
          active={vendorId === "all"}
          onClick={() => setVendorId("all")}
        />
        {vendorsHere.map((v) => (
          <FilterPill
            key={v.id}
            label={v.displayName}
            color={v.color}
            active={vendorId === v.id}
            onClick={() => setVendorId(v.id)}
          />
        ))}
      </div>

      {vendorId === "all" ? (
        <AllVendorsCharts data={series} />
      ) : (
        <SingleVendorCharts data={detail} />
      )}
    </div>
  );
}

function AllVendorsCharts({ data }: { data: SeriesData | undefined }) {
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
        <StackedBarsFx
          months={data.months}
          stacks={data.byCurrency[bars.currency].series.map((s) => s.byVendor)}
          vendors={data.vendors}
          currency={bars.currency}
          completeFlags={data.completeFlags}
          height={230}
        />
        <Legend
          items={data.vendors.map((v) => ({
            id: v.id,
            label: v.displayName,
            color: v.color,
          }))}
          className="mt-3"
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

function SingleVendorCharts({
  data: d,
}: {
  data: VendorDetail | null | undefined;
}) {
  const { t } = useI18n();
  const ti = t.insights;
  const spend = useChartCurrency();

  if (!d) {
    return <FinePrint className="mt-5" />;
  }

  const vendor = d.vendor;
  const spendValues = d.spend[spend.currency];
  const knownSpend = spendValues.filter((x): x is number => x != null);
  const pct =
    knownSpend.length > 1
      ? ((knownSpend[knownSpend.length - 1] - knownSpend[0]) / knownSpend[0]) *
        100
      : null;

  return (
    <>
      <div className="flex items-baseline gap-[14px] mt-[18px]">
        <Display size={28}>
          {formatMoney(
            knownSpend[knownSpend.length - 1] ?? null,
            spend.currency,
          )}
        </Display>
        <span className="font-mono text-xs text-muted">
          {ti.latest} · <Delta pct={pct} /> {ti.overRange}
        </span>
      </div>

      <ChartCard
        title={interpolate(ti.spendOverTime, { vendor: vendor.displayName })}
        action={spend.toggle}
        className="mt-[14px]"
      >
        <LineChartFx
          months={d.months}
          currency={spend.currency}
          series={[
            {
              label: vendor.displayName,
              color: vendor.color,
              values: spendValues,
            },
          ]}
          height={210}
        />
      </ChartCard>

      {/* One section per parser-extracted custom field — fully vendor-agnostic. */}
      {d.fields.map((f) => (
        <CustomFieldCharts
          key={f.name}
          field={f}
          months={d.months}
          color={vendor.color}
        />
      ))}

      {d.fields.length === 0 && (
        <p className="font-mono text-xs text-muted mt-4 mx-0.5 leading-[1.6]">
          {ti.noExtraFields}
        </p>
      )}
    </>
  );
}

/** Render a single custom field: its monthly series, plus a price-per-unit lens
 * for quantity fields (kWh, m³, GB, …). */
function CustomFieldCharts({
  field,
  months,
  color,
}: {
  field: CustomFieldSeries;
  months: string[];
  color: string;
}) {
  const { t } = useI18n();
  const money = useChartCurrency();
  const isQuantity = field.type === "quantity";
  // Money fields follow their own currency toggle; quantities/numbers show raw
  // values in their native unit.
  const lineCurrency = field.isMoney ? money.currency : "UNIT";
  const values =
    field.isMoney && money.currency === "USD"
      ? (field.valuesUsd ?? field.values)
      : field.values;
  const caption = field.unit ?? "";

  return (
    <div
      className={cn(
        "mt-4 grid grid-cols-1 gap-4 items-start",
        isQuantity && field.unitPrice && "md:grid-cols-2",
      )}
    >
      <ChartCard
        title={`${field.name}${field.unit ? ` · ${field.unit}` : ""}`}
        caption={caption}
        action={field.isMoney ? money.toggle : undefined}
      >
        <LineChartFx
          months={months}
          currency={lineCurrency}
          series={[{ label: field.name, color, values }]}
          height={190}
        />
      </ChartCard>

      {isQuantity && field.unitPrice && (
        <ChartCard
          title={interpolate(t.insights.pricePer, {
            unit: field.unit || t.insights.unit,
          })}
          caption={t.insights.rebased}
        >
          <LineChartFx
            months={months}
            currency="IDX"
            series={[
              {
                label: `ARS / ${field.unit || t.insights.unit}`,
                color: "var(--accent)",
                values: field.unitPrice.arsIdx,
              },
              {
                label: `USD / ${field.unit || t.insights.unit}`,
                color: USD_LINE,
                values: field.unitPrice.usdIdx,
                dashed: true,
              },
            ]}
            height={190}
          />
          <Legend
            className="mt-2.5"
            items={[
              {
                label: `ARS / ${field.unit || t.insights.unit}`,
                color: "var(--accent)",
              },
              { label: `USD / ${field.unit || t.insights.unit}`, color: USD_LINE },
            ]}
          />
        </ChartCard>
      )}
    </div>
  );
}

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
  const [vendorId, setVendorId] = useState<string>("all");
  const [range, setRange] = useState<InsightsRange>(12);

  const series = source.useSeries(propertyId, range);
  const detail = source.useVendorDetail(propertyId, vendorId, range);

  const vendorsHere = series?.vendors ?? [];

  return (
    <div className="mx-auto max-w-[64rem] px-5 pt-8 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-[14px]">
        <div>
          <Eyebrow>Insights</Eyebrow>
          <Display size={34} className="block mt-1.5">
            How your bills move
          </Display>
        </div>
        <Segmented
          options={[
            { value: 12, label: "12 mo" },
            { value: 24, label: "24 mo" },
          ]}
          value={range}
          onChange={setRange}
        />
      </div>

      {/* vendor filter */}
      <div className="flex flex-wrap gap-1.5 mt-[18px] border-b border-line pb-3">
        <FilterPill
          label="All vendors"
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
  const bars = useChartCurrency();
  const donut = useChartCurrency();
  if (!data) {
    return <FinePrint className="mt-5" />;
  }
  const slices = toSlices(data.byCurrency[donut.currency].share, data.vendors);

  return (
    <>
      <ChartCard
        title="Total spend over time"
        caption="Stacked by vendor"
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
          title="Vendor share"
          caption="Where it goes, in range"
          action={donut.toggle}
        >
          <VendorShare
            slices={slices}
            centerLabel={donut.currency === "USD" ? "US$" : "AR$"}
            centerSub="total"
          />
        </ChartCard>

        <ChartCard
          title="Inflation lens"
          caption="Same spend, rebased to 100 — pesos vs the dollar cost"
        >
          <LineChartFx
            months={data.months}
            currency="IDX"
            series={[
              {
                label: "What you pay (ARS)",
                color: "var(--accent)",
                values: data.inflation.arsIdx,
              },
              {
                label: "Real cost (USD)",
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
              { label: "What you pay (ARS)", color: "var(--accent)" },
              { label: "Real cost (USD blue)", color: USD_LINE },
            ]}
          />
          <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6]">
            Pesos climb with inflation; in dollars your real cost is far
            flatter. The gap is the peso losing value — not you using more.
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
          latest · <Delta pct={pct} /> over range
        </span>
      </div>

      <ChartCard
        title={`${vendor.displayName} — spend over time`}
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
          This parser extracts no extra fields beyond the amount — the climb is
          inflation, not usage. Add fields like consumption or surcharges in the
          parser builder to chart them here.
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
          title={`Price per ${field.unit || "unit"}`}
          caption="Rebased to 100 — ARS vs USD"
        >
          <LineChartFx
            months={months}
            currency="IDX"
            series={[
              {
                label: `ARS / ${field.unit || "unit"}`,
                color: "var(--accent)",
                values: field.unitPrice.arsIdx,
              },
              {
                label: `USD / ${field.unit || "unit"}`,
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
                label: `ARS / ${field.unit || "unit"}`,
                color: "var(--accent)",
              },
              { label: `USD / ${field.unit || "unit"}`, color: USD_LINE },
            ]}
          />
        </ChartCard>
      )}
    </div>
  );
}

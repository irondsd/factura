"use client";

import { useState } from "react";
import { useApp } from "@/components/app/context";
import {
  ChartCard,
  Delta,
  Display,
  DonutFx,
  Eyebrow,
  Legend,
  LineChartFx,
  Segmented,
  StackedBarsFx,
  useChartCurrency,
} from "@/components/charts";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { type RouterOutputs, trpc } from "@/lib/trpc";

type Range = 12 | 24;

const USD_LINE = "#4a4034";

export default function InsightsPage() {
  const { propertyId } = useApp();
  const [vendorId, setVendorId] = useState<string>("all");
  const [range, setRange] = useState<Range>(12);

  const series = trpc.insights.series.useQuery({ propertyId, range });

  const vendorsHere = series.data?.vendors ?? [];

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
        <VendorTab
          label="All vendors"
          active={vendorId === "all"}
          onClick={() => setVendorId("all")}
        />
        {vendorsHere.map((v) => (
          <VendorTab
            key={v.id}
            label={v.displayName}
            color={v.color}
            active={vendorId === v.id}
            onClick={() => setVendorId(v.id)}
          />
        ))}
      </div>

      {vendorId === "all" ? (
        <AllVendorsCharts data={series.data} />
      ) : (
        <SingleVendorCharts
          propertyId={propertyId}
          vendorId={vendorId}
          range={range}
        />
      )}
    </div>
  );
}

function VendorTab({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-[7px] font-mono text-micro uppercase tracking-[0.12em] py-[5px] px-[11px] cursor-pointer border transition-colors",
        active
          ? "border-ink bg-ink text-paper"
          : "border-transparent bg-transparent text-muted",
      )}
    >
      {color && (
        <span className="inline-block w-2 h-2" style={{ background: color }} />
      )}
      {label}
    </button>
  );
}

type SeriesData = RouterOutputs["insights"]["series"];

function AllVendorsCharts({ data }: { data: SeriesData | undefined }) {
  const bars = useChartCurrency();
  const donut = useChartCurrency();
  if (!data) {
    return (
      <p className="font-mono text-[13px] text-muted mt-5">
        Reading the fine print…
      </p>
    );
  }
  const vendorById = new Map(data.vendors.map((v) => [v.id, v]));
  const donutShare = data.byCurrency[donut.currency].share;
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
          <div className="flex flex-wrap items-center gap-4 md:flex-nowrap">
            <DonutFx
              slices={slices}
              centerLabel={donut.currency === "USD" ? "US$" : "AR$"}
              centerSub="total"
            />
            <div className="flex flex-col gap-2 flex-1">
              {slices.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <span
                    className="inline-block w-2.5 h-2.5"
                    style={{ background: s.color }}
                  />
                  <span className="font-mono text-xs flex-1">{s.label}</span>
                  <span className="font-mono text-xs font-medium">
                    {Math.round((s.value / shareTotal) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
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

type VendorDetail = NonNullable<RouterOutputs["insights"]["vendorDetail"]>;
type CustomFieldSeries = VendorDetail["fields"][number];

function SingleVendorCharts({
  propertyId,
  vendorId,
  range,
}: {
  propertyId?: string;
  vendorId: string;
  range: Range;
}) {
  const detail = trpc.insights.vendorDetail.useQuery({
    propertyId,
    vendorId,
    range,
  });
  const spend = useChartCurrency();
  const d = detail.data;

  if (!d) {
    return (
      <p className="font-mono text-[13px] text-muted mt-5">
        Reading the fine print…
      </p>
    );
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

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
    <div style={{ maxWidth: "64rem", margin: "0 auto", padding: "32px 20px 80px" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 14,
        }}
      >
        <div>
          <Eyebrow>Insights</Eyebrow>
          <Display size={34} style={{ display: "block", marginTop: 6 }}>
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
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginTop: 18,
          borderBottom: "1px solid var(--line)",
          paddingBottom: 12,
        }}
      >
        <VendorTab label="All vendors" active={vendorId === "all"} onClick={() => setVendorId("all")} />
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
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        padding: "5px 11px",
        cursor: "pointer",
        border: "1px solid " + (active ? "var(--ink)" : "transparent"),
        background: active ? "var(--ink)" : "transparent",
        color: active ? "var(--paper)" : "var(--muted)",
        transition: "var(--transition-colors)",
      }}
    >
      {color && <span style={{ width: 8, height: 8, background: color, display: "inline-block" }} />}
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
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--muted)", marginTop: 20 }}>
        Reading the fine print…
      </p>
    );
  }
  const vendorById = new Map(data.vendors.map((v) => [v.id, v]));
  const donutShare = data.byCurrency[donut.currency].share;
  const shareTotal = donutShare.reduce((a, s) => a + s.value, 0) || 1;
  const slices = donutShare.map((s) => {
    const v = vendorById.get(s.vendorId);
    return { id: s.vendorId, label: v?.displayName ?? "—", value: s.value, color: v?.color ?? "var(--muted)" };
  });

  return (
    <>
      <ChartCard title="Total spend over time" caption="Stacked by vendor" action={bars.toggle} style={{ marginTop: 16 }}>
        <StackedBarsFx
          months={data.months}
          stacks={data.byCurrency[bars.currency].series.map((s) => s.byVendor)}
          vendors={data.vendors}
          currency={bars.currency}
          completeFlags={data.completeFlags}
          height={230}
        />
        <Legend items={data.vendors.map((v) => ({ id: v.id, label: v.displayName, color: v.color }))} style={{ marginTop: 12 }} />
      </ChartCard>

      <div className="fx-stack-sm" style={{ marginTop: 16, display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(360px, 1.5fr)", gap: 16, alignItems: "start" }}>
        <ChartCard title="Vendor share" caption="Where it goes, in range" action={donut.toggle}>
          <div className="fx-wrap-sm" style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <DonutFx slices={slices} centerLabel={donut.currency === "USD" ? "US$" : "AR$"} centerSub="total" />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              {slices.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, background: s.color, display: "inline-block" }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, flex: 1 }}>{s.label}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500 }}>
                    {Math.round((s.value / shareTotal) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Inflation lens" caption="Same spend, rebased to 100 — pesos vs the dollar cost">
          <LineChartFx
            months={data.months}
            currency="IDX"
            series={[
              { label: "What you pay (ARS)", color: "var(--accent)", values: data.inflation.arsIdx },
              { label: "Real cost (USD)", color: USD_LINE, values: data.inflation.usdIdx, dashed: true },
            ]}
            height={200}
          />
          <Legend
            style={{ marginTop: 12 }}
            items={[
              { label: "What you pay (ARS)", color: "var(--accent)" },
              { label: "Real cost (USD blue)", color: USD_LINE },
            ]}
          />
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--muted)", margin: "12px 0 0", lineHeight: 1.6 }}>
            Pesos climb with inflation; in dollars your real cost is far flatter.
            The gap is the peso losing value — not you using more.
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
  const detail = trpc.insights.vendorDetail.useQuery({ propertyId, vendorId, range });
  const spend = useChartCurrency();
  const d = detail.data;

  if (!d) {
    return (
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--muted)", marginTop: 20 }}>
        Reading the fine print…
      </p>
    );
  }

  const vendor = d.vendor;
  const spendValues = d.spend[spend.currency];
  const knownSpend = spendValues.filter((x): x is number => x != null);
  const pct =
    knownSpend.length > 1
      ? ((knownSpend[knownSpend.length - 1] - knownSpend[0]) / knownSpend[0]) * 100
      : null;

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 18 }}>
        <Display size={28}>{formatMoney(knownSpend[knownSpend.length - 1] ?? null, spend.currency)}</Display>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>
          latest · <Delta pct={pct} /> over range
        </span>
      </div>

      <ChartCard title={`${vendor.displayName} — spend over time`} action={spend.toggle} style={{ marginTop: 14 }}>
        <LineChartFx
          months={d.months}
          currency={spend.currency}
          series={[{ label: vendor.displayName, color: vendor.color, values: spendValues }]}
          height={210}
        />
      </ChartCard>

      {/* One section per parser-extracted custom field — fully vendor-agnostic. */}
      {d.fields.map((f) => (
        <CustomFieldCharts key={f.name} field={f} months={d.months} color={vendor.color} />
      ))}

      {d.fields.length === 0 && (
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)", margin: "16px 2px 0", lineHeight: 1.6 }}>
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
      className="fx-stack-sm"
      style={{
        marginTop: 16,
        display: "grid",
        gridTemplateColumns: isQuantity && field.unitPrice ? "1fr 1fr" : "1fr",
        gap: 16,
        alignItems: "start",
      }}
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
        <ChartCard title={`Price per ${field.unit || "unit"}`} caption="Rebased to 100 — ARS vs USD">
          <LineChartFx
            months={months}
            currency="IDX"
            series={[
              { label: `ARS / ${field.unit || "unit"}`, color: "var(--accent)", values: field.unitPrice.arsIdx },
              { label: `USD / ${field.unit || "unit"}`, color: USD_LINE, values: field.unitPrice.usdIdx, dashed: true },
            ]}
            height={190}
          />
          <Legend
            style={{ marginTop: 10 }}
            items={[
              { label: `ARS / ${field.unit || "unit"}`, color: "var(--accent)" },
              { label: `USD / ${field.unit || "unit"}`, color: USD_LINE },
            ]}
          />
        </ChartCard>
      )}
    </div>
  );
}

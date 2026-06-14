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
  SeasonBarsFx,
  StackedBarsFx,
} from "@/components/charts";
import { formatMoney } from "@/lib/format";
import { type RouterOutputs, trpc } from "@/lib/trpc";

type Range = 12 | 24;

const USD_LINE = "#4a4034";

export default function InsightsPage() {
  const { propertyId, currency } = useApp();
  const [vendorId, setVendorId] = useState<string>("all");
  const [range, setRange] = useState<Range>(12);

  const series = trpc.insights.series.useQuery({ propertyId, currency, range });

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
        <AllVendorsCharts data={series.data} currency={currency} />
      ) : (
        <SingleVendorCharts
          propertyId={propertyId}
          vendorId={vendorId}
          currency={currency}
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

function AllVendorsCharts({
  data,
  currency,
}: {
  data: SeriesData | undefined;
  currency: "ARS" | "USD";
}) {
  if (!data) {
    return (
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--muted)", marginTop: 20 }}>
        Reading the fine print…
      </p>
    );
  }
  const vendorById = new Map(data.vendors.map((v) => [v.id, v]));
  const shareTotal = data.share.reduce((a, s) => a + s.value, 0) || 1;
  const slices = data.share.map((s) => {
    const v = vendorById.get(s.vendorId);
    return { label: v?.displayName ?? "—", value: s.value, color: v?.color ?? "var(--muted)" };
  });

  return (
    <>
      <ChartCard title="Total spend over time" caption={`Stacked by vendor · ${currency}`} style={{ marginTop: 16 }}>
        <StackedBarsFx
          months={data.months}
          stacks={data.series.map((s) => s.byVendor)}
          vendors={data.vendors}
          currency={currency}
          completeFlags={data.completeFlags}
          height={230}
        />
        <Legend items={data.vendors.map((v) => ({ label: v.displayName, color: v.color }))} style={{ marginTop: 12 }} />
      </ChartCard>

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(360px, 1.5fr)", gap: 16, alignItems: "start" }}>
        <ChartCard title="Vendor share" caption="Where it goes, in range">
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <DonutFx slices={slices} centerLabel={currency === "USD" ? "US$" : "AR$"} centerSub="total" />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              {slices.map((s) => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
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

function SingleVendorCharts({
  propertyId,
  vendorId,
  currency,
  range,
}: {
  propertyId?: string;
  vendorId: string;
  currency: "ARS" | "USD";
  range: Range;
}) {
  const [metric, setMetric] = useState<"cost" | "consumption">("cost");
  const detail = trpc.insights.vendorDetail.useQuery({ propertyId, vendorId, currency, range });
  const d = detail.data;

  if (!d) {
    return (
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--muted)", marginTop: 20 }}>
        Reading the fine print…
      </p>
    );
  }

  const vendor = d.vendor;
  const hasUnit = Boolean(vendor.unit);
  const knownSpend = d.spend.filter((x): x is number => x != null);
  const pct =
    knownSpend.length > 1
      ? ((knownSpend[knownSpend.length - 1] - knownSpend[0]) / knownSpend[0]) * 100
      : null;
  const knownC = d.consumption.filter((x): x is number => x != null);
  const pctC =
    knownC.length > 1 ? ((knownC[knownC.length - 1] - knownC[0]) / knownC[0]) * 100 : null;
  const showConsumption = hasUnit && metric === "consumption";

  const seasonColor = (month: string) => {
    const mm = Number(month.split("-")[1]);
    if (vendor.category === "gas" && [6, 7, 8].includes(mm)) return "var(--accent)";
    if (vendor.category === "electricity" && [12, 1, 2].includes(mm)) return "var(--accent)";
    return vendor.color;
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 18 }}>
        <Display size={28}>
          {showConsumption
            ? `${knownC[knownC.length - 1] ?? "—"} ${vendor.unit}`
            : formatMoney(knownSpend[knownSpend.length - 1] ?? null, currency)}
        </Display>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>
          latest · <Delta pct={showConsumption ? pctC : pct} /> over range
        </span>
      </div>

      <ChartCard
        title={`${vendor.displayName} — ${showConsumption ? "consumption" : "spend"} over time`}
        caption={showConsumption ? (vendor.unit ?? "") : currency}
        style={{ marginTop: 14 }}
        action={
          hasUnit ? (
            <Segmented
              options={[
                { value: "cost", label: "Cost" },
                { value: "consumption", label: "Use" },
              ]}
              value={metric}
              onChange={setMetric}
            />
          ) : null
        }
      >
        <LineChartFx
          months={d.months}
          currency={showConsumption ? "UNIT" : currency}
          series={[
            {
              label: vendor.displayName,
              color: vendor.color,
              values: showConsumption ? d.consumption : d.spend,
            },
          ]}
          height={210}
        />
      </ChartCard>

      {hasUnit && (
        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: showConsumption ? "1fr" : "1fr 1fr",
            gap: 16,
            alignItems: "start",
          }}
        >
          {!showConsumption && (
            <ChartCard
              title={`Consumption · ${vendor.unit}`}
              caption={vendor.category === "gas" ? "Winter heating spikes (orange)" : "Summer A/C spikes (orange)"}
            >
              <SeasonBarsFx
                months={d.months}
                values={d.consumption}
                color={vendor.color}
                colorFor={seasonColor}
                unit={vendor.unit}
                height={190}
              />
            </ChartCard>
          )}
          <ChartCard title={`Price per ${vendor.unit}`} caption="Rebased to 100 — ARS vs USD">
            <LineChartFx
              months={d.months}
              currency="IDX"
              series={[
                { label: `ARS / ${vendor.unit}`, color: "var(--accent)", values: d.unitPrice.arsIdx },
                { label: `USD / ${vendor.unit}`, color: USD_LINE, values: d.unitPrice.usdIdx, dashed: true },
              ]}
              height={190}
            />
            <Legend
              style={{ marginTop: 10 }}
              items={[
                { label: `ARS / ${vendor.unit}`, color: "var(--accent)" },
                { label: `USD / ${vendor.unit}`, color: USD_LINE },
              ]}
            />
          </ChartCard>
        </div>
      )}

      {!hasUnit && (
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)", margin: "16px 2px 0", lineHeight: 1.6 }}>
          {vendor.category === "expensas"
            ? "Expensas have no metered consumption; spikes are usually extraordinarias (special assessments) — open a bill to see the breakdown."
            : "A flat monthly plan — the climb is inflation, not usage."}
        </p>
      )}
    </>
  );
}

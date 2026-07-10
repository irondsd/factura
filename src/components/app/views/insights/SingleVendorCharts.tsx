"use client";

import {
  ChartCard,
  Delta,
  Display,
  Legend,
  LineChartFx,
  useChartCurrency,
} from "@/components/charts";
import { FinePrint } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { downloadTextFile, slugForFilename, toCsv } from "@/lib/csv";
import { formatMoney } from "@/lib/format";
import { type CustomFieldSeries, USD_LINE, type VendorDetail } from "./shared";

/** Flatten a vendor's monthly series into one CSV — a row per month, with spend
 * (ARS + USD) and every parser-extracted field. Money fields also get a USD
 * column; null cells stay empty (an honest gap, not a zero). */
function buildVendorCsv(d: VendorDetail): string {
  const header = ["month", "spend", "spend (USD)"];
  for (const f of d.fields) {
    header.push(f.unit ? `${f.name} (${f.unit})` : f.name);
    if (f.isMoney) header.push(`${f.name} (USD)`);
  }
  const rows = d.months.map((m, i) => {
    const row: (string | number | null)[] = [m, d.spend.ARS[i], d.spend.USD[i]];
    for (const f of d.fields) {
      row.push(f.values[i]);
      if (f.isMoney) row.push(f.valuesUsd?.[i] ?? null);
    }
    return row;
  });
  return toCsv(header, rows);
}

export function SingleVendorCharts({
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

  const exportCsv = () => {
    const range = d.months.length
      ? `${d.months[0]}_${d.months[d.months.length - 1]}`
      : "range";
    downloadTextFile(
      `${slugForFilename(vendor.displayName)}_${range}.csv`,
      buildVendorCsv(d),
    );
  };

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-[14px] mt-[18px]">
        <div className="flex items-baseline gap-[14px]">
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
        <button
          type="button"
          onClick={exportCsv}
          className="font-mono text-micro uppercase tracking-[0.14em] py-[5px] px-[11px] border border-line bg-transparent text-muted cursor-pointer transition-colors hover:bg-ink hover:text-paper"
        >
          {ti.exportCsv}
        </button>
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
              {
                label: `USD / ${field.unit || t.insights.unit}`,
                color: USD_LINE,
              },
            ]}
          />
        </ChartCard>
      )}
    </div>
  );
}

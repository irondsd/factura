"use client";

import { useMemo, useState } from "react";
import { Display, Eyebrow, RangeControl } from "@/components/charts";
import { FilterPill } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { defaultWindow, type InsightsWindow, monthRange } from "@/lib/insights";
import { AllVendorsCharts } from "./insights/AllVendorsCharts";
import type { InsightsSource } from "./insights/shared";
import { SingleVendorCharts } from "./insights/SingleVendorCharts";

export type { InsightsSource } from "./insights/shared";

export function InsightsView({
  source,
  propertyId,
}: {
  source: InsightsSource;
  propertyId?: string;
}) {
  const { t } = useI18n();
  const [vendorId, setVendorId] = useState<string>("all");
  const [win, setWin] = useState<InsightsWindow>(defaultWindow);

  const series = source.useSeries(propertyId, win);
  const detail = source.useVendorDetail(propertyId, vendorId, win);

  const vendorsHere = series?.vendors ?? [];

  // The selectable span: earliest bill → now, widened to always contain the
  // current window (so presets that reach past the first bill still fit).
  const span = useMemo(() => {
    const lo =
      series?.bounds.earliest && series.bounds.earliest < win.from
        ? series.bounds.earliest
        : win.from;
    const hi = series?.bounds.latest ?? win.to;
    return monthRange(lo, hi < win.to ? win.to : hi);
  }, [series?.bounds.earliest, series?.bounds.latest, win.from, win.to]);

  return (
    <div className="mx-auto max-w-[64rem] px-5 pt-8 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-[14px]">
        <div>
          <Eyebrow>{t.nav.insights}</Eyebrow>
          <Display size={34} className="block mt-1.5">
            {t.insights.title}
          </Display>
        </div>
        <RangeControl span={span} value={win} onChange={setWin} />
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

"use client";

import { Badge, RowBox, microLabel } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { formatARS, formatMonth } from "@/lib/format";
import type { TierMatch } from "@/lib/probar";
import type { TypedValue } from "@/parsers/engine/types";

/** Render one extracted custom value with its unit, if the parser declared one. */
function formatCustom(value: TypedValue, unit: string | null): string {
  if (typeof value === "object")
    return `${value.value.toLocaleString()} ${value.unit}`;
  if (typeof value === "number")
    return unit ? `${value.toLocaleString()} ${unit}` : value.toLocaleString();
  return value;
}

/** Everything the matching parser pulled out of this bill: the four semantic
 * roles first, then whatever custom fields that parser defines — consumption,
 * surcharges, data usage. Showing all of it is the demo: the visitor checks it
 * against their own bill and decides for themselves whether we got it right. */
export function ExtractedFields({ match }: { match: TierMatch }) {
  const { t, locale } = useI18n();
  const p = t.probar;
  const result = match.result;
  if (!result) return null;

  const rows: [string, string][] = [
    [p.fieldAmount, formatARS(result.amount)],
    [p.fieldPeriod, formatMonth(result.period, locale)],
    [p.fieldDueDate, result.dueDate],
    [p.fieldAccount, result.identity],
  ];

  for (const def of match.customDefs) {
    const value = result.custom[def.name];
    if (value === undefined) continue;
    rows.push([def.name, formatCustom(value, def.unit)]);
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={microLabel}>{p.vendorLabel}</span>
        <span className="font-display text-lg leading-none">
          {match.displayName}
        </span>
        <Badge tone={match.tier === "official" ? "accent" : "neutral"}>
          {match.tier}
        </Badge>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={microLabel}>{p.fieldsTitle}</span>
        <RowBox rows={rows} />
      </div>
      <span className={microLabel}>
        {p.parserLabel}: {match.slug}
      </span>
    </div>
  );
}

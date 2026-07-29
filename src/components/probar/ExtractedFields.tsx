"use client";

import { Badge, microLabel } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { formatARS, formatDate, formatMonth } from "@/lib/format";
import type { Tier, TierMatch } from "@/lib/probar";
import type { TypedValue } from "@/parsers/engine/types";

/** Render one extracted custom value with its unit, if the parser declared one. */
function formatCustom(value: TypedValue, unit: string | null): string {
  if (typeof value === "object")
    return `${value.value.toLocaleString()} ${value.unit}`;
  if (typeof value === "number")
    return unit ? `${value.toLocaleString()} ${unit}` : value.toLocaleString();
  return value;
}

/** Everything the matching parser pulled out of this bill: the vendor it
 * recognized, the four semantic roles, then whatever custom fields that parser
 * defines — consumption, surcharges, data usage.
 *
 * Showing all of it IS the demo: the visitor holds their own bill next to it and
 * decides for themselves whether we got it right. Which is also why the amount
 * is set larger than the rest — it's the field they check first, and the one a
 * wrong answer gets caught on. */
export function ExtractedFields({ match }: { match: TierMatch }) {
  const { t, locale } = useI18n();
  const p = t.probar;
  const result = match.result;
  if (!result) return null;

  const tierAdjective: Record<Tier, string> = {
    official: p.tierAdjOfficial,
    verified: p.tierAdjVerified,
    community: p.tierAdjCommunity,
  };

  const rows: [string, string][] = [
    [p.fieldAmount, formatARS(result.amount)],
    [p.fieldPeriod, formatMonth(result.period, locale)],
    [p.fieldDueDate, formatDate(result.dueDate, locale)],
    [p.fieldAccount, result.identity],
  ];

  for (const def of match.customDefs) {
    const value = result.custom[def.name];
    if (value === undefined) continue;
    rows.push([def.name, formatCustom(value, def.unit)]);
  }

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-display text-xl leading-none sm:text-2xl">
          {match.displayName}
        </span>
        <Badge>{p.recognized}</Badge>
        {/* Which parser answered, and how far we vouch for it. The tier is the
            page's one piece of registry vocabulary, so it's spelled out rather
            than left as a bare chip. */}
        <span className={cn(microLabel, "sm:ml-auto")}>
          {interpolate(p.parserLine, {
            tier: tierAdjective[match.tier],
            slug: match.slug,
          })}
        </span>
      </div>

      <div className="flex flex-col">
        {rows.map(([label, value], i) => (
          <div
            key={label}
            className={cn(
              "flex items-baseline justify-between gap-4 py-2.5",
              i > 0 && "border-t border-dotted border-line",
            )}
          >
            <span className={cn(microLabel, "shrink-0")}>{label}</span>
            <span
              className={cn(
                "min-w-0 text-right break-words",
                i === 0
                  ? "font-display text-lg leading-tight sm:text-2xl"
                  : "font-mono text-[13px] text-ink",
              )}
            >
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { Badge, microLabel } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { formatARS, formatDate, formatMonth } from "@/lib/format";
import type { CustomFieldDef, Tier, TierMatch } from "@/lib/probar";
import type { TypedValue } from "@/parsers/engine/types";

/** Parser authors name their own custom fields, so there is no fixed vocabulary
 * to translate — `consumption`, `Fixed Charge` and `cuotaExtra` are all names
 * someone typed into the builder. The names the official parsers use are worth
 * spelling out (a Spanish page shouldn't hand a visitor "LATESURCHARGE"), and
 * everything else falls back to the author's own name, split into words. */
function customLabel(name: string, known: Record<string, string>): string {
  const key = name.replace(/[\s_-]+/g, "").toLowerCase();
  return (
    known[key] ??
    name
      .replace(/[_-]+/g, " ")
      .replace(/([a-z\d])([A-Z])/g, "$1 $2")
      .trim()
  );
}

/** Render one extracted custom value the way its parser declared it: money as
 * pesos, a quantity with its unit, and both grouped in the page's language —
 * `toLocaleString()` with no argument would hand an es-AR reader 13,850. */
function formatCustom(
  value: TypedValue,
  def: CustomFieldDef,
  locale: Locale,
): string {
  if (typeof value === "object")
    return `${value.value.toLocaleString(locale)} ${value.unit}`.trim();
  if (typeof value === "number") {
    if (def.type === "money") return formatARS(value);
    const n = value.toLocaleString(locale);
    return def.unit ? `${n} ${def.unit}` : n;
  }
  return value;
}

/** One label/value line. Only the amount gets display type — it's the field the
 * visitor checks first, and the one a wrong answer gets caught on. */
function Row({
  label,
  value,
  first,
  big = false,
}: {
  label: string;
  value: string;
  first: boolean;
  big?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-2.5",
        !first && "border-t border-dotted border-line",
      )}
    >
      <span className={cn(microLabel, "shrink-0")}>{label}</span>
      <span
        className={cn(
          "min-w-0 text-right break-words",
          big
            ? "font-display text-lg leading-tight sm:text-2xl"
            : "font-mono text-[13px] text-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** Everything the matching parser pulled out of this bill: the vendor it
 * recognized, the four semantic roles, then whatever custom fields that parser
 * defines — consumption, surcharges, data usage.
 *
 * Showing all of it IS the demo: the visitor holds their own bill next to it and
 * decides for themselves whether we got it right. The custom fields sit under
 * their own heading rather than extending the list of roles, because "we also
 * read your kWh" is a different (and more surprising) claim than "we read the
 * amount" — and because a parser that defines none shouldn't leave a gap. */
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

  // Field names are parser data, not dictionary keys — the lookup is a courtesy
  // for the ones we ship, so it's indexed rather than typed key by key.
  const known = p.customFieldNames as Record<string, string>;
  const customRows: [string, string][] = [];
  for (const def of match.customDefs) {
    const value = result.custom[def.name];
    if (value === undefined) continue;
    customRows.push([
      customLabel(def.name, known),
      formatCustom(value, def, locale),
    ]);
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
          <Row
            key={label}
            label={label}
            value={value}
            first={i === 0}
            big={i === 0}
          />
        ))}
      </div>

      {customRows.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <span className={microLabel}>{p.customTitle}</span>
          <div className="flex flex-col">
            {customRows.map(([label, value], i) => (
              <Row key={label} label={label} value={value} first={i === 0} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

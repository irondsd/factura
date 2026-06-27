"use client";

import { Input, Select, microLabel } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import type { ValueRec } from "@/parsers/builder/evaluate";
import type { CustomDef } from "@/parsers/builder/model";
import { CardShell, ValueChip, ValueOption, ValuePicker, XBtn } from "./shared";

// An extra tracked field (charted later) — a source value plus a type and,
// for quantities, a unit and optional include-when guard.
export function CustomCard({
  field,
  options,
  recOf,
  onChange,
  onRemove,
  onPreview,
  focusKey,
}: {
  field: CustomDef;
  options: ValueOption[];
  recOf: (name: string) => ValueRec | undefined;
  onChange: (f: CustomDef) => void;
  onRemove: () => void;
  onPreview: (name: string | null) => void;
  focusKey: string | null;
}) {
  const { t } = useI18n();
  const tcf = t.builder.custom;
  const rec = field.source ? recOf(field.source) : undefined;
  return (
    <CardShell focused={!!focusKey && field.source === focusKey}>
      <div className="flex items-center gap-2 mb-2.5">
        <Input
          value={field.name}
          placeholder={tcf.fieldName}
          className="text-xs font-semibold flex-1"
          onChange={(e) => onChange({ ...field, name: e.target.value })}
        />
        <ValueChip value={rec?.value} error={rec?.error} />
        <XBtn onClick={onRemove} title={tcf.removeField} />
      </div>
      <div className="flex flex-col gap-2.5">
        <div>
          <span className={microLabel}>{tcf.sourceValue}</span>
          <div className="mt-1">
            <ValuePicker
              value={field.source}
              options={options}
              onPreview={onPreview}
              onChange={(v) => onChange({ ...field, source: v })}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-3.5 items-end">
          <label className="flex flex-col gap-1.5 w-[120px]">
            <span className={microLabel}>{tcf.type}</span>
            <Select
              value={field.type}
              onChange={(e) =>
                onChange({
                  ...field,
                  type: e.target.value as CustomDef["type"],
                })
              }
            >
              {(["money", "number", "date", "string", "quantity"] as const).map(
                (ty) => (
                  <option key={ty} value={ty}>
                    {tcf.types[ty]}
                  </option>
                ),
              )}
            </Select>
          </label>
          {field.type === "quantity" && (
            <label className="flex flex-col gap-1.5 w-[100px]">
              <span className={microLabel}>{tcf.unit}</span>
              <Input
                value={field.unit}
                placeholder="kWh, m³…"
                onChange={(e) => onChange({ ...field, unit: e.target.value })}
              />
            </label>
          )}
          <label className="flex flex-col gap-1.5 flex-1 min-w-[160px]">
            <span className={microLabel}>{tcf.onlyWhen}</span>
            <Input
              value={field.includeWhen}
              placeholder="e.g. barcode.surcharge > 0"
              className="text-xs"
              onChange={(e) =>
                onChange({ ...field, includeWhen: e.target.value })
              }
            />
          </label>
        </div>
      </div>
    </CardShell>
  );
}

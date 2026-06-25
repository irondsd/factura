"use client";

import { Input, Select, microLabel } from "@/components/ui";
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
  const rec = field.source ? recOf(field.source) : undefined;
  return (
    <CardShell focused={!!focusKey && field.source === focusKey}>
      <div className="flex items-center gap-2 mb-2.5">
        <Input
          value={field.name}
          placeholder="field name (e.g. consumption)"
          className="text-xs font-semibold flex-1"
          onChange={(e) => onChange({ ...field, name: e.target.value })}
        />
        <ValueChip value={rec?.value} error={rec?.error} />
        <XBtn onClick={onRemove} title="remove field" />
      </div>
      <div className="flex flex-col gap-2.5">
        <div>
          <span className={microLabel}>Source value</span>
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
            <span className={microLabel}>Type</span>
            <Select
              value={field.type}
              onChange={(e) =>
                onChange({
                  ...field,
                  type: e.target.value as CustomDef["type"],
                })
              }
            >
              {["money", "number", "date", "string", "quantity"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </label>
          {field.type === "quantity" && (
            <label className="flex flex-col gap-1.5 w-[100px]">
              <span className={microLabel}>Unit</span>
              <Input
                value={field.unit}
                placeholder="kWh, m³…"
                onChange={(e) => onChange({ ...field, unit: e.target.value })}
              />
            </label>
          )}
          <label className="flex flex-col gap-1.5 flex-1 min-w-[160px]">
            <span className={microLabel}>Only when (optional)</span>
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

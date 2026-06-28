"use client";

import { Input, Select, hint, microLabel } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import type { ValueRec } from "@/parsers/builder/evaluate";
import type { BuilderDerive, DeriveKind } from "@/parsers/builder/model";
import { cn } from "@/lib/cn";
import {
  CardShell,
  FallbackChain,
  ValueChip,
  ValueOption,
  ValuePicker,
  XBtn,
  arrowBtn,
} from "./shared";

const DERIVE_KIND_VALUES: DeriveKind[] = [
  "fallback",
  "math",
  "dateParts",
  "datePart",
  "constWhen",
];

function MathField({
  expr,
  options,
  rec,
  onChange,
}: {
  expr: string;
  options: ValueOption[];
  rec?: ValueRec;
  onChange: (e: string) => void;
}) {
  const { t } = useI18n();
  const td = t.builder.derive;
  const names = options.map((o) => o.name);
  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 border bg-paper py-1.5 px-2.5",
          rec?.error ? "border-accent" : "border-line",
        )}
      >
        <span className="font-mono text-[13px] text-accent">ƒ</span>
        <input
          value={expr}
          onChange={(e) => onChange(e.target.value)}
          list="pb-value-names"
          spellCheck={false}
          placeholder={td.mathPlaceholder}
          className="flex-1 border-none bg-transparent outline-none font-mono text-[13px] text-ink"
        />
      </div>
      <datalist id="pb-value-names">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {rec?.error ? (
        <p className={cn(hint, "text-accent mt-1.5")}>△ {rec.error}</p>
      ) : (
        <p className={cn(hint, "mt-1.5")}>
          {td.references}
          {names.length
            ? names.slice(0, 6).join(" · ") + (names.length > 6 ? " …" : "")
            : td.noValuesAbove}
        </p>
      )}
    </div>
  );
}

function DerivePicker({
  label,
  value,
  options,
  onPreview,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  options: ValueOption[];
  onPreview: (name: string | null) => void;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="min-w-[150px]">
      <span className={microLabel}>{label}</span>
      <div className="mt-1">
        <ValuePicker
          value={value}
          options={options}
          onPreview={onPreview}
          onChange={onChange}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}

export function DeriveCard({
  der,
  recOf,
  options,
  onChange,
  onRemove,
  onPreview,
  focusKey,
  moveUp,
  moveDown,
}: {
  der: BuilderDerive;
  recOf: (name: string) => ValueRec | undefined;
  options: ValueOption[];
  onChange: (d: BuilderDerive) => void;
  onRemove: () => void;
  onPreview: (name: string | null) => void;
  focusKey: string | null;
  moveUp: () => void;
  moveDown: () => void;
}) {
  const { t } = useI18n();
  const td = t.builder.derive;
  const rec = recOf(der.name);
  return (
    <CardShell
      derived
      focused={focusKey === der.name}
      onMouseEnter={() => onPreview(der.name)}
      onMouseLeave={() => onPreview(null)}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <span
          className="text-accent text-xs flex-none"
          title={td.computedValue}
        >
          ≈
        </span>
        <Input
          value={der.name}
          placeholder={td.valueName}
          className="text-xs font-semibold max-w-[170px]"
          onChange={(e) => onChange({ ...der, name: e.target.value })}
        />
        <Select
          value={der.kind}
          className="w-auto text-[11.5px] py-1.5 px-2"
          onChange={(e) =>
            onChange({ ...der, kind: e.target.value as DeriveKind })
          }
        >
          {DERIVE_KIND_VALUES.map((k) => (
            <option key={k} value={k}>
              {td.kinds[k]}
            </option>
          ))}
        </Select>
        <span className="ml-auto inline-flex items-center gap-1">
          <ValueChip value={rec?.value} error={rec?.error} />
          <button
            type="button"
            onClick={moveUp}
            title={td.moveUp}
            className={arrowBtn}
          >
            ▲
          </button>
          <button
            type="button"
            onClick={moveDown}
            title={td.moveDown}
            className={arrowBtn}
          >
            ▼
          </button>
          <XBtn onClick={onRemove} title={td.remove} />
        </span>
      </div>

      {der.kind === "fallback" && (
        <FallbackChain
          refs={der.sources ?? []}
          options={options}
          onPreview={onPreview}
          onChange={(sources) => onChange({ ...der, sources })}
        />
      )}
      {der.kind === "math" && (
        <MathField
          expr={der.expr ?? ""}
          options={options}
          rec={rec}
          onChange={(expr) => onChange({ ...der, expr })}
        />
      )}
      {der.kind === "dateParts" && (
        <div className="flex flex-wrap gap-3.5 items-end">
          <DerivePicker
            label={td.year}
            value={der.yearRef ?? ""}
            options={options}
            onPreview={onPreview}
            onChange={(v) => onChange({ ...der, yearRef: v })}
            placeholder={td.yearPlaceholder}
          />
          <DerivePicker
            label={td.month}
            value={der.monthRef ?? ""}
            options={options}
            onPreview={onPreview}
            onChange={(v) => onChange({ ...der, monthRef: v })}
            placeholder={td.monthPlaceholder}
          />
          <label className="flex flex-col gap-1.5 w-16">
            <span className={microLabel}>{td.day}</span>
            <Input
              value={String(der.day ?? 1)}
              className="text-center"
              onChange={(e) =>
                onChange({ ...der, day: Number(e.target.value) || 1 })
              }
            />
          </label>
          <label className="flex flex-col gap-1.5 w-[74px]">
            <span className={microLabel}>{td.plusMonths}</span>
            <Input
              type="number"
              value={String(der.shift ?? 0)}
              className="text-center"
              onChange={(e) =>
                onChange({
                  ...der,
                  shift: Math.trunc(Number(e.target.value) || 0),
                })
              }
            />
          </label>
        </div>
      )}
      {der.kind === "datePart" && (
        <div className="flex flex-wrap gap-3.5 items-end">
          <div className="min-w-[180px] flex-1">
            <DerivePicker
              label={td.dateValue}
              value={der.dateRef ?? ""}
              options={options}
              onPreview={onPreview}
              onChange={(v) => onChange({ ...der, dateRef: v })}
              placeholder={td.dateValuePlaceholder}
            />
          </div>
          <label className="flex flex-col gap-1.5 w-[110px]">
            <span className={microLabel}>{td.take}</span>
            <Select
              value={der.part ?? "year"}
              onChange={(e) =>
                onChange({
                  ...der,
                  part: e.target.value as "year" | "month" | "day",
                })
              }
            >
              <option value="year">{td.parts.year}</option>
              <option value="month">{td.parts.month}</option>
              <option value="day">{td.parts.day}</option>
            </Select>
          </label>
        </div>
      )}
      {der.kind === "constWhen" && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="font-mono text-xs text-muted">{td.use}</span>
          <Input
            value={String(der.constValue ?? "")}
            className="w-[70px]! text-center text-[13px]"
            onChange={(e) =>
              onChange({ ...der, constValue: Number(e.target.value) })
            }
          />
          <span className="font-mono text-xs text-muted">{td.when}</span>
          <ValuePicker
            value={der.whenRef ?? ""}
            options={options}
            variant="B"
            onPreview={onPreview}
            placeholder={td.valueExists}
            onChange={(v) => onChange({ ...der, whenRef: v })}
          />
          <span className="font-mono text-xs text-muted">{td.exists}</span>
        </div>
      )}
    </CardShell>
  );
}

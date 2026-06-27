"use client";

import { Button, Input, hint, microLabel } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import type { ValueRec } from "@/parsers/builder/evaluate";
import type { BuilderCapture } from "@/parsers/builder/model";
import { newOutput } from "@/parsers/builder/model";
import { cn } from "@/lib/cn";
import { CardShell, TransformsEditor, ValueChip, XBtn } from "./shared";

// One regex producing one or more named values; each output names a capture
// group and runs through its own transforms pipeline.
export function CaptureCard({
  cap,
  recOf,
  onChange,
  onRemove,
  onPreview,
}: {
  cap: BuilderCapture;
  recOf: (name: string) => ValueRec | undefined;
  onChange: (c: BuilderCapture) => void;
  onRemove?: () => void;
  onPreview: (name: string | null) => void;
}) {
  const { t } = useI18n();
  const tc = t.builder.capture;
  let invalid = false;
  if (cap.pattern.trim()) {
    try {
      new RegExp(cap.pattern, cap.flags || undefined);
    } catch {
      invalid = true;
    }
  }
  const multi = cap.outputs.length > 1;
  const setOut = (
    i: number,
    patch: Partial<BuilderCapture["outputs"][number]>,
  ) =>
    onChange({
      ...cap,
      outputs: cap.outputs.map((o, j) => (j === i ? { ...o, ...patch } : o)),
    });

  return (
    <CardShell>
      <div className="flex items-center gap-2 mb-2">
        <span className={cn(microLabel, "flex-none")}>{tc.regex}</span>
        <div className="flex-1 min-w-0 flex gap-1.5">
          <Input
            value={cap.pattern}
            placeholder={tc.regexPlaceholder}
            className={cn("text-xs", invalid && "border-accent")}
            onChange={(e) => onChange({ ...cap, pattern: e.target.value })}
          />
          <Input
            value={cap.flags}
            placeholder="i"
            className="w-11! flex-none text-center"
            onChange={(e) => onChange({ ...cap, flags: e.target.value })}
          />
        </div>
        {onRemove && <XBtn onClick={onRemove} title={tc.removeCapture} />}
      </div>
      {invalid && (
        <p className={cn(hint, "text-accent mb-2")}>{tc.invalidRegex}</p>
      )}
      {multi && (
        <p className={cn(hint, "mb-2")}>
          {interpolate(tc.multi, { n: cap.outputs.length })}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {cap.outputs.map((o, i) => {
          const rec = recOf(o.name);
          return (
            <div
              key={o.id}
              onMouseEnter={() => onPreview(o.name)}
              onMouseLeave={() => onPreview(null)}
              className={cn(
                "pt-2",
                i === 0 ? "pt-0" : "border-t border-dashed border-line",
              )}
            >
              <div className="flex items-center gap-2">
                <Input
                  value={o.name}
                  placeholder={tc.valueName}
                  className="text-xs font-medium"
                  onChange={(e) => setOut(i, { name: e.target.value })}
                />
                <span className="inline-flex items-center gap-1 flex-none">
                  <span className={microLabel}>{tc.grp}</span>
                  <Input
                    value={String(o.group)}
                    className="w-14! text-center text-xs"
                    onChange={(e) => setOut(i, { group: e.target.value })}
                  />
                </span>
                {multi && (
                  <XBtn
                    onClick={() =>
                      onChange({
                        ...cap,
                        outputs: cap.outputs.filter((_, j) => j !== i),
                      })
                    }
                    title={tc.removeOutput}
                  />
                )}
              </div>
              <div className="mt-1.5">
                <ValueChip value={rec?.value} error={rec?.error} />
              </div>
              <TransformsEditor
                transforms={o.transforms}
                onChange={(t) => setOut(i, { transforms: t })}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            onChange({ ...cap, outputs: [...cap.outputs, newOutput()] })
          }
        >
          {tc.addOutput}
        </Button>
      </div>
    </CardShell>
  );
}

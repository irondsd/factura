"use client";

import { type DragEvent, useRef, useState } from "react";
import { Button, Checkbox, microLabel, hint } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import {
  MAX_FILES_PER_DROP,
  SUBMISSION_FILE_GRACE_DAYS,
} from "@/lib/limits";

/** The drop target, the retention choice, and the sample-bill escape hatch.
 *
 * Modeled on the builder's local DropZone rather than the app's global
 * DropOverlay: this is one bounded region on a public page, not a
 * whole-window handler behind an auth gate. */
export function DropArea({
  onFiles,
  keepFile,
  onKeepFileChange,
  onSample,
  sampleBusy,
  busy,
}: {
  onFiles: (files: File[]) => void;
  keepFile: boolean;
  onKeepFileChange: (keep: boolean) => void;
  onSample: () => void;
  sampleBusy: boolean;
  busy: boolean;
}) {
  const { t } = useI18n();
  const p = t.probar;
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    onFiles([...e.dataTransfer.files]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex flex-col items-center justify-center gap-2 border border-dashed px-5 py-12 text-center transition-colors cursor-pointer",
          over ? "border-accent bg-card" : "border-line hover:border-accent",
          busy && "opacity-60",
        )}
      >
        <span className="font-display text-xl leading-none">{p.dropTitle}</span>
        <span className={microLabel}>
          {interpolate(p.dropSubtitle, { max: MAX_FILES_PER_DROP })}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            onFiles([...(e.target.files ?? [])]);
            // Let the same file be picked again after it's cleared.
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Checkbox
          checked={keepFile}
          onChange={(e) => onKeepFileChange(e.target.checked)}
          label={p.keepFile}
        />
        <span className={hint}>
          {interpolate(p.keepFileHelp, { days: SUBMISSION_FILE_GRACE_DAYS })}
        </span>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap">
        <span className={microLabel}>{p.sampleHint}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSample}
          disabled={sampleBusy || busy}
        >
          {sampleBusy ? p.sampleLoading : p.sampleButton}
        </Button>
      </div>
    </div>
  );
}

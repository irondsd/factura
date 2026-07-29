"use client";

import { useRef } from "react";
import { Button, Checkbox, microLabel, hint } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import {
  MAX_FILES_PER_DROP,
  SUBMISSION_FILE_GRACE_DAYS,
} from "@/lib/limits";

/** The click-to-browse target, the retention choice, and the sample-bill escape
 * hatch.
 *
 * Deliberately carries NO drag handlers of its own: the whole page is the drop
 * target (see useWindowFileDrop in ProbarClient), and a local `onDrop` here
 * would fire alongside the window one and add every file twice. This box is the
 * visual affordance and the click path; `dragging` only mirrors the page-wide
 * state so it highlights with everything else. */
export function DropArea({
  onFiles,
  keepFile,
  onKeepFileChange,
  onSample,
  sampleBusy,
  busy,
  dragging,
}: {
  onFiles: (files: File[]) => void;
  keepFile: boolean;
  onKeepFileChange: (keep: boolean) => void;
  onSample: () => void;
  sampleBusy: boolean;
  busy: boolean;
  dragging: boolean;
}) {
  const { t } = useI18n();
  const p = t.probar;
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 border border-dashed px-5 py-12 text-center transition-colors cursor-pointer",
          dragging
            ? "border-accent bg-card"
            : "border-line hover:border-accent",
          busy && "opacity-60",
        )}
      >
        <span className="font-display text-xl leading-none">{p.dropTitle}</span>
        <span className={microLabel}>
          {interpolate(p.dropSubtitle, { max: MAX_FILES_PER_DROP })}
        </span>
      </button>
      {/* Sibling, not a child of the button: a nested interactive element is
          invalid HTML and its click would bubble back into the opener. */}
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

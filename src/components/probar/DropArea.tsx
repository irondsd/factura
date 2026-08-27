"use client";

import { useRef } from "react";
import { Button, Checkbox, microLabel, hint } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useT } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { MAX_FILES_PER_DROP, SUBMISSION_FILE_GRACE_DAYS } from "@/lib/limits";

/** The click-to-browse target, the sample-bill escape hatch, and the retention
 * choice stated as two plain columns: what we keep either way (the text), and
 * what's yours to decide (the file).
 *
 * The two columns are the point. A lone checkbox next to "keep my file" invites
 * the question it doesn't answer — keep it for what? — so the text we always
 * retain is named beside it rather than left to the privacy page.
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
  const t = useT("probar");
  const p = t;
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-6">
      <div
        className={cn(
          "flex flex-col items-center gap-2.5 border-2 border-dashed bg-card/55 px-8 py-10 text-center transition-colors sm:py-14",
          dragging ? "border-accent bg-card" : "border-line",
          busy && "opacity-60",
        )}
      >
        {/* The heading is the button. Everything in this box up to the sample
            line opens the picker; the sample link below is a sibling, because a
            nested interactive element is invalid HTML and its click would
            bubble back into the opener. */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center gap-2.5 outline-none"
        >
          <span className="font-display text-2xl leading-none sm:text-[28px]">
            {p.dropTitle}
          </span>
          <span className={microLabel}>
            {interpolate(p.dropSubtitle, { max: MAX_FILES_PER_DROP })}
          </span>
        </button>
        <p className={cn(hint, "mt-2.5")}>
          {p.sampleHint}{" "}
          <Button
            type="button"
            variant="link"
            onClick={onSample}
            disabled={sampleBusy || busy}
          >
            {sampleBusy ? p.sampleLoading : p.sampleButton}
          </Button>
        </p>
      </div>
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

      <div className="grid gap-px border border-line bg-line sm:grid-cols-2">
        <div className="flex flex-col gap-2 bg-card px-5 py-4">
          <span className={microLabel}>{p.retentionTextTitle}</span>
          <p className="font-mono text-[13px] leading-[1.6] text-ink">
            {p.retentionTextBody}
          </p>
        </div>
        <div className="flex flex-col gap-2.5 bg-card px-5 py-4">
          <span className={microLabel}>{p.retentionFileTitle}</span>
          <Checkbox
            checked={keepFile}
            onChange={(e) => onKeepFileChange(e.target.checked)}
            label={p.keepFile}
          />
          <p className={hint}>
            {interpolate(p.keepFileHelp, { days: SUBMISSION_FILE_GRACE_DAYS })}
          </p>
        </div>
      </div>
    </div>
  );
}

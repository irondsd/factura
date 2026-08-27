"use client";

import { useRef } from "react";
import { Button, microLabel } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useT } from "@/i18n/I18nProvider";

/** The one-line answer to "what happened to my files?", above the cards.
 *
 * A drop of ten bills is ten cards long — taller than the viewport — so the
 * count has to be stated once at the top rather than left to be inferred by
 * scrolling. Only non-zero groups appear: "1 reconocida · 2 sin analizador"
 * reads as a result, while "1 reconocida · 0 leyendo · 2 sin analizador" reads
 * as a dashboard. */
export function ResultsHeader({
  total,
  parsed,
  reading,
  unparsed,
  errored,
  onFiles,
  busy,
}: {
  total: number;
  parsed: number;
  reading: number;
  unparsed: number;
  /** Files that never got as far as a result — too large, rate limited, upload
   * failed. Counted so a drop where everything errored still has a headline. */
  errored: number;
  onFiles: (files: File[]) => void;
  busy: boolean;
}) {
  const t = useT("probar");
  const p = t;
  const inputRef = useRef<HTMLInputElement>(null);

  const parts = [
    parsed > 0 && interpolate(p.resultsParsed, { count: parsed }),
    reading > 0 && interpolate(p.resultsReading, { count: reading }),
    unparsed > 0 && interpolate(p.resultsUnparsed, { count: unparsed }),
    errored > 0 && interpolate(p.resultsErrors, { count: errored }),
  ].filter((part): part is string => typeof part === "string");

  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-3.5">
      <div className="flex flex-col gap-1.5">
        <span className={microLabel}>
          {interpolate(p.resultsCount, { count: total })}
        </span>
        <p className="font-display text-xl leading-tight sm:text-2xl">
          {parts.join(" · ")}
        </p>
      </div>

      {/* A second way into the file picker, where someone who has just read
          their results is actually looking. The whole window stays a drop
          target, so this is the click path only. */}
      <Button
        variant="outline"
        size="lg"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {p.dropMore}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

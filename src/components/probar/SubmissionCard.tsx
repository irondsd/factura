"use client";

import { microLabel, hint } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import type { TierMatch } from "@/lib/probar";
import { ExtractedFields } from "./ExtractedFields";
import { FailureCard, type FailureKind } from "./FailureCard";
import { PdfThumb } from "./PdfThumb";
import { TierStepper, type TierState } from "./TierStepper";
import type { Tier } from "@/lib/probar";

/** Everything the page knows about one dropped file. */
export type Submission = {
  key: string;
  file: File;
  submissionId: string | null;
  /** Upload/extraction still in flight. */
  reading: boolean;
  /** Terminal client-side failure (not a PDF, too large, request failed). */
  error: string | null;
  pageCount: number;
  charCount: number;
  truncated: boolean;
  textPreview: string;
  tiers: Record<Tier, TierState>;
  match: TierMatch | null;
  failure: FailureKind | null;
};

/** One dropped bill, start to finish: the page preview, the cascade stepping
 * through the trust tiers, and then either the extracted data or the
 * we-couldn't-read-it card.
 *
 * `solo` is the single-file layout — a large preview beside a full field table.
 * With several files each card shrinks to a stacked thumbnail so they read as a
 * list rather than competing for the page. */
export function SubmissionCard({
  submission,
  solo,
  onNotify,
}: {
  submission: Submission;
  solo: boolean;
  onNotify: (
    submissionId: string,
    email: string,
    kind: FailureKind,
  ) => Promise<void>;
}) {
  const { t } = useI18n();
  const p = t.probar;
  const s = submission;

  const thumbHeight = solo ? 420 : 200;

  const preview = (
    <div className="flex flex-col gap-1.5">
      <PdfThumb file={s.file} text={s.textPreview} height={thumbHeight} />
      <span className={microLabel}>
        {s.file.name}
        {s.pageCount > 0
          ? ` · ${interpolate(p.pagesLabel, { count: s.pageCount })}`
          : ""}
      </span>
    </div>
  );

  const body = (
    <div className="flex flex-col gap-4 min-w-0">
      {s.error ? (
        <p className="font-mono text-xs text-accent">{s.error}</p>
      ) : s.reading ? (
        <p className={hint}>{p.stepReading}</p>
      ) : (
        <>
          {/* The stepper stays visible after a match — it's the explanation for
              which tier the answer came from. */}
          <TierStepper states={s.tiers} />
          {s.match?.result && (
            <>
              <span className={microLabel}>{p.recognized}</span>
              <ExtractedFields match={s.match} />
            </>
          )}
          {s.failure && s.submissionId && (
            <FailureCard
              kind={s.failure}
              vendorName={s.match?.displayName}
              text={s.textPreview}
              pages={s.pageCount}
              chars={s.charCount}
              truncated={s.truncated}
              onNotify={(email, kind) => onNotify(s.submissionId!, email, kind)}
            />
          )}
        </>
      )}
    </div>
  );

  return (
    <article
      className={cn(
        "fd-card border border-line bg-card p-4 sm:p-5",
        solo
          ? "grid gap-6 sm:grid-cols-[minmax(0,300px)_minmax(0,1fr)]"
          : "grid gap-4 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)]",
      )}
    >
      {preview}
      {body}
    </article>
  );
}

"use client";

import { useState } from "react";
import { Button, microLabel, hint } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { formatARS, formatMonth } from "@/lib/format";
import type { Tier, TierMatch } from "@/lib/probar";
import * as analytics from "./analytics";
import type { ResultOutcome } from "./analytics";
import { ExtractedFields } from "./ExtractedFields";
import { ExtractedTextDialog } from "./ExtractedTextDialog";
import { FailureCard, type FailureKind } from "./FailureCard";
import { PdfThumb } from "./PdfThumb";
import { ReportDialog } from "./ReportDialog";
import styles from "./SubmissionCard.module.css";
import { TierStepper, type TierState } from "./TierStepper";

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
  /** A correction has been sent for this bill. */
  reported: boolean;
};

/** How tall the page preview renders. Two sizes, because a lone bill gets the
 * room to actually be looked at while a drop of eight has to stay scannable. */
const THUMB_HEIGHT = { solo: 300, list: 200 } as const;

/** One dropped bill, start to finish: the page preview beside either the
 * extracted fields or the we-couldn't-read-it card, with the raw text and the
 * correction form one click away in a dialog.
 *
 * The footer is the honesty row, present on every card that produced text: what
 * we read (in full), how much of it there was, and — for a bill we claim to have
 * understood — a way to say we got it wrong. Both open dialogs rather than
 * expanding inline: a page of cards that each grow by a wall of monospace text
 * buries the results the visitor came for. */
export function SubmissionCard({
  submission,
  solo,
  onViewText,
  onReport,
  onSaveVendorGuess,
}: {
  submission: Submission;
  solo: boolean;
  onViewText: (s: Submission) => void;
  onReport: (
    submissionId: string,
    message: string,
    email: string,
  ) => Promise<void>;
  onSaveVendorGuess: (submissionId: string, vendor: string) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const p = t.probar;
  const s = submission;
  const [reporting, setReporting] = useState(false);

  // What the cascade decided, in the vocabulary the analytics use — so events
  // fired from the dialogs describe the card they came from.
  const outcome: ResultOutcome = s.error
    ? "error"
    : s.failure === "no_text"
      ? "no_text"
      : s.failure === "parse_failed"
        ? "parse_failed"
        : s.failure === "unrecognized"
          ? "unrecognized"
          : "parsed";

  // There is text to show whenever extraction produced any — including on a bill
  // no parser understood, where it IS the proof we opened the file.
  const hasText = s.textPreview.length > 0;
  // The cascade is still walking the tiers: uploaded, nothing decided yet.
  const cascading = !s.reading && !s.error && !s.match && !s.failure;
  // Flagged in accent: the states that ask something of the visitor, and the
  // ones we most want them to notice.
  const wanting = s.failure === "unrecognized" || s.failure === "no_text";

  const viewText = () => {
    analytics.textViewed(outcome);
    onViewText(s);
  };

  const preview = (
    <div className="flex flex-col gap-1.5">
      <PdfThumb
        file={s.file}
        text={s.textPreview}
        height={solo ? THUMB_HEIGHT.solo : THUMB_HEIGHT.list}
      />
      <span className={cn(microLabel, "leading-[1.5]")}>
        {/* break-all on the file name only: it can be one long unbroken string
            that would otherwise overflow the column, while the page count next
            to it must not be split into "1 PÁGINA (S)". */}
        <span className="break-all">{s.file.name}</span>
        {s.pageCount > 0 && (
          <span className="whitespace-nowrap">
            {` · ${interpolate(p.pagesLabel, { count: s.pageCount })}`}
          </span>
        )}
      </span>
    </div>
  );

  const body = (
    <div className="flex min-w-0 flex-col gap-4">
      {s.error ? (
        <p className="font-mono text-xs text-accent">{s.error}</p>
      ) : s.reading ? (
        <div className="flex flex-col gap-3">
          <p className="font-display text-xl leading-tight">{p.stepReading}</p>
          <p className={hint}>
            {interpolate(p.stepReadingBody, { file: s.file.name })}
          </p>
          <div className={styles.bar} aria-hidden="true">
            <i />
          </div>
        </div>
      ) : (
        <>
          {/* The cascade is shown only while it runs: three sequential requests
              with nothing to read is the one moment the tiers earn their space.
              Once settled, the parser line on the result says which one won. */}
          {cascading && <TierStepper states={s.tiers} />}
          {s.match?.result && <ExtractedFields match={s.match} />}
          {s.failure && s.submissionId && (
            <FailureCard
              kind={s.failure}
              submissionId={s.submissionId}
              vendorName={s.match?.displayName}
              onSaveVendorGuess={onSaveVendorGuess}
            />
          )}

          {hasText && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3.5">
              <Button type="button" variant="link" onClick={viewText}>
                {`› ${p.viewText}`}
              </Button>
              <span className={microLabel}>
                {/* Grouped in the page's language, not the browser's: an
                    es-AR reader expects 13.850, and `toLocaleString()` with no
                    argument would hand them 13,850 on an en-US machine. */}
                {interpolate(p.charsLabel, {
                  chars: s.charCount.toLocaleString(locale),
                })}
              </span>
              {/* Offered only on a bill we claim to have read. "You got this
                  wrong" is meaningless where we already said we read nothing. */}
              {s.match?.result && s.submissionId && (
                <span className={cn(hint, "sm:ml-auto")}>
                  {s.reported ? (
                    p.reportSaved
                  ) : (
                    <>
                      {p.reportPrompt}{" "}
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => setReporting(true)}
                      >
                        {p.reportCta}
                      </Button>
                    </>
                  )}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <article
      className={cn(
        "fd-card grid gap-4 p-4 sm:gap-6 sm:p-6",
        solo
          ? "grid-cols-[86px_minmax(0,1fr)] sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]"
          : "grid-cols-[86px_minmax(0,1fr)] sm:grid-cols-[minmax(0,140px)_minmax(0,1fr)]",
        wanting && "border-accent/55",
      )}
    >
      {preview}
      {body}

      {reporting && s.submissionId && s.match?.result && (
        <ReportDialog
          // Which bill, as WE read it — so the correction is written against the
          // values on screen rather than from memory.
          subtitle={[
            s.match.displayName,
            formatMonth(s.match.result.period, locale),
            formatARS(s.match.result.amount),
          ].join(" · ")}
          onSubmit={async (message, email) => {
            await onReport(s.submissionId!, message, email);
            analytics.reportSubmitted({
              outcome,
              tier: s.match?.tier,
              parserSlug: s.match?.slug,
              withEmail: email.length > 0,
            });
          }}
          onClose={() => setReporting(false)}
        />
      )}
    </article>
  );
}

/** The extracted-text dialog for one submission, rendered from the page rather
 * than from the card so that only one can ever be open. Lives here because the
 * Submission shape it reads is defined in this file. */
export function SubmissionTextDialog({
  submission,
  onClose,
}: {
  submission: Submission;
  onClose: () => void;
}) {
  return (
    <ExtractedTextDialog
      fileName={submission.file.name}
      text={submission.textPreview}
      pages={submission.pageCount}
      chars={submission.charCount}
      truncated={submission.truncated}
      onClose={onClose}
    />
  );
}

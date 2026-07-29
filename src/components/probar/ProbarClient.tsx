"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { MAX_FILES_PER_DROP, PUBLIC_MAX_BYTES } from "@/lib/limits";
import {
  type ParseResponse,
  type SubmitResponse,
  type Tier,
  TIERS,
} from "@/lib/probar";
import { useToasts } from "@/providers/ToastProvider";
import { useWindowFileDrop } from "@/components/useWindowFileDrop";
import * as analytics from "./analytics";
import type { DropSource } from "./analytics";
import { DropArea } from "./DropArea";
import type { FailureKind } from "./FailureCard";
import { PageDropOverlay } from "./PageDropOverlay";
import { SaveCta } from "./SaveCta";
import { SubmissionCard, type Submission } from "./SubmissionCard";
import type { TierState } from "./TierStepper";

/** How many files are uploaded/parsed at once. A full drop is up to 10 files ×
 * 4 requests; letting them all fly would spend the parse limiter's whole burst
 * in one go and make the stepper unreadable besides. */
const CONCURRENCY = 2;

const SAMPLE_URL = "/samples/edesur-ejemplo.pdf";

const pendingTiers = (): Record<Tier, TierState> => ({
  official: { status: "pending" },
  verified: { status: "pending" },
  community: { status: "pending" },
});

export function ProbarClient() {
  const { t, locale } = useI18n();
  const p = t.probar;
  const { showToast } = useToasts();

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [keepFile, setKeepFile] = useState(true);
  /** How many drops are in flight; >0 means busy. */
  const [running, setRunning] = useState(0);
  const [sampleBusy, setSampleBusy] = useState(false);
  const busy = running > 0;

  // Running tally for the exit summary. A ref, not state: it's written from
  // async work and read once, at teardown — rendering must never depend on it.
  const stats = useRef({
    startedAt: Date.now(),
    filesSubmitted: 0,
    parsed: 0,
    parseFailed: 0,
    unrecognized: 0,
    noText: 0,
    errors: 0,
    saveCtaShown: false,
    saveCtaClicked: false,
    notifyRequested: false,
  });
  const tally = useCallback(
    (
      field: "parsed" | "parseFailed" | "unrecognized" | "noText" | "errors",
    ) => {
      stats.current[field] += 1;
    },
    [],
  );

  // "Tried it and left" can't be a funnel step, because leaving isn't an event.
  // This is the only way to see it. Fires once, on the first hide — a visitor
  // who backgrounds the tab and returns shouldn't be counted twice.
  useEffect(() => {
    let sent = false;
    const onHide = () => {
      if (sent || document.visibilityState !== "hidden") return;
      const s = stats.current;
      // Landing and leaving without trying anything is already a $pageview;
      // reporting it again as a summary would just dilute the funnel.
      if (s.filesSubmitted === 0) return;
      sent = true;
      analytics.sessionSummary({
        filesSubmitted: s.filesSubmitted,
        parsed: s.parsed,
        parseFailed: s.parseFailed,
        unrecognized: s.unrecognized,
        noText: s.noText,
        errors: s.errors,
        saveCtaShown: s.saveCtaShown,
        saveCtaClicked: s.saveCtaClicked,
        notifyRequested: s.notifyRequested,
        secondsOnPage: Math.round((Date.now() - s.startedAt) / 1000),
      });
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  const patch = useCallback(
    (key: string, update: Partial<Submission>) => {
      setSubmissions((prev) =>
        prev.map((s) => (s.key === key ? { ...s, ...update } : s)),
      );
    },
    [],
  );

  const setTier = useCallback(
    (key: string, tier: Tier, state: TierState) => {
      setSubmissions((prev) =>
        prev.map((s) =>
          s.key === key ? { ...s, tiers: { ...s.tiers, [tier]: state } } : s,
        ),
      );
    },
    [],
  );

  /** Upload one file, then walk the tiers until one recognizes it. Each tier is
   * its own request so the stepper can show real progress rather than a spinner
   * standing in for three sequential steps. */
  const run = useCallback(
    async (submission: Submission, keep: boolean, source: DropSource) => {
      const { key, file } = submission;
      const startedAt = Date.now();
      const since = () => Date.now() - startedAt;

      const form = new FormData();
      form.append("file", file);
      form.append("keepFile", String(keep));
      form.append("locale", locale);

      let submitted: SubmitResponse;
      try {
        const res = await fetch("/api/probar/submit", {
          method: "POST",
          body: form,
        });
        const bail = (
          message: string,
          errorReason: "too_large" | "rate_limited" | "upload_failed",
        ) => {
          patch(key, { reading: false, error: message });
          tally("errors");
          analytics.fileResult({
            outcome: "error",
            source,
            tiersTried: 0,
            durationMs: since(),
            errorReason,
          });
        };
        if (res.status === 429) return bail(p.rateLimited, "rate_limited");
        if (res.status === 413)
          return bail(
            interpolate(p.tooLarge, {
              file: file.name,
              max: Math.round(PUBLIC_MAX_BYTES / (1024 * 1024)),
            }),
            "too_large",
          );
        if (!res.ok)
          return bail(
            interpolate(p.uploadFailed, { file: file.name }),
            "upload_failed",
          );
        submitted = (await res.json()) as SubmitResponse;
      } catch {
        patch(key, {
          reading: false,
          error: interpolate(p.uploadFailed, { file: file.name }),
        });
        tally("errors");
        analytics.fileResult({
          outcome: "error",
          source,
          tiersTried: 0,
          durationMs: since(),
          errorReason: "upload_failed",
        });
        return;
      }

      if (submitted.outcome === "no_text") {
        patch(key, {
          reading: false,
          submissionId: submitted.submissionId,
          pageCount: submitted.pageCount,
          failure: "no_text",
          // The cascade never runs on a bill with no text to run it against.
          tiers: {
            official: { status: "skipped" },
            verified: { status: "skipped" },
            community: { status: "skipped" },
          },
        });
        tally("noText");
        analytics.fileResult({
          outcome: "no_text",
          source,
          tiersTried: 0,
          pageCount: submitted.pageCount,
          durationMs: since(),
        });
        return;
      }

      patch(key, {
        reading: false,
        submissionId: submitted.submissionId,
        pageCount: submitted.pageCount,
        charCount: submitted.charCount,
        truncated: submitted.truncated,
        textPreview: submitted.textPreview,
      });

      for (const [i, tier] of TIERS.entries()) {
        setTier(key, tier, { status: "running" });
        let run: ParseResponse;
        try {
          const res = await fetch("/api/probar/parse", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              submissionId: submitted.submissionId,
              tier,
            }),
          });
          if (!res.ok) {
            // Distinguish the failures rather than blaming them all on the
            // limiter: a 404 means this browser no longer holds the ticket for
            // the submission (its cookie expired, or was cleared mid-drop), and
            // telling someone to "try again in a bit" would be a lie — only
            // re-uploading recovers it.
            const [message, errorReason] =
              res.status === 429
                ? ([p.rateLimited, "rate_limited"] as const)
                : res.status === 404
                  ? ([
                      interpolate(p.sessionLost, { file: file.name }),
                      "session_lost",
                    ] as const)
                  : ([
                      interpolate(p.uploadFailed, { file: file.name }),
                      "upload_failed",
                    ] as const);
            patch(key, { error: message });
            tally("errors");
            analytics.fileResult({
              outcome: "error",
              source,
              tiersTried: i,
              pageCount: submitted.pageCount,
              durationMs: since(),
              errorReason,
            });
            return;
          }
          run = (await res.json()) as ParseResponse;
        } catch {
          patch(key, { error: interpolate(p.uploadFailed, { file: file.name }) });
          tally("errors");
          analytics.fileResult({
            outcome: "error",
            source,
            tiersTried: i,
            durationMs: since(),
            errorReason: "upload_failed",
          });
          return;
        }

        if (run.matched && run.best) {
          setTier(key, tier, { status: "match" });
          patch(key, {
            match: run.best,
            // A parser recognized the bill but couldn't read every field — a
            // different (and more actionable) story than "unknown vendor".
            failure: run.best.ok ? null : "parse_failed",
          });
          // Everything below this tier never ran; say so rather than leaving
          // the remaining rows looking stuck.
          for (const rest of TIERS.slice(i + 1))
            setTier(key, rest, { status: "skipped" });

          tally(run.best.ok ? "parsed" : "parseFailed");
          analytics.fileResult({
            outcome: run.best.ok ? "parsed" : "parse_failed",
            source,
            tier: run.best.tier,
            parserSlug: run.best.slug,
            vendorSlug: run.best.vendorSlug,
            detectScore: run.best.score,
            tiersTried: i + 1,
            pageCount: submitted.pageCount,
            charCount: submitted.charCount,
            truncated: submitted.truncated,
            durationMs: since(),
          });
          return;
        }

        setTier(
          key,
          tier,
          run.ambiguous
            ? { status: "ambiguous" }
            : { status: "miss", evaluated: run.evaluated },
        );
      }

      patch(key, { failure: "unrecognized" });
      tally("unrecognized");
      // The most commercially interesting event on the page: a real bill we
      // can't read yet. `tiers_tried` = all of them.
      analytics.fileResult({
        outcome: "unrecognized",
        source,
        tiersTried: TIERS.length,
        pageCount: submitted.pageCount,
        charCount: submitted.charCount,
        truncated: submitted.truncated,
        durationMs: since(),
      });
    },
    [locale, p, patch, setTier, tally],
  );

  const addFiles = useCallback(
    async (files: File[], source: DropSource) => {
      const pdfs: File[] = [];
      let rejected = 0;
      for (const file of files) {
        const isPdf =
          file.type === "application/pdf" ||
          file.name.toLowerCase().endsWith(".pdf");
        if (!isPdf) {
          showToast(interpolate(p.notPdf, { file: file.name }));
          rejected += 1;
          continue;
        }
        pdfs.push(file);
      }
      if (rejected > 0)
        analytics.fileRejected({ reason: "not_pdf", count: rejected });
      if (pdfs.length === 0) return;

      const accepted = pdfs.slice(0, MAX_FILES_PER_DROP);
      if (pdfs.length > accepted.length) {
        showToast(interpolate(p.tooManyFiles, { max: MAX_FILES_PER_DROP }));
        analytics.fileRejected({
          reason: "over_drop_limit",
          count: pdfs.length - accepted.length,
        });
      }

      analytics.fileSelected({
        count: accepted.length,
        source,
        keepFile,
      });
      stats.current.filesSubmitted += accepted.length;

      const fresh: Submission[] = accepted.map((file) => ({
        key: crypto.randomUUID(),
        file,
        submissionId: null,
        reading: true,
        error: null,
        pageCount: 0,
        charCount: 0,
        truncated: false,
        textPreview: "",
        tiers: pendingTiers(),
        match: null,
        failure: null,
      }));
      // Append. Dropping a second bill must not hide the first — people compare
      // results across their bills, and a later drop silently replacing an
      // earlier one reads as the page losing their work.
      setSubmissions((prev) => [...prev, ...fresh]);
      // A counter, not a boolean: overlapping drops each finish independently,
      // and the first one to end must not un-busy the ones still running.
      setRunning((n) => n + 1);

      const queue = [...fresh];
      const workers = Array.from(
        { length: Math.min(CONCURRENCY, queue.length) },
        async () => {
          for (;;) {
            const next = queue.shift();
            if (!next) return;
            await run(next, keepFile, source);
          }
        },
      );
      await Promise.all(workers);
      setRunning((n) => n - 1);
    },
    [keepFile, p, run, showToast],
  );

  // The whole viewport is the drop target. A bordered box alone is a smaller
  // target than people expect from a page whose entire purpose is "drop a file
  // here" — and without window-level handlers the browser just opens the PDF.
  const onWindowFiles = useCallback(
    (files: FileList) => void addFiles([...files], "drop"),
    [addFiles],
  );
  const dragging = useWindowFileDrop({ onFiles: onWindowFiles });

  /** Fetch the committed sample and push it through the identical pipeline —
   * no `sample=1` branch on the server to keep honest. */
  const useSample = useCallback(async () => {
    setSampleBusy(true);
    try {
      const res = await fetch(SAMPLE_URL);
      const blob = await res.blob();
      await addFiles(
        [new File([blob], "edesur-ejemplo.pdf", { type: "application/pdf" })],
        "sample",
      );
    } catch {
      showToast(interpolate(p.uploadFailed, { file: "edesur-ejemplo.pdf" }));
    } finally {
      setSampleBusy(false);
    }
  }, [addFiles, p, showToast]);

  const notify = useCallback(
    async (submissionId: string, email: string, outcome: FailureKind) => {
      await fetch("/api/probar/notify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submissionId, email }),
      });
      stats.current.notifyRequested = true;
      analytics.notifyRequested(outcome);
    },
    [],
  );

  const onBrowse = useCallback(
    (files: File[]) => void addFiles(files, "browse"),
    [addFiles],
  );

  const onKeepFileChange = useCallback((keep: boolean) => {
    setKeepFile(keep);
    // Only a real change is reported, so the default-on state never looks like
    // a decision someone made.
    analytics.keepFileToggled(keep);
  }, []);

  const saved = submissions.filter((s) => s.match?.ok).length;

  // Reported once per visit, the first time the offer actually appears.
  useEffect(() => {
    if (saved > 0 && !stats.current.saveCtaShown) {
      stats.current.saveCtaShown = true;
      analytics.saveCtaShown(saved);
    }
  }, [saved]);

  const onSaveClick = useCallback((count: number) => {
    stats.current.saveCtaClicked = true;
    analytics.saveCtaClicked(count);
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <PageDropOverlay active={dragging} />
      <DropArea
        onFiles={onBrowse}
        keepFile={keepFile}
        onKeepFileChange={onKeepFileChange}
        onSample={useSample}
        sampleBusy={sampleBusy}
        busy={busy}
        dragging={dragging}
      />

      {submissions.length > 0 && (
        <div className="flex flex-col gap-4">
          {submissions.map((s) => (
            <SubmissionCard
              key={s.key}
              submission={s}
              solo={submissions.length === 1}
              onNotify={notify}
            />
          ))}
        </div>
      )}

      {saved > 0 && <SaveCta count={saved} onClick={onSaveClick} />}
    </div>
  );
}

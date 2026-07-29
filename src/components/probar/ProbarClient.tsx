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
import { NotifyCard } from "./NotifyCard";
import { PageDropOverlay } from "./PageDropOverlay";
import { ResultsHeader } from "./ResultsHeader";
import { SaveCta } from "./SaveCta";
import {
  SubmissionCard,
  SubmissionTextDialog,
  type Submission,
} from "./SubmissionCard";
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
  /** Which submission's extracted text is open in the dialog. Held here rather
   * than per card so two dialogs can never be open at once. */
  const [textFor, setTextFor] = useState<string | null>(null);
  /** The address the visitor left for unreadable bills, and which submissions it
   * has actually been saved against. Kept at page level because a bill dropped
   * AFTER the address was given still has to be covered by it. */
  const [notified, setNotified] = useState<{
    email: string;
    ids: Set<string>;
  } | null>(null);
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

  /** Mirror of `notified`, readable from the async pipeline without making every
   * callback below depend on the state that changes when an address is given. */
  const notifiedRef = useRef<{ email: string; ids: Set<string> } | null>(null);

  /** Save an address against submissions and remember which ones it now covers.
   * Throws on failure so the card can say so — an address silently dropped is a
   * promise silently broken. */
  const saveNotify = useCallback(
    async (submissionIds: string[], email: string) => {
      const res = await fetch("/api/probar/notify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submissionIds, email }),
      });
      if (!res.ok) throw new Error("notify failed");
      const merged = {
        email,
        ids: new Set([...(notifiedRef.current?.ids ?? []), ...submissionIds]),
      };
      notifiedRef.current = merged;
      setNotified(merged);
    },
    [],
  );

  /** Extend an address already on file to a bill that has just failed.
   *
   * Someone who left their address, then dropped two more bills we also can't
   * read, has already answered this question — asking again is the repetition the
   * single card exists to remove. Silent by design: no second confirmation, no
   * second funnel event, and the card's file list is what states the scope. */
  const cover = useCallback(
    (submissionId: string) => {
      const on = notifiedRef.current;
      if (!on) return;
      void saveNotify([submissionId], on.email).catch(() => {
        // The visitor already has their confirmation and the earlier bills are
        // still covered; `uncovered` reopens the form if this never lands.
      });
    },
    [saveNotify],
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
        cover(submitted.submissionId);
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
          // A recognized-but-unreadable bill is still one we owe an answer on.
          if (!run.best.ok) cover(submitted.submissionId);
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
      cover(submitted.submissionId);
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
    [cover, locale, p, patch, setTier, tally],
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
        reported: false,
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

  /** The visitor asking to be notified — one address, every unread bill, one
   * request. Reported to analytics, unlike `cover`, because this one is an act. */
  const notify = useCallback(
    async (submissionIds: string[], email: string) => {
      await saveNotify(submissionIds, email);
      stats.current.notifyRequested = true;
      analytics.notifyRequested("unrecognized");
    },
    [saveNotify],
  );

  /** "You read this wrong", against one bill. Throws so the dialog can keep the
   * text the visitor typed instead of closing on a write that didn't land. */
  const report = useCallback(
    async (submissionId: string, message: string, email: string) => {
      const res = await fetch("/api/probar/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submissionId, message, email }),
      });
      if (!res.ok) throw new Error("report failed");
      setSubmissions((prev) =>
        prev.map((s) =>
          s.submissionId === submissionId ? { ...s, reported: true } : s,
        ),
      );
    },
    [],
  );

  /** The vendor hint, saved as it's typed. Rejects on failure so the field can
   * retry on the next keystroke rather than treating the value as delivered. */
  const saveVendorGuess = useCallback(
    async (submissionId: string, vendor: string) => {
      const res = await fetch("/api/probar/hint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submissionId, vendor }),
      });
      if (!res.ok) throw new Error("hint failed");
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

  // The two closing offers are counted independently, because a drop can earn
  // both: bills we read are worth saving to an account, bills we couldn't are
  // worth an address. All-parsed shows only the save offer, all-failed only the
  // notify one, and a mixed drop gets both — withholding either because the
  // other applies would drop the more valuable half of a real visit.
  const savable = submissions.filter((s) => s.match?.ok);
  const unread = submissions.filter(
    (s) => s.failure !== null && s.submissionId !== null,
  );
  const saved = savable.length;
  // "Sin analizador" is only true of a bill nothing recognized; one a parser
  // claimed and then misread is a different failure and gets neutral wording.
  const allUnrecognized = unread.every((s) => s.failure !== "parse_failed");

  const reading = submissions.filter(
    (s) => !s.error && (s.reading || (!s.match && !s.failure)),
  ).length;

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

  const openText = useCallback((s: Submission) => setTextFor(s.key), []);
  const textSubmission = submissions.find((s) => s.key === textFor) ?? null;

  // Bills that failed but that the address on file was never saved against. Only
  // ever non-empty briefly — `cover()` in the pipeline writes them as they fail —
  // but it's what keeps the card's "done" state honest if that write loses.
  const uncovered = notified
    ? unread.map((s) => s.submissionId!).filter((id) => !notified.ids.has(id))
    : [];

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
        <div className="flex flex-col gap-5">
          <ResultsHeader
            total={submissions.length}
            parsed={saved}
            reading={reading}
            unparsed={unread.length}
            errored={submissions.filter((s) => s.error !== null).length}
            onFiles={onBrowse}
            busy={busy}
          />
          {submissions.map((s) => (
            <SubmissionCard
              key={s.key}
              submission={s}
              solo={submissions.length === 1}
              onViewText={openText}
              onReport={report}
              onSaveVendorGuess={saveVendorGuess}
            />
          ))}
        </div>
      )}

      {unread.length > 0 && (
        <NotifyCard
          fileNames={unread.map((s) => s.file.name)}
          allUnrecognized={allUnrecognized}
          saved={notified !== null && uncovered.length === 0}
          onSubmit={(email) =>
            notify(
              unread.map((s) => s.submissionId!),
              email,
            )
          }
        />
      )}

      {saved > 0 && <SaveCta count={saved} onClick={onSaveClick} />}

      {textSubmission && (
        <SubmissionTextDialog
          submission={textSubmission}
          onClose={() => setTextFor(null)}
        />
      )}
    </div>
  );
}

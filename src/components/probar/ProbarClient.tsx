"use client";

import { useCallback, useState } from "react";
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
import { DropArea } from "./DropArea";
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
  const [busy, setBusy] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);

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
    async (submission: Submission, keep: boolean) => {
      const { key, file } = submission;

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
        if (res.status === 429) {
          patch(key, { reading: false, error: p.rateLimited });
          return;
        }
        if (res.status === 413) {
          patch(key, {
            reading: false,
            error: interpolate(p.tooLarge, {
              file: file.name,
              max: Math.round(PUBLIC_MAX_BYTES / (1024 * 1024)),
            }),
          });
          return;
        }
        if (!res.ok) {
          patch(key, {
            reading: false,
            error: interpolate(p.uploadFailed, { file: file.name }),
          });
          return;
        }
        submitted = (await res.json()) as SubmitResponse;
      } catch {
        patch(key, {
          reading: false,
          error: interpolate(p.uploadFailed, { file: file.name }),
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
            patch(key, { error: p.rateLimited });
            return;
          }
          run = (await res.json()) as ParseResponse;
        } catch {
          patch(key, { error: interpolate(p.uploadFailed, { file: file.name }) });
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
    },
    [locale, p, patch, setTier],
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      const pdfs: File[] = [];
      for (const file of files) {
        const isPdf =
          file.type === "application/pdf" ||
          file.name.toLowerCase().endsWith(".pdf");
        if (!isPdf) {
          showToast(interpolate(p.notPdf, { file: file.name }));
          continue;
        }
        pdfs.push(file);
      }
      if (pdfs.length === 0) return;

      const accepted = pdfs.slice(0, MAX_FILES_PER_DROP);
      if (pdfs.length > accepted.length)
        showToast(interpolate(p.tooManyFiles, { max: MAX_FILES_PER_DROP }));

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
      // Replace rather than append: each drop is its own experiment, and a
      // growing pile would push the results the visitor came for off-screen.
      setSubmissions(fresh);
      setBusy(true);

      const queue = [...fresh];
      const workers = Array.from(
        { length: Math.min(CONCURRENCY, queue.length) },
        async () => {
          for (;;) {
            const next = queue.shift();
            if (!next) return;
            await run(next, keepFile);
          }
        },
      );
      await Promise.all(workers);
      setBusy(false);
    },
    [keepFile, p, run, showToast],
  );

  /** Fetch the committed sample and push it through the identical pipeline —
   * no `sample=1` branch on the server to keep honest. */
  const useSample = useCallback(async () => {
    setSampleBusy(true);
    try {
      const res = await fetch(SAMPLE_URL);
      const blob = await res.blob();
      await addFiles([
        new File([blob], "edesur-ejemplo.pdf", { type: "application/pdf" }),
      ]);
    } catch {
      showToast(interpolate(p.uploadFailed, { file: "edesur-ejemplo.pdf" }));
    } finally {
      setSampleBusy(false);
    }
  }, [addFiles, p, showToast]);

  const notify = useCallback(async (submissionId: string, email: string) => {
    await fetch("/api/probar/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ submissionId, email }),
    });
  }, []);

  const saved = submissions.filter((s) => s.match?.ok).length;

  return (
    <div className="flex flex-col gap-8">
      <DropArea
        onFiles={addFiles}
        keepFile={keepFile}
        onKeepFileChange={setKeepFile}
        onSample={useSample}
        sampleBusy={sampleBusy}
        busy={busy}
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

      {saved > 0 && <SaveCta count={saved} />}
    </div>
  );
}

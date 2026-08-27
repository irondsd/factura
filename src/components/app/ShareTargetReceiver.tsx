"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import posthog from "posthog-js";
import { useBillIngest } from "@/components/BillIngestProvider";
import { useT } from "@/i18n/I18nProvider";
import { SHARE_PARAM, takeSharedFiles } from "@/lib/shareTarget";
import { useToasts } from "@/providers/ToastProvider";

/** Finishes the Android share-sheet flow: the service worker has already
 * stashed the shared PDFs and bounced the app to `/app?share=<id>`, so all
 * that's left is handing them to the same ingest pipeline the upload button
 * feeds. Toasts, the busy indicator and the "which property?" prompt all come
 * along with it — a shared bill lands exactly like an uploaded one. */
export function ShareTargetReceiver() {
  const params = useSearchParams();
  const router = useRouter();
  const { handleFiles } = useBillIngest();
  const { showToast } = useToasts();
  const t = useT("drop");
  const fired = useRef(false);

  const shareId = params.get(SHARE_PARAM);

  useEffect(() => {
    if (!shareId || fired.current) return;
    // Guards React's double-invoked effects in dev, where a second run would
    // find the cache already emptied and cry "share failed".
    fired.current = true;
    // Clear the id before the upload rather than after: the files are gone from
    // the cache the moment we read them, so a refresh mid-ingest would look
    // like a share that never arrived.
    router.replace(stripShare(params));

    void (async () => {
      const files = await takeSharedFiles(shareId);
      posthog.capture("bill_shared_in", { file_count: files.length });
      if (files.length === 0) {
        // The worker couldn't stash the files, or couldn't reach Auth.js to
        // check the session, or wasn't running yet and the route-handler
        // fallback sent us here. Registering it is the first thing this app
        // subtree does, and we're plainly signed in, so a retry works. (A share
        // that arrived with no session never gets this far: the worker sends it
        // to /login instead, having written nothing.)
        showToast(t.shareFailed);
        return;
      }
      await handleFiles(files);
    })();
  }, [shareId, params, router, handleFiles, showToast, t]);

  return null;
}

/** Drop the share id, keeping every other param (the selected property, the
 * `source=pwa` launch tag) intact. */
function stripShare(params: URLSearchParams): string {
  const next = new URLSearchParams(params.toString());
  next.delete(SHARE_PARAM);
  const qs = next.toString();
  return qs ? `/app?${qs}` : "/app";
}

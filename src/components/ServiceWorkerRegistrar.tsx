"use client";

import { useEffect } from "react";

/** Registers public/sw.js, whose only job is catching PDFs shared into the
 * installed Android app. Mounted in the /app + /login root layout rather than
 * site-wide: the worker is useless to someone reading the landing page, and
 * anyone who can share a bill has been through the app at least once. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      // Nothing to recover: without the worker the app behaves exactly as it
      // did before it existed, minus the share sheet entry.
      console.warn("[sw] registration failed:", err);
    });
  }, []);

  return null;
}

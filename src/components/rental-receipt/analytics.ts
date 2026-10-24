"use client";

import posthog from "posthog-js";

/** Fixed events only. Never attach values, validation messages, or PDF content. */
export function receiptEvent(
  event:
    | "blank_downloaded"
    | "reviewed"
    | "pdf_downloaded"
    | "pdf_failed"
    | "cta_clicked",
) {
  posthog.capture(`rental_receipt_${event}`);
}

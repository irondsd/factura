"use client";

import { usePathname } from "next/navigation";
import { useRef } from "react";
import { useBillIngest } from "@/components/BillIngestProvider";
import { useI18n } from "@/i18n/I18nProvider";

// Routes where the upload button rides along. Drag-and-drop covers wide
// screens everywhere; narrow screens can't drag, so they get a tap target.
const FAB_ROUTES = new Set([
  "/app",
  "/app/insights",
  "/app/bills",
  "/app/profile",
]);

/** Floating upload button for narrow screens (< 768px, via `md:hidden`), where
 * drag-and-drop isn't available. Feeds the same ingest pipeline as the drag
 * overlay. */
export function UploadFab() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { handleFiles, busy } = useBillIngest();
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!pathname || !FAB_ROUTES.has(pathname)) return null;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleFiles(e.target.files);
          // Allow re-selecting the same file after the picker closes.
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={busy}
        aria-label={t.drop.uploadBill}
        title={t.drop.uploadBill}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-accent bg-accent text-paper shadow-pop transition active:scale-95 disabled:opacity-60 md:hidden"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 16V4" />
          <path d="m6 10 6-6 6 6" />
          <path d="M4 20h16" />
        </svg>
      </button>
    </>
  );
}

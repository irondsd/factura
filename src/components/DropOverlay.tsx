"use client";

import { usePathname } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";
import { useBillIngest } from "@/components/BillIngestProvider";
import { useWindowFileDrop } from "@/components/useWindowFileDrop";

/** Global drag-and-drop: drop a PDF anywhere to upload + ingest it. The actual
 * ingest lives in <BillIngestProvider>; this only owns the drag affordance. */
export function DropOverlay() {
  // The builder page has its own dropzone (drop bills to test against), so the
  // global ingest-on-drop must stand down there.
  const pathname = usePathname();
  const { t } = useI18n();
  const { handleFiles } = useBillIngest();
  const td = t.drop;
  const disabled = pathname?.startsWith("/app/builder") ?? false;
  const dragging = useWindowFileDrop({ onFiles: handleFiles, disabled });

  if (!dragging) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-paper/90">
      <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-accent px-16 py-12 text-center">
        <p className="font-display text-3xl font-semibold">{td.dropTitle}</p>
        <p className="text-[11px] uppercase tracking-wider text-muted">
          {td.dropSubtitle}
        </p>
      </div>
    </div>
  );
}

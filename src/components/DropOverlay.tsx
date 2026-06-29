"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { useBillIngest } from "@/components/BillIngestProvider";

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
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    if (disabled) return;
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    };
    const onDragLeave = () => {
      depth.current -= 1;
      if (depth.current <= 0) setDragging(false);
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      if (e.dataTransfer?.files.length) handleFiles(e.dataTransfer.files);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [handleFiles, disabled]);

  if (disabled || !dragging) return null;

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

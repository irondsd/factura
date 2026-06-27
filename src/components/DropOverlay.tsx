"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import posthog from "posthog-js";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { trpc } from "@/lib/trpc";
import { formatARS, formatMonth } from "@/lib/format";
import { useToasts } from "@/providers/ToastProvider";

type PendingConfirm = {
  billId: string;
  vendorName: string;
  accountNumber: string;
  suggestedPropertyId: string | null;
};

/** Global drag-and-drop: drop a PDF anywhere to upload + ingest it. The file is
 * stored to S3 (when configured) and its extracted text saved to the ledger. */
export function DropOverlay() {
  // The builder page has its own dropzone (drop bills to test against), so the
  // global ingest-on-drop must stand down there.
  const pathname = usePathname();
  const { showToast } = useToasts();
  const { t, locale } = useI18n();
  const td = t.drop;
  const disabled = pathname?.startsWith("/app/builder") ?? false;
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmQueue, setConfirmQueue] = useState<PendingConfirm[]>([]);
  const [newNickname, setNewNickname] = useState("");
  const depth = useRef(0);

  const utils = trpc.useUtils();
  const presignUpload = trpc.bills.presignUpload.useMutation();
  const ingest = trpc.bills.ingest.useMutation();
  const confirmAccount = trpc.bills.confirmAccount.useMutation();
  const createProperty = trpc.properties.create.useMutation();
  const propertiesQuery = trpc.properties.list.useQuery(undefined, {
    enabled: confirmQueue.length > 0,
  });

  const handleFiles = useCallback(
    async (files: FileList) => {
      setBusy(true);
      for (const file of Array.from(files)) {
        const isPdf =
          file.type === "application/pdf" ||
          file.name.toLowerCase().endsWith(".pdf");
        if (!isPdf) {
          showToast(interpolate(td.notPdf, { file: file.name }));
          continue;
        }
        try {
          const { default: pdfToText } = await import("react-pdftotext");
          const rawText = await pdfToText(file);
          if (rawText.trim().length < 20) {
            showToast(interpolate(td.noText, { file: file.name }));
            continue;
          }

          // Store the original PDF first (when storage is configured), then
          // ingest the extracted text with a pointer to it.
          let storageKey: string | undefined;
          try {
            const presigned = await presignUpload.mutateAsync({
              fileName: file.name,
            });
            if (presigned) {
              const res = await fetch(presigned.url, {
                method: "PUT",
                body: file,
                headers: { "Content-Type": "application/pdf" },
              });
              if (res.ok) storageKey = presigned.key;
            }
          } catch {
            // Upload failed — fall back to text-only so the bill still lands.
          }

          const result = await ingest.mutateAsync({
            fileName: file.name,
            rawText,
            storageKey,
          });
          posthog.capture("bill_uploaded", {
            outcome: result.outcome,
            file_name: file.name,
          });
          switch (result.outcome) {
            case "parsed":
              showToast(
                `${result.vendorName} · ${formatMonth(result.period, locale)} · ${formatARS(result.totalAmount)}` +
                  (result.periodDuplicate ? td.periodDuplicate : ""),
              );
              break;
            case "duplicate":
              showToast(interpolate(td.duplicate, { file: file.name }));
              break;
            case "unrecognized":
              showToast(interpolate(td.unrecognized, { file: file.name }));
              break;
            case "parse_failed":
              showToast(
                interpolate(td.parseFailed, { vendor: result.vendorName }),
              );
              break;
            case "unknown_account":
              setConfirmQueue((q) => [
                ...q,
                {
                  billId: result.billId,
                  vendorName: result.vendorName,
                  accountNumber: result.accountNumber,
                  suggestedPropertyId: result.suggestedPropertyId,
                },
              ]);
              break;
          }
        } catch (err) {
          showToast(
            `✕ ${file.name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      setBusy(false);
      utils.invalidate();
    },
    [ingest, presignUpload, showToast, utils, td, locale],
  );

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

  if (disabled) return null;

  const current = confirmQueue[0];

  const resolveConfirm = async (propertyId: string) => {
    await confirmAccount.mutateAsync({ billId: current.billId, propertyId });
    posthog.capture("bill_account_linked", {
      vendor_name: current.vendorName,
    });
    showToast(interpolate(td.accountLinked, { vendor: current.vendorName }));
    setConfirmQueue((q) => q.slice(1));
    utils.invalidate();
  };

  return (
    <>
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-paper/90">
          <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-accent px-16 py-12 text-center">
            <p className="font-display text-3xl font-semibold">
              {td.dropTitle}
            </p>
            <p className="text-[11px] uppercase tracking-wider text-muted">
              {td.dropSubtitle}
            </p>
          </div>
        </div>
      )}

      {busy && (
        <div className="fixed bottom-4 left-4 z-50 animate-pulse border border-line bg-card px-4 py-2 text-[11px] uppercase tracking-wider text-muted">
          {t.app.loading}
        </div>
      )}

      {current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4">
          <div className="receipt-edge w-full max-w-md border border-line bg-card p-6 pb-10">
            <p className="text-[11px] uppercase tracking-[0.25em] text-accent">
              {td.newAccount}
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold">
              {current.vendorName} · №{current.accountNumber}
            </h2>
            <p className="mt-2 text-sm text-muted">{td.whichProperty}</p>
            <div className="mt-4 flex flex-col gap-2">
              {(propertiesQuery.data ?? []).map((p) => (
                <button
                  key={p.id}
                  onClick={() => resolveConfirm(p.id)}
                  disabled={confirmAccount.isPending}
                  className={`cursor-pointer border px-4 py-2 text-left text-sm hover:border-accent ${
                    p.id === current.suggestedPropertyId
                      ? "border-accent bg-accent/5"
                      : "border-line"
                  }`}
                >
                  {p.nickname}
                  {p.id === current.suggestedPropertyId && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-accent">
                      {td.addressMatch}
                    </span>
                  )}
                </button>
              ))}
              <form
                className="mt-1 flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newNickname.trim()) return;
                  const created = await createProperty.mutateAsync({
                    nickname: newNickname.trim(),
                    addressVariants: [],
                  });
                  setNewNickname("");
                  await resolveConfirm(created.id);
                }}
              >
                <input
                  value={newNickname}
                  onChange={(e) => setNewNickname(e.target.value)}
                  placeholder={td.newPropertyPlaceholder}
                  className="flex-1 border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={createProperty.isPending}
                  className="cursor-pointer border border-line px-3 py-2 text-[11px] uppercase tracking-wider hover:border-accent hover:text-accent"
                >
                  {t.common.add}
                </button>
              </form>
              <button
                onClick={() => setConfirmQueue((q) => q.slice(1))}
                className="mt-1 cursor-pointer text-[11px] uppercase tracking-wider text-muted underline decoration-dotted underline-offset-4 hover:text-accent"
              >
                {td.skipReview}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

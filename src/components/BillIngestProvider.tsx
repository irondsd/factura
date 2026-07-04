"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import posthog from "posthog-js";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { formatARS, formatMonth } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useToasts } from "@/providers/ToastProvider";

type PendingConfirm = {
  billId: string;
  vendorName: string;
  accountNumber: string;
  suggestedPropertyId: string | null;
};

type BillIngestValue = {
  /** Read each PDF in the browser, store it, and ingest its text. */
  handleFiles: (files: FileList) => Promise<void>;
  /** True while an ingest batch is in flight. */
  busy: boolean;
};

const BillIngestContext = createContext<BillIngestValue | null>(null);

export function useBillIngest(): BillIngestValue {
  const ctx = useContext(BillIngestContext);
  if (!ctx) {
    throw new Error("useBillIngest must be used within a <BillIngestProvider>");
  }
  return ctx;
}

/** Owns the bill-ingest pipeline shared by the drag overlay and the upload FAB:
 * the file handler, the busy indicator, and the one-time "which property does
 * this new account belong to?" confirm flow. Rendering the confirm modal here
 * (rather than in each trigger) keeps it single-instance no matter how the file
 * arrived. */
export function BillIngestProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToasts();
  const { t, locale } = useI18n();
  const td = t.drop;
  const [busy, setBusy] = useState(false);
  const [confirmQueue, setConfirmQueue] = useState<PendingConfirm[]>([]);
  const [newNickname, setNewNickname] = useState("");

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
              // Non-ok = storage is configured but the PUT was rejected (bucket
              // permissions, etc.). The bill still lands text-only; log why so
              // it's diagnosable instead of silently showing "not stored".
              else
                console.warn(
                  `PDF storage upload failed for ${file.name}: ${res.status} ${res.statusText}`,
                );
            }
          } catch (err) {
            // A thrown fetch here is almost always the browser blocking the
            // cross-origin PUT because the bucket has no matching CORS rule.
            // Fall back to text-only so the bill still lands, but surface it.
            console.warn(
              `PDF storage upload errored for ${file.name} (likely bucket CORS):`,
              err,
            );
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
    <BillIngestContext.Provider value={{ handleFiles, busy }}>
      {children}

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
    </BillIngestContext.Provider>
  );
}

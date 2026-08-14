"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import posthog from "posthog-js";
import { Button } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { formatARS, formatMonth } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useToasts } from "@/providers/ToastProvider";
import type { IngestResult } from "@/server/ingest";

/** The ingest route returns the shared IngestResult, plus a "no_text" outcome for
 * PDFs whose extracted text was too short to be a real bill. */
type IngestApiResult = IngestResult | { outcome: "no_text" };

type PendingConfirm = {
  billId: string;
  vendorName: string;
  accountNumber: string;
  suggestedPropertyId: string | null;
  /** The address match is strong enough to ask a yes/no instead of showing the
   * whole picker. */
  suggestionConfident: boolean;
};

type BillIngestValue = {
  /** Upload each PDF to the ingest API, which extracts, stores, and ingests it.
   * Takes a `FileList` straight off an <input> or a drop, or a plain array —
   * which is what a share from the Android share sheet arrives as. */
  handleFiles: (files: FileList | File[]) => Promise<void>;
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
  /** Set when the user rejects a confident guess, dropping them to the picker. */
  const [picking, setPicking] = useState(false);

  const utils = trpc.useUtils();
  const confirmAccount = trpc.bills.confirmAccount.useMutation();
  const createProperty = trpc.properties.create.useMutation();
  const propertiesQuery = trpc.properties.list.useQuery(undefined, {
    enabled: confirmQueue.length > 0,
  });

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
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
          // Extraction + storage + ingest all happen server-side now: the file is
          // read by one pinned pdf.js, stored (if storage is configured), and
          // ingested in a single round-trip.
          const form = new FormData();
          form.append("file", file);
          const res = await fetch("/api/bills/ingest", {
            method: "POST",
            body: form,
          });
          if (!res.ok) {
            showToast(`✕ ${file.name}: ${res.status} ${res.statusText}`);
            continue;
          }
          const result: IngestApiResult = await res.json();
          posthog.capture("bill_uploaded", {
            outcome: result.outcome,
            file_name: file.name,
          });
          switch (result.outcome) {
            case "no_text":
              showToast(interpolate(td.noText, { file: file.name }));
              break;
            case "parsed":
              showToast(
                `${result.vendorName} · ${formatMonth(result.period, locale)} · ${formatARS(result.totalAmount)}` +
                  (result.periodDuplicate ? td.periodDuplicate : ""),
              );
              break;
            case "duplicate":
              showToast(interpolate(td.duplicate, { file: file.name }));
              break;
            // Both review outcomes park the bill with no property, which means
            // it only ever shows under "Todas" — so the toast has to carry the
            // way there. Bare /app/bills, deliberately without ?property=:
            // that IS the "Todas" scope.
            case "unrecognized":
              showToast(interpolate(td.unrecognized, { file: file.name }), {
                href: "/app/bills",
                label: td.viewReview,
              });
              break;
            case "parse_failed":
              showToast(
                interpolate(td.parseFailed, { vendor: result.vendorName }),
                { href: "/app/bills", label: td.viewReview },
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
                  suggestionConfident: result.suggestionConfident,
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
    [showToast, utils, td, locale],
  );

  const current = confirmQueue[0];

  const resolveConfirm = async (propertyId: string) => {
    await confirmAccount.mutateAsync({ billId: current.billId, propertyId });
    posthog.capture("bill_account_linked", {
      vendor_name: current.vendorName,
      // Did the address guess survive the user's review?
      suggestion_confident: current.suggestionConfident,
      suggestion_accepted: propertyId === current.suggestedPropertyId,
    });
    showToast(interpolate(td.accountLinked, { vendor: current.vendorName }));
    setConfirmQueue((q) => q.slice(1));
    setPicking(false);
    utils.invalidate();
  };

  // A confident address match earns a yes/no instead of the full picker — but
  // only once we can actually name the property, and only until the user says
  // it's wrong.
  const suggested = current?.suggestionConfident
    ? propertiesQuery.data?.find((p) => p.id === current.suggestedPropertyId)
    : undefined;
  const confirming = Boolean(suggested) && !picking;

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
            <p className="mt-2 text-sm text-muted">
              {confirming ? td.confirmProperty : td.whichProperty}
            </p>

            {confirming && suggested ? (
              <div className="mt-4 flex flex-col gap-2">
                <div className="border border-accent bg-accent/5 px-4 py-3">
                  <p className="text-sm font-semibold">{suggested.nickname}</p>
                  {suggested.address && (
                    <p className="mt-0.5 text-xs text-muted">
                      {suggested.address}
                    </p>
                  )}
                </div>
                <Button
                  variant="solid"
                  onClick={() => resolveConfirm(suggested.id)}
                  disabled={confirmAccount.isPending}
                >
                  {td.confirmYes}
                </Button>
                <Button
                  onClick={() => setPicking(true)}
                  disabled={confirmAccount.isPending}
                >
                  {td.confirmNo}
                </Button>
              </div>
            ) : (
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
                      address: "",
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
                  <Button type="submit" disabled={createProperty.isPending}>
                    {t.common.add}
                  </Button>
                </form>
              </div>
            )}

            <Button
              variant="quiet"
              onClick={() => {
                setConfirmQueue((q) => q.slice(1));
                setPicking(false);
              }}
              className="mt-3"
            >
              {td.skipReview}
            </Button>
          </div>
        </div>
      )}
    </BillIngestContext.Provider>
  );
}

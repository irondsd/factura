"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Badge, Button, FinePrint, microLabel } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { formatMonth } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { BillDrawerShell } from "./BillDrawerShell";
import {
  BillFields,
  type Draft,
  draftFromBill,
  ExtractedFields,
  ExtractedText,
  DrawerHeader,
  OriginalFileRow,
  ReparseOption,
  reviewKindOf,
  reviewLabelOf,
  YoyStrip,
} from "./parts";

/** The signed-in bill editor: load + edit + reparse + delete, plus the entry
 * point into the parser builder. The animated chrome lives in <BillDrawerShell>
 * and the layout pieces in ./parts; this component wires them to tRPC. */
export function BillDrawer({
  billId,
  onClose,
  onToast,
}: {
  billId: string | null;
  onClose: () => void;
  onToast: (text: string) => void;
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const tb = t.billDrawer;
  const utils = trpc.useUtils();
  const billQuery = trpc.bills.get.useQuery(
    { id: billId! },
    { enabled: Boolean(billId) },
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [syncedId, setSyncedId] = useState<string | null>(null);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Vendors belong to an property, so scope the picker to the bill's chosen
  // property (all accessible vendors until one is chosen).
  const vendors = trpc.vendors.list.useQuery(
    draft?.propertyId ? { propertyId: draft.propertyId } : undefined,
  );
  const properties = trpc.properties.list.useQuery();
  const parsers = trpc.parsers.list.useQuery();

  const updateBill = trpc.bills.update.useMutation();
  const deleteBill = trpc.bills.delete.useMutation();
  const reparseText = trpc.bills.reparseText.useMutation();
  const reparseFile = trpc.bills.reparseFile.useMutation();

  const bill = billQuery.data;

  // Reset the delete confirmation whenever a (different) bill is opened.
  if (billId && billId !== openedId) {
    setOpenedId(billId);
    setConfirmingDelete(false);
  } else if (!billId && openedId) {
    setOpenedId(null);
  }

  // Seed the editable draft from the loaded bill (render-time sync, keyed by
  // bill id — the project's idiom over a state-setting effect).
  if (bill && bill.id !== syncedId) {
    setSyncedId(bill.id);
    setDraft(draftFromBill(bill));
  }

  const vendor = vendors.data?.find((v) => v.id === bill?.vendorId);
  const extra = (bill?.extra ?? {}) as Record<string, unknown>;
  const review = bill?.status === "needs_review";
  // Unfiled bills have no vendor row yet — the parser stashed the name on extra.
  const vendorLabel =
    vendor?.displayName ??
    (extra.vendorName as string | undefined) ??
    tb.unrecognizedVendor;
  const parseError = extra.parseError as string | undefined;
  const customFields = (extra.fields ?? {}) as Record<string, unknown>;

  const reviewKind = bill ? reviewKindOf(bill) : null;
  const parser = parsers.data?.find((p) => p.slug === bill?.parserKey);
  const reviewLabel = reviewLabelOf(reviewKind, tb, parseError);

  return (
    <BillDrawerShell openKey={billId} onClose={onClose}>
      {(close) => {
        if (!bill || !draft) return <FinePrint className="p-6" />;

        const openBuilder = () => {
          const params = new URLSearchParams({ bill: bill.id });
          if (bill.parserKey) params.set("parser", bill.parserKey);
          // Close the drawer explicitly before navigating instead of leaving it
          // open over the builder page.
          close();
          router.push(`/app/builder?${params.toString()}`);
        };

        const save = async () => {
          await updateBill.mutateAsync({
            id: bill.id,
            vendorId: draft.vendorId || undefined,
            propertyId: draft.propertyId || undefined,
            period: draft.period ? `${draft.period}-01` : undefined,
            totalAmount: draft.totalAmount
              ? Number(draft.totalAmount)
              : undefined,
            dueDate: draft.dueDate || undefined,
          });
          onToast(tb.toastUpdated);
          utils.invalidate();
          close();
        };

        const remove = async () => {
          try {
            await deleteBill.mutateAsync({ id: bill.id });
          } catch {
            // Storage cleanup failed before the row was removed — the bill is
            // still intact, so keep the drawer open and let the user retry.
            setConfirmingDelete(false);
            onToast(tb.toastDeleteFailed);
            return;
          }
          onToast(tb.toastDeleted);
          utils.invalidate();
          close();
        };

        const onReparseText = async () => {
          await reparseText.mutateAsync({ id: bill.id });
          onToast(tb.toastReparsedText);
          utils.invalidate();
        };

        const onReparseFile = async () => {
          if (!bill.downloadUrl) {
            onToast(tb.toastNoPdf);
            return;
          }
          try {
            const blob = await fetch(bill.downloadUrl).then((r) => r.blob());
            const { default: pdfToText } = await import("react-pdftotext");
            const rawText = await pdfToText(
              new File([blob], bill.fileName ?? "bill.pdf", {
                type: "application/pdf",
              }),
            );
            await reparseFile.mutateAsync({ id: bill.id, rawText });
            onToast(tb.toastReparsedFile);
            utils.invalidate();
          } catch {
            onToast(tb.toastRereadFailed);
          }
        };

        return (
          <>
            <DrawerHeader
              reviewLabel={reviewLabel}
              review={review}
              title={
                <>
                  {vendorLabel}
                  {bill.period ? " · " + formatMonth(bill.period, locale) : ""}
                </>
              }
              fileName={bill.fileName}
              onClose={close}
            />

            <YoyStrip yoy={bill.yoy} />

            <BillFields
              draft={draft}
              onChange={setDraft}
              vendors={vendors.data ?? []}
              properties={properties.data ?? []}
            />

            <ExtractedFields fields={customFields} />

            {/* parser used + builder entry */}
            <div className="pt-4 px-6 pb-1">
              <p className={cn(microLabel, "mb-1.5")}>{tb.parser}</p>
              <div className="flex items-center gap-2.5 border border-line py-2.5 px-3 bg-paper">
                <span className="font-mono text-xs flex-1">
                  {bill.parserKey ? (
                    <>
                      {parser?.displayName ?? bill.parserKey}
                      {parser ? (
                        bill.parserVersion && (
                          <span className="text-muted">
                            {" "}
                            · v{bill.parserVersion}
                          </span>
                        )
                      ) : (
                        <span className="text-muted"> · {tb.notSavedParser}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted">{tb.noParserRecognized}</span>
                  )}
                </span>
                {reviewKind === "needs_home" ? (
                  <Badge tone="neutral">{tb.parsedOk}</Badge>
                ) : (
                  <Button size="sm" onClick={openBuilder}>
                    {parser
                      ? reviewKind === "parse_failed"
                        ? tb.fixParser
                        : tb.editParser
                      : tb.setupParser}
                  </Button>
                )}
              </div>
              {reviewKind === "needs_home" && (
                <p className="font-mono text-[10.5px] text-muted mt-2">
                  {tb.parsedCleanly}
                </p>
              )}
            </div>

            <OriginalFileRow
              fileName={bill.fileName}
              downloadUrl={bill.downloadUrl}
            />

            <ExtractedText text={bill.rawText} />

            {/* reparse — two paths */}
            <div className="pt-3 px-6 pb-5">
              <p className={cn(microLabel, "mb-2")}>{tb.reparse}</p>
              <div className="flex gap-2">
                <ReparseOption
                  title={tb.reparseFromFile}
                  caption={tb.reparseFromFileCaption}
                  disabled={!bill.downloadUrl || reparseFile.isPending}
                  onClick={onReparseFile}
                />
                <ReparseOption
                  title={tb.reparseFromText}
                  caption={tb.reparseFromTextCaption}
                  disabled={reparseText.isPending}
                  onClick={onReparseText}
                />
              </div>
            </div>

            {/* footer */}
            <div className="sticky bottom-0 flex gap-2 py-3.5 px-6 border-t border-line bg-card">
              <Button
                variant="solid"
                onClick={save}
                disabled={updateBill.isPending}
              >
                {tb.saveChanges}
              </Button>
              <Button
                variant="ghost"
                className="ml-auto"
                onClick={() => setConfirmingDelete(true)}
                disabled={deleteBill.isPending}
              >
                {t.common.delete}
              </Button>
            </div>

            <ConfirmDialog
              open={confirmingDelete}
              eyebrow={tb.deleteEyebrow}
              title={tb.deleteTitle}
              description={tb.deleteDescription}
              confirmLabel={tb.deleteConfirm}
              busyLabel={tb.deleting}
              busy={deleteBill.isPending}
              onConfirm={remove}
              onCancel={() => setConfirmingDelete(false)}
            />
          </>
        );
      }}
    </BillDrawerShell>
  );
}

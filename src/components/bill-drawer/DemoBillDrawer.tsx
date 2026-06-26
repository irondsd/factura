"use client";

import Link from "next/link";
import { Badge, microLabel } from "@/components/ui";
import { demoBill, demoProperties, demoVendors } from "@/lib/demo/fixtures";
import { cn } from "@/lib/cn";
import { formatMonth } from "@/lib/format";
import { BillDrawerShell } from "./BillDrawerShell";
import {
  BillFields,
  draftFromBill,
  DrawerHeader,
  ExtractedFields,
  ExtractedText,
  OriginalFileRow,
  reviewKindOf,
  reviewLabelOf,
  YoyStrip,
} from "./parts";

/** Read-only twin of <BillDrawer> for the public /demo. Same layout primitives,
 * but every mutation is replaced by a "sign in" nudge: fields are disabled, the
 * parser builder never opens, and there's no reparse or delete. */
export function DemoBillDrawer({
  billId,
  onClose,
}: {
  billId: string | null;
  onClose: () => void;
  onToast?: (text: string) => void;
}) {
  const bill = billId ? demoBill(billId) : null;

  const vendor = demoVendors.find((v) => v.id === bill?.vendorId);
  const extra = (bill?.extra ?? {}) as Record<string, unknown>;
  const review = bill?.status === "needs_review";
  const vendorLabel = vendor?.displayName ?? "Unrecognized";
  const parseError = extra.parseError as string | undefined;
  const customFields = (extra.fields ?? {}) as Record<string, unknown>;

  const reviewKind = bill ? reviewKindOf(bill) : null;
  const reviewLabel = reviewLabelOf(reviewKind, parseError);

  return (
    <BillDrawerShell openKey={billId} onClose={onClose}>
      {(close) => {
        if (!bill) return null;
        return (
          <>
            <DrawerHeader
              reviewLabel={reviewLabel}
              review={review}
              title={
                <>
                  {vendorLabel}
                  {bill.period ? " · " + formatMonth(bill.period) : ""}
                </>
              }
              fileName={bill.fileName}
              onClose={close}
            />

            <YoyStrip yoy={bill.yoy} />

            <BillFields
              draft={draftFromBill(bill)}
              vendors={demoVendors}
              properties={demoProperties}
              disabled
            />

            <ExtractedFields fields={customFields} />

            {/* parser used — read-only in the demo */}
            <div className="pt-4 px-6 pb-1">
              <p className={cn(microLabel, "mb-1.5")}>Parser</p>
              <div className="flex items-center gap-2.5 border border-line py-2.5 px-3 bg-paper">
                <span className="font-mono text-xs flex-1">
                  {bill.parserKey ? (
                    <>
                      {bill.parserKey}
                      {bill.parserVersion && (
                        <span className="text-muted"> · v{bill.parserVersion}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted">
                      No parser recognized this bill
                    </span>
                  )}
                </span>
                <Badge tone="neutral">demo</Badge>
              </div>
            </div>

            <OriginalFileRow fileName={bill.fileName} downloadUrl={null} />

            <ExtractedText text={bill.rawText} />

            {/* footer: sign-in CTA in place of save/reparse/delete */}
            <div className="sticky bottom-0 py-3.5 px-6 border-t border-line bg-card">
              <p className="font-mono text-[11px] text-muted leading-[1.6] mb-2.5">
                You&apos;re viewing sample data. Sign in to edit bills, fix
                parsers, reparse and delete.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap py-2 px-3 font-mono text-micro uppercase tracking-label leading-none border border-ink bg-ink text-paper no-underline transition-colors hover:bg-accent hover:border-accent"
              >
                Sign in to use your bills
              </Link>
            </div>
          </>
        );
      }}
    </BillDrawerShell>
  );
}

"use client";

import { Button } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";

/**
 * Confirm deleting one of the user's own parsers. Not ConfirmDialog, because
 * this decision needs the consequences spelled out and one of them cancels the
 * action outright:
 *
 * - `billCount` bills already carry this parser's slug. They keep their stored
 *   values (`bills.parserKey` is a plain slug, no FK) but nothing re-reads them.
 * - `shadowedName` is the adopted parser this copy was shadowing (same slug, own
 *   wins — see `mergeConfigSets`). Deleting hands detection back to it, which can
 *   change the vendor and identity a bill files under.
 * - `adopters` > 0 means other people run this published parser, and deleting it
 *   cascades their adoptions away. That's someone else's data, so it's blocked
 *   here and refused again by the `parsers.delete` mutation.
 *
 * Mount conditionally; square corners, mono eyebrow, hairline border — matches
 * PublishDialog and ConfirmDialog.
 */
export function DeleteParserDialog({
  parserName,
  billCount,
  shadowedName,
  adopters,
  busy = false,
  onConfirm,
  onCancel,
}: {
  parserName: string;
  billCount: number | null;
  shadowedName: string | null;
  adopters: number;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const tp = t.parsers;
  const blocked = adopters > 0;
  const warnings = blocked
    ? [
        interpolate(
          adopters === 1 ? tp.deleteBlockedOne : tp.deleteBlockedOther,
          { n: adopters },
        ),
      ]
    : [
        // Null while the count is still loading — better to omit the line than
        // to promise "0 bills" and then contradict it.
        billCount
          ? interpolate(
              billCount === 1 ? tp.deleteBillsOne : tp.deleteBillsOther,
              { n: billCount },
            )
          : null,
        shadowedName
          ? interpolate(tp.deleteShadow, { name: shadowedName })
          : null,
      ].filter((w): w is string => w !== null);

  return (
    <div className="fixed inset-0 z-[96] flex items-center justify-center p-6">
      <div
        onClick={() => !busy && onCancel()}
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--ink)_28%,transparent)]"
      />
      <div className="relative w-[min(420px,92vw)] bg-card border border-line shadow-pop p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
          {parserName}
        </p>
        <h3 className="font-display font-semibold text-[19px] mt-2 tracking-tight">
          {blocked ? tp.deleteBlockedTitle : tp.deleteTitle}
        </h3>
        {!blocked && (
          <p className="text-sm text-muted mt-2">{tp.deleteIntro}</p>
        )}
        {warnings.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2 border-l-2 border-accent pl-3">
            {warnings.map((w) => (
              <li key={w} className="text-sm text-muted leading-[1.5]">
                {w}
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 mt-5">
          {!blocked && (
            <Button variant="danger" onClick={onConfirm} disabled={busy}>
              {busy ? t.common.working : t.common.delete}
            </Button>
          )}
          <Button
            variant="ghost"
            className="ml-auto"
            onClick={onCancel}
            disabled={busy}
          >
            {blocked ? tp.close : t.common.cancel}
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { NEW_TAB } from "@/components/landing/parts";
import { Button, hint } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";

/** The payoff: the visitor has watched us read their bills, now offer to keep
 * them. `?claim=1` is only a trigger — the submission ids travel in the httpOnly
 * cookie, so this link works on the visitor's own browser and nowhere else.
 *
 * Shown whenever at least one bill parsed, independently of the notify card
 * above it: a drop of five bills where we read two and missed three earns both,
 * and neither offer is worth withholding because the other applies. */
export function SaveCta({
  count,
  onClick,
}: {
  count: number;
  onClick: (count: number) => void;
}) {
  const { t } = useI18n();
  const p = t.probar;

  return (
    <div className="receipt-edge flex flex-col gap-4 border border-line bg-card px-5 pt-6 pb-11 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex flex-1 flex-col gap-1.5">
        <h2 className="font-display text-xl leading-tight sm:text-2xl">
          {interpolate(p.saveTitle, { count })}
        </h2>
        <p className={hint}>{p.saveBody}</p>
      </div>
      <Button
        href="/login?claim=1"
        onClick={() => onClick(count)}
        variant="solid"
        size="lg"
        className="flex-none"
        {...NEW_TAB}
      >
        {p.saveButton}
      </Button>
    </div>
  );
}

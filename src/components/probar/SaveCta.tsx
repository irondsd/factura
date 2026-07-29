"use client";

import Link from "next/link";
import { hint } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";

/** The payoff: the visitor has watched us read their bills, now offer to keep
 * them. `?claim=1` is only a trigger — the submission ids travel in the httpOnly
 * cookie, so this link works on the visitor's own browser and nowhere else. */
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
    <div className="receipt-edge bg-card border border-line p-5 flex flex-col gap-2.5 items-start">
      <h2 className="font-display text-xl leading-tight">
        {interpolate(p.saveTitle, { count })}
      </h2>
      <p className={hint}>{p.saveBody}</p>
      <Link
        href="/login?claim=1"
        onClick={() => onClick(count)}
        className="mt-1 inline-flex items-center justify-center gap-2 bg-ink text-paper border border-ink font-mono text-micro uppercase tracking-label leading-none py-2.5 px-4 transition-colors hover:bg-accent hover:border-accent"
      >
        {p.saveButton}
      </Link>
    </div>
  );
}

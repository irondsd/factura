"use client";

import { Button } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useT } from "@/i18n/I18nProvider";
import { trpc } from "@/lib/trpc";

/**
 * The foot of the profile: one dashed accent rule, one sentence, one button.
 *
 * The sentence names the actual size of the loss — "erases 159 bills" reads as
 * a consequence in a way "erases your bills" never does — and falls back to the
 * generic wording until the count is known, rather than showing a bone in the
 * middle of a sentence.
 *
 * The deletion itself lives on its own page, outside the app shell, so the
 * confirmation survives the session it destroys.
 */
export function DangerZone() {
  const t = useT("profile");
  const td = t.danger;
  const { data } = trpc.account.stats.useQuery();

  const bills = data?.bills.total ?? 0;
  const help = bills > 0 ? interpolate(td.helpCounted, { n: bills }) : td.help;

  return (
    <div className="mt-[26px] flex flex-wrap items-center justify-between gap-5 border-t border-dashed border-accent/40 pt-[18px]">
      <div className="max-w-[520px]">
        <p className="font-mono text-micro uppercase tracking-label text-accent">
          △ {td.eyebrow}
        </p>
        <p className="font-mono text-xs text-muted mt-1.5 leading-[1.6]">
          {help}
        </p>
      </div>
      <Button href="/delete-account" variant="danger" size="lg">
        {td.manage}
      </Button>
    </div>
  );
}

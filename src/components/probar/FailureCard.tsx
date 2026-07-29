"use client";

import Link from "next/link";
import { hint, microLabel } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { localizedHref } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { VendorGuessField } from "./VendorGuessField";

export type FailureKind = "unrecognized" | "parse_failed" | "no_text";

/** What a visitor sees when we couldn't read their bill.
 *
 * Three jobs, in order: say plainly what happened, show that the file was
 * genuinely opened rather than shrugged at, and ask the one question only they
 * can answer — who is this bill from?
 *
 * What it deliberately does NOT do is ask for an email. It used to, once per
 * failed card, which meant a three-bill drop asked three times and the page read
 * as an address collector. The address is asked for once, after the results, by
 * NotifyCard; this card's only input is the vendor hint, which saves itself. */
export function FailureCard({
  kind,
  submissionId,
  vendorName,
  onSaveVendorGuess,
}: {
  kind: FailureKind;
  submissionId: string;
  vendorName?: string | null;
  onSaveVendorGuess: (submissionId: string, vendor: string) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const p = t.probar;

  const title =
    kind === "no_text"
      ? p.noTextTitle
      : kind === "parse_failed"
        ? p.parseFailedTitle
        : p.failedTitle;
  const body =
    kind === "no_text"
      ? p.noTextBody
      : kind === "parse_failed"
        ? interpolate(p.parseFailedBody, { vendor: vendorName ?? "" })
        : p.failedBody;
  const meta =
    kind === "no_text"
      ? p.noTextMeta
      : kind === "parse_failed"
        ? p.parseFailedMeta
        : p.failedMeta;

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h3 className="font-display text-xl leading-tight sm:text-2xl">
          {title}
        </h3>
        <span className={cn(microLabel, "sm:ml-auto")}>{meta}</span>
      </div>

      <p className={cn(hint, "max-w-[560px] text-pretty")}>{body}</p>

      {/* A parser already named this vendor — asking who it's from would be
          asking a question we can answer ourselves. */}
      {kind !== "parse_failed" && (
        <VendorGuessField
          submissionId={submissionId}
          onSave={onSaveVendorGuess}
        />
      )}

      <p className={hint}>
        {p.safetyNote}{" "}
        <Link
          href={localizedHref("/privacy", locale)}
          className="text-accent underline decoration-dotted underline-offset-[3px]"
        >
          {t.nav.privacy}
        </Link>
      </p>
    </div>
  );
}

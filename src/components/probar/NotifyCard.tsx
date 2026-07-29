"use client";

import { type FormEvent, useState } from "react";
import { Button, Input, microLabel, hint } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";

/** One address, at the end of the drop, for every bill we couldn't read.
 *
 * The version this replaces asked per card, which meant a three-bill drop asked
 * three times for the same address and read as a page collecting emails rather
 * than one admitting a gap. Asked once, after the results, it's a straight trade:
 * we couldn't help you today, leave an address and we'll say when we can.
 *
 * The file names are listed so it's unambiguous which bills the promise covers —
 * a recognized bill in the same drop is not part of this. */
export function NotifyCard({
  fileNames,
  /** True when the group is only unrecognized/scanned bills, so the count can be
   * called "with no parser". A parser that recognized a bill but misread it is a
   * different failure and gets the neutral wording. */
  allUnrecognized,
  /** Whether an address is already on file for EVERY bill listed here. Owned by
   * the page, not this card: a bill dropped after the address was given has to
   * be covered too, or the file list below would name bills the promise doesn't
   * actually apply to. */
  saved,
  onSubmit,
}: {
  fileNames: string[];
  allUnrecognized: boolean;
  saved: boolean;
  onSubmit: (email: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const p = t.probar;
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      await onSubmit(email.trim());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const count = fileNames.length;

  return (
    <div className="receipt-edge flex flex-col gap-4 border border-accent/55 bg-card px-5 pt-6 pb-11 sm:flex-row sm:items-start sm:gap-6">
      <div className="flex flex-1 flex-col gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
          {interpolate(
            allUnrecognized ? p.notifyEyebrow : p.notifyEyebrowMixed,
            { count },
          )}
        </span>
        <h2 className="font-display text-xl leading-tight sm:text-2xl">
          {p.notifyTitle}
        </h2>
        <p className={hint}>{p.notifyBody}</p>
      </div>

      <div className="flex w-full flex-col gap-2 sm:w-[340px] sm:flex-none">
        {saved ? (
          <p className="font-mono text-xs text-ink">{p.notifySaved}</p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-2">
            <span className={microLabel}>{p.notifyLabel}</span>
            <div className="flex gap-2">
              <Input
                type="email"
                required
                placeholder={p.notifyPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-accent"
              />
              <Button
                type="submit"
                variant="solid"
                size="lg"
                disabled={busy}
                className="flex-none"
              >
                {p.notifyButton}
              </Button>
            </div>
            {failed && (
              <span className="font-mono text-xs text-accent">
                {p.notifyFailed}
              </span>
            )}
          </form>
        )}
        {/* The scope of the promise, in the visitor's own file names. */}
        <span className={hint}>{fileNames.join(" · ")}</span>
        {!saved && <span className={hint}>{p.notifyHelp}</span>}
      </div>
    </div>
  );
}

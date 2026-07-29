"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input, microLabel, hint } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { VENDOR_GUESS_MAX } from "@/lib/probar";
import * as analytics from "./analytics";

/** How long a pause counts as "done typing". Long enough that a vendor name is
 * one request rather than eight, short enough that leaving the page right after
 * typing still saves it. */
const DEBOUNCE_MS = 700;

/** "Who is this bill from?" — the only thing we can't work out ourselves about a
 * bill no parser recognized, and the field that decides which parser we write
 * next.
 *
 * It has no submit button on purpose. This is one optional word at the end of a
 * flow that already told the visitor we can't help them yet; a button is one
 * more thing to not press. So it saves on a pause, and says so — the note under
 * the field is the receipt for a write nobody asked for.
 *
 * A save that fails is not surfaced. The visitor gets nothing from this field —
 * it's a favour to us — and an error message for a favour would be rude. */
export function VendorGuessField({
  submissionId,
  onSave,
}: {
  submissionId: string;
  onSave: (submissionId: string, vendor: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const p = t.probar;
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What the server was last told, so an unchanged value on blur or unmount
  // doesn't spend a request re-saving itself.
  const flushed = useRef("");
  const reported = useRef(false);

  // The last thing typed, kept in a ref so the unmount flush below can read it
  // without this component re-registering the teardown on every keystroke.
  const latest = useRef("");

  const save = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      if (trimmed === flushed.current) return;
      flushed.current = trimmed;
      void onSave(submissionId, trimmed).then(
        () => {
          setSaved(trimmed.length > 0);
          // Once per field: the interesting fact is "someone named a vendor",
          // not how many pauses they took to type it.
          if (trimmed.length > 0 && !reported.current) {
            reported.current = true;
            analytics.vendorGuessSaved();
          }
        },
        () => {
          // Let the next keystroke retry rather than leaving this value marked
          // as already delivered.
          flushed.current = "";
        },
      );
    },
    [onSave, submissionId],
  );

  const onChange = (next: string) => {
    setValue(next);
    setSaved(false);
    latest.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(next), DEBOUNCE_MS);
  };

  // Typing and immediately navigating away must not lose the answer: whatever
  // the debounce was still holding gets flushed on teardown.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      save(latest.current);
    },
    [save],
  );

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3.5">
      <label className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3.5">
        <span className={cn(microLabel, "whitespace-nowrap")}>
          {p.vendorGuessLabel}
        </span>
        <Input
          value={value}
          maxLength={VENDOR_GUESS_MAX}
          placeholder={p.vendorGuessPlaceholder}
          onChange={(e) => onChange(e.target.value)}
          // Leaving the field is a stronger "I'm done" than any pause.
          onBlur={() => {
            if (timer.current) clearTimeout(timer.current);
            save(value);
          }}
          className="sm:max-w-[300px]"
        />
      </label>
      <span className={cn(hint, saved && "text-accent")}>
        {saved ? p.vendorGuessSaved : p.vendorGuessHelp}
      </span>
    </div>
  );
}

"use client";

import { type FormEvent, useState } from "react";
import { Button, Input, microLabel, hint } from "@/components/ui";
import { FIELD_BASE } from "@/components/ui/styles";
import { useT } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { REPORT_MESSAGE_MAX } from "@/lib/probar";
import { Modal } from "./Modal";

/** "You read this wrong." The correction form behind the link on a recognized
 * card.
 *
 * A parser that confidently returns the wrong amount is worse than one that
 * returns nothing, and the person holding the paper bill is the only one who can
 * tell us which it did. So this asks for prose rather than a structured
 * field-by-field diff: the fastest way to get a real report is to let someone
 * write the sentence they already have in their head.
 *
 * The extracted text is not in this form — it's already on the submission row,
 * and the server reads it from there. */
export function ReportDialog({
  subtitle,
  onSubmit,
  onClose,
}: {
  /** Which bill this is about — vendor, period and amount as we read them. */
  subtitle: string;
  onSubmit: (message: string, email: string) => Promise<void>;
  onClose: () => void;
}) {
  const t = useT("probar");
  const p = t;
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      await onSubmit(message.trim(), email.trim());
      // Closing IS the confirmation: the card the dialog came from swaps its
      // link for a thank-you, so a second panel on top of it would just be
      // something else to dismiss.
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={p.reportPrompt} subtitle={subtitle} onClose={onClose}>
      {/* `display: contents` so the fields sit in the panel's own flex column
          and inherit its rhythm, without a nested wrapper's spacing to reconcile. */}
      <form onSubmit={submit} className="contents">
        <p className={hint}>{p.reportBody}</p>

        <label className="flex flex-col gap-1.5">
          <span className={microLabel}>{p.reportField}</span>
          <textarea
            required
            autoFocus
            rows={4}
            maxLength={REPORT_MESSAGE_MAX}
            placeholder={p.reportPlaceholder}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className={cn(
              FIELD_BASE,
              "w-full resize-y text-[13px] leading-[1.6]",
            )}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={microLabel}>{p.reportEmailLabel}</span>
          <Input
            type="email"
            placeholder={p.notifyPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        {failed && (
          <p className="font-mono text-xs text-accent">{p.reportFailed}</p>
        )}

        <div className="flex flex-wrap items-center gap-3.5">
          <Button type="submit" variant="solid" size="lg" disabled={busy}>
            {p.reportSubmit}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={busy}
          >
            {p.reportCancel}
          </Button>
          <span className={cn(hint, "ml-auto")}>{p.reportAttach}</span>
        </div>
      </form>
    </Modal>
  );
}

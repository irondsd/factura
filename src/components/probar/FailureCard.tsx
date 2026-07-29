"use client";

import { type FormEvent, useState } from "react";
import { Button, Field, Input, microLabel, hint } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { localizedHref } from "@/i18n/routing";
import Link from "next/link";
import { TextPreview } from "./TextPreview";

export type FailureKind = "unrecognized" | "parse_failed" | "no_text";

/** What a visitor sees when we couldn't read their bill.
 *
 * Three jobs, in order of importance: thank them (an unparsed bill is the most
 * valuable thing they could have given us), show them we genuinely opened the
 * file rather than shrugging at it, and say plainly what happens to their data.
 * The email field is optional and creates no account — it exists so the promise
 * to add support is one we can actually keep. */
export function FailureCard({
  kind,
  vendorName,
  text,
  pages,
  chars,
  truncated,
  onNotify,
}: {
  kind: FailureKind;
  vendorName?: string | null;
  text?: string;
  pages?: number;
  chars?: number;
  truncated?: boolean;
  onNotify: (email: string, kind: FailureKind) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const p = t.probar;
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

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

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onNotify(email.trim(), kind);
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <h3 className="font-display text-lg leading-tight">{title}</h3>
        <p className={hint}>{body}</p>
      </div>

      {/* Proof we actually read the file. A bare "sorry" tells the visitor
          nothing; the text does. */}
      {text && kind !== "no_text" && (
        <TextPreview
          text={text}
          pages={pages}
          chars={chars}
          truncated={truncated}
        />
      )}

      {saved ? (
        <p className={hint}>{p.notifySaved}</p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-1.5">
          <Field label={p.notifyLabel}>
            <div className="flex gap-2">
              <Input
                type="email"
                required
                placeholder={p.notifyPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" variant="outline" disabled={busy}>
                {p.notifyButton}
              </Button>
            </div>
          </Field>
          <span className={microLabel}>{p.notifyHelp}</span>
        </form>
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

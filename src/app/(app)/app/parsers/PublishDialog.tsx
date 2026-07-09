"use client";

import { useState } from "react";
import { Button, Label } from "@/components/ui";
import { FIELD_BASE } from "@/components/ui/styles";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";

const NOTE_MAX = 200;

/**
 * Publish-a-version dialog: a styled replacement for the old native prompt().
 * Collects the optional changelog note (persisted as parserVersions.note) with
 * the same 200-char limit the `publish` mutation enforces. Square corners, mono
 * eyebrow, hairline border — matches ConfirmDialog and the rest of the system.
 *
 * Mount conditionally; give it a `key` per parser so the note resets each open.
 */
export function PublishDialog({
  parserName,
  busy = false,
  onConfirm,
  onCancel,
}: {
  parserName: string;
  busy?: boolean;
  onConfirm: (note: string | undefined) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const tp = t.parsers;
  const [note, setNote] = useState("");
  const submit = () => {
    const trimmed = note.trim();
    onConfirm(trimmed.length ? trimmed : undefined);
  };
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-6">
      <div
        onClick={() => !busy && onCancel()}
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--ink)_28%,transparent)]"
      />
      <div className="relative w-[min(420px,92vw)] bg-card border border-line shadow-pop p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
          {parserName}
        </p>
        <h3 className="font-display font-semibold text-[19px] mt-2 tracking-tight">
          {tp.publishTitle}
        </h3>
        <p className="text-sm text-muted mt-2">{tp.publishSubtitle}</p>
        <div className="mt-5">
          <Label>{tp.publishNoteLabel}</Label>
          <textarea
            autoFocus
            rows={3}
            value={note}
            maxLength={NOTE_MAX}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            placeholder={tp.publishNotePlaceholder}
            className={cn(FIELD_BASE, "w-full resize-none")}
          />
          <p className="font-mono text-[10px] text-muted mt-1 text-right">
            {note.length}/{NOTE_MAX}
          </p>
        </div>
        <div className="flex gap-2 mt-4">
          <Button variant="solid" onClick={submit} disabled={busy}>
            {busy ? t.common.working : tp.publish}
          </Button>
          <Button
            variant="ghost"
            className="ml-auto"
            onClick={onCancel}
            disabled={busy}
          >
            {t.common.cancel}
          </Button>
        </div>
      </div>
    </div>
  );
}

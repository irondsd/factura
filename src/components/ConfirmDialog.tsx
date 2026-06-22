"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui";

/**
 * A destructive-action confirmation dialog. Square corners, mono eyebrow,
 * hairline border and a single accent — matches the rest of the design system.
 *
 * Rendered as a fixed full-viewport overlay; mount it conditionally on `open`.
 */
export function ConfirmDialog({
  open,
  eyebrow,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  busy = false,
  busyLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  busyLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-6">
      <div
        onClick={() => !busy && onCancel()}
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--ink)_28%,transparent)]"
      />
      <div className="relative w-[min(360px,92vw)] bg-card border border-line shadow-pop p-6">
        {eyebrow && (
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
            {eyebrow}
          </p>
        )}
        <h3 className="font-display font-semibold text-[19px] mt-2 tracking-tight">
          {title}
        </h3>
        {description && (
          <p className="text-sm text-muted mt-2">{description}</p>
        )}
        <div className="flex gap-2 mt-5">
          <Button variant="solid" onClick={onConfirm} disabled={busy}>
            {busy ? (busyLabel ?? "Working…") : confirmLabel}
          </Button>
          <Button
            variant="ghost"
            className="ml-auto"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

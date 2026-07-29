"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { microLabel } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";

/** The overlay both /probar dialogs sit in: the extracted text and the "you read
 * this wrong" report.
 *
 * Portalled to `document.body` so a card's `overflow-hidden` can't clip it, and
 * closed by Escape as well as the backdrop — a dialog that only closes via a
 * small ✕ traps anyone driving the page from the keyboard. Focus moves into the
 * panel on open and returns to the trigger on close, because the trigger is a
 * link inside a long list of cards and losing your place in it is disorienting.
 *
 * Not a native <dialog>: `showModal()` needs an imperative call after mount and
 * its ::backdrop can't take the paper-and-ink treatment the rest of the page
 * uses. */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  width = 560,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Max panel width in px; the text dialog is wider than the report form. */
  width?: number;
}) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    // The page behind is a scrolling list of bills; letting it scroll under the
    // overlay makes the dialog feel detached from the card it belongs to.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      opener?.focus?.();
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop is its own layer, so its click-to-close needs no
          stopPropagation on the panel. */}
      <button
        type="button"
        aria-label={t.probar.close}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[color-mix(in_srgb,var(--ink)_30%,transparent)]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ width: `min(${width}px, 94vw)` }}
        className={cn(
          "receipt-edge relative flex max-h-[86vh] flex-col gap-3.5 overflow-auto",
          "bg-card border border-line px-5 pt-5 pb-9 sm:px-6 sm:pt-6 sm:pb-11",
          "shadow-[0_18px_50px_rgba(33,29,22,0.3)] outline-none",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 className="font-display text-xl leading-tight">{title}</h2>
            {subtitle && <span className={microLabel}>{subtitle}</span>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.probar.close}
            className="-mt-1 -mr-1 cursor-pointer p-1 font-mono text-sm text-muted transition-colors hover:text-accent"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

"use client";

import { type ReactNode, useState } from "react";
import { cn } from "@/lib/cn";

/** The sliding right-hand drawer chrome: dimmed overlay + panel with a 240ms
 * open/close transition. Owns only the animation; the body is supplied by the
 * caller via a render prop that receives an animated `close()`.
 *
 * `openKey` is the open signal (the bill id) — when it flips from null to a
 * value the panel resets to its open position, so reopening the *same* bill
 * (whose data is cached) still animates in rather than staying off-screen. */
export function BillDrawerShell({
  openKey,
  onClose,
  children,
}: {
  openKey: string | null;
  onClose: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const [closing, setClosing] = useState(false);
  const [openedKey, setOpenedKey] = useState<string | null>(null);

  if (openKey && openKey !== openedKey) {
    setOpenedKey(openKey);
    setClosing(false);
  } else if (!openKey && openedKey) {
    setOpenedKey(null);
  }

  if (!openKey) return null;

  const close = () => {
    setClosing(true);
    setTimeout(onClose, 240);
  };

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div
        onClick={close}
        className={cn(
          "absolute inset-0 bg-[color-mix(in_srgb,var(--ink)_28%,transparent)] transition-opacity duration-[240ms]",
          closing ? "opacity-0" : "opacity-100",
        )}
      />
      <div
        className={cn(
          "relative w-[min(460px,92vw)] h-full bg-card border-l border-line shadow-pop overflow-y-auto transition-transform duration-[240ms] ease-[cubic-bezier(0.2,0,0.2,1)]",
          closing ? "translate-x-full" : "translate-x-0",
        )}
      >
        {children(close)}
      </div>
    </div>
  );
}

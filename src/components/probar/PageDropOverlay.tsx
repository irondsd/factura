"use client";

import { useT } from "@/i18n/I18nProvider";

/** Full-screen drop affordance for /probar. While a file is over the page,
 * the whole viewport becomes the target — the bordered box below is only where
 * the eye lands, not the only place a drop is accepted. `pointer-events-none`
 * so the overlay never eats the drag it's advertising; the window listeners in
 * useWindowFileDrop are what actually receive the drop. */
export function PageDropOverlay({ active }: { active: boolean }) {
  const t = useT("probar");
  const p = t;

  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-paper/92 p-6">
      <div className="flex flex-col items-center gap-3 border-2 border-dashed border-accent px-10 py-14 text-center sm:px-20">
        <p className="font-display text-3xl font-semibold leading-none">
          {p.dropTitle}
        </p>
        <p className="font-mono text-[11px] uppercase tracking-label-wide text-muted">
          {p.dropOverlayHint}
        </p>
      </div>
    </div>
  );
}

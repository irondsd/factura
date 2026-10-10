"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

// The task screens' receipt toast. Mounted by the tasks layout rather than by a
// page, so it survives the navigation some actions end with — discarding a task
// returns to the board and says so there.
//
// Not `@/providers/ToastProvider`: that one reads its labels through `useT`,
// and the CMS has no I18n provider on purpose (cms.md).

export type TaskToastKind = "ok" | "warn" | "error";
type Show = (text: string, kind?: TaskToastKind) => void;

const ToastContext = createContext<Show>(() => {});

export function useTaskToast(): Show {
  return useContext(ToastContext);
}

const BORDER: Record<TaskToastKind, string> = {
  ok: "border-line",
  warn: "border-[var(--accent-line)]",
  error: "border-accent",
};
const GLYPH: Record<TaskToastKind, string | null> = {
  ok: null,
  warn: "△",
  error: "✕",
};

export function TaskToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{
    id: number;
    text: string;
    kind: TaskToastKind;
  } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback<Show>((text, kind = "ok") => {
    window.clearTimeout(timer.current);
    setToast({ id: Date.now(), text, kind });
    // Errors stay long enough to be read twice.
    timer.current = window.setTimeout(
      () => setToast(null),
      kind === "error" ? 6000 : 2600,
    );
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-[60] sm:right-6 sm:bottom-6"
      >
        {toast && (
          <div
            key={toast.id}
            className={cn(
              "receipt-edge max-w-[min(360px,calc(100vw-32px))] border bg-card px-4 pt-3 pb-5 font-mono text-sm text-ink shadow-pop animate-[fd-toast-in_.15s_ease-out]",
              BORDER[toast.kind],
            )}
          >
            {GLYPH[toast.kind] && (
              <span className="mr-1.5 text-accent" aria-hidden="true">
                {GLYPH[toast.kind]}
              </span>
            )}
            {toast.text}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

"use client";

import Link from "next/link";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { Button } from "@/components/ui";
import { useT } from "@/i18n/I18nProvider";

/** An optional "go look at this" link on a toast. Exists for outcomes the user
 * can't act on from where they are — a bill that landed in the review queue is
 * announced here and then lives on a page they may not have open. */
export type ToastAction = { href: string; label: string };

type Toast = { id: string; text: string; action?: ToastAction };

type ToastApi = {
  /** Show a transient bottom-right toast. */
  showToast: (text: string, action?: ToastAction) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** Primitive toast access. Most call sites should use the richer `useToast`
 * helper in `@/lib/toast` instead. */
export function useToasts(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToasts must be used within <ToastProvider>");
  return ctx;
}

/** Owns the toast queue and renders the bottom-right toast region. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useT("common");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const showToast = useCallback(
    (text: string, action?: ToastAction) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, text, action }]);
      // An actionable toast has to survive being read *and* aimed at, which the
      // 4s a plain notice gets isn't enough for.
      setTimeout(() => dismiss(id), action ? 9000 : 4000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed right-4 bottom-4 z-[80] flex w-[300px] flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="receipt-edge bg-card border border-line pt-3 px-4 pb-5 font-mono text-sm shadow-pop animate-[fd-toast-in_180ms_cubic-bezier(0.2,0,0.2,1)] flex items-start gap-3"
            >
              <span className="flex-1">
                {toast.text}
                {toast.action && (
                  <Link
                    href={toast.action.href}
                    onClick={() => dismiss(toast.id)}
                    className="mt-1.5 block text-accent underline decoration-dotted underline-offset-4"
                  >
                    {toast.action.label}
                  </Link>
                )}
              </span>
              <Button
                type="button"
                variant="icon"
                onClick={() => dismiss(toast.id)}
                aria-label={t.close}
                className="-mt-0.5"
              >
                ✕
              </Button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

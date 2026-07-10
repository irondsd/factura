"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { useI18n } from "@/i18n/I18nProvider";

type Toast = { id: string; text: string };

type ToastApi = {
  /** Show a transient bottom-right toast. */
  showToast: (text: string) => void;
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
  const { t } = useI18n();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const showToast = useCallback(
    (text: string) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, text }]);
      setTimeout(() => dismiss(id), 4000);
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
              <span className="flex-1">{toast.text}</span>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label={t.billDrawer.close}
                className="bg-transparent border-none cursor-pointer text-muted text-base leading-none transition-colors hover:text-accent -mt-0.5"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

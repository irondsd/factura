"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

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
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((text: string) => {
    const id = crypto.randomUUID();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed right-4 bottom-4 z-[80] flex w-[300px] flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="receipt-edge bg-card border border-line pt-3 px-4 pb-5 font-mono text-sm shadow-pop animate-[fd-toast-in_180ms_cubic-bezier(0.2,0,0.2,1)]"
            >
              {t.text}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

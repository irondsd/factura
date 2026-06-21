"use client";

import { signIn, useSession } from "next-auth/react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { BillDrawer } from "@/components/BillDrawer";
import { DropOverlay } from "@/components/DropOverlay";
import { AppContext } from "./context";
import { TopBar } from "./TopBar";
import { Welcome } from "./Welcome";

type Toast = { id: string; text: string };

/** Auth gate + chrome for every page: shows the Welcome/Google screen when
 * signed out, otherwise the top bar, the shared property filter, the global
 * bill-editor drawer, and a toast region. */
export function AppShell({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();

  const [propertyId, setPropertyId] = useState<string | undefined>(undefined);
  const [openBillId, setOpenBillId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((text: string) => {
    const id = crypto.randomUUID();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const value = useMemo(
    () => ({
      propertyId,
      setPropertyId,
      openBill: setOpenBillId,
      showToast,
    }),
    [propertyId, showToast],
  );

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center font-mono text-xs uppercase tracking-label-wide text-muted">
        Reading the fine print…
      </div>
    );
  }

  if (!session?.user) {
    return <Welcome onLogin={() => signIn("google")} />;
  }

  return (
    <AppContext.Provider value={value}>
      <TopBar user={session.user} />
      <main className="w-full">{children}</main>
      <DropOverlay onToast={showToast} />
      <BillDrawer
        billId={openBillId}
        onClose={() => setOpenBillId(null)}
        onToast={showToast}
      />
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
    </AppContext.Provider>
  );
}

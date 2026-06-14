"use client";

import { signIn, useSession } from "next-auth/react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { BillDrawer } from "@/components/BillDrawer";
import { DropOverlay } from "@/components/DropOverlay";
import { AppContext, type Currency } from "./context";
import { TopBar } from "./TopBar";
import { Welcome } from "./Welcome";

type Toast = { id: string; text: string };

/** Auth gate + chrome for every page: shows the Welcome/Google screen when
 * signed out, otherwise the top bar, the shared property/currency filters, the
 * global bill-editor drawer, and a toast region. */
export function AppShell({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();

  const [propertyId, setPropertyId] = useState<string | undefined>(undefined);
  const [currency, setCurrency] = useState<Currency>("ARS");
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
      currency,
      setPropertyId,
      setCurrency,
      openBill: setOpenBillId,
      showToast,
    }),
    [propertyId, currency, showToast],
  );

  if (status === "loading") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.2em",
          color: "var(--muted)",
        }}
      >
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
      {children}
      <DropOverlay onToast={showToast} />
      <BillDrawer
        billId={openBillId}
        onClose={() => setOpenBillId(null)}
        onToast={showToast}
      />
      {toasts.length > 0 && (
        <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 80, display: "flex", flexDirection: "column", gap: 8, width: 300 }}>
          {toasts.map((t) => (
            <div
              key={t.id}
              className="receipt-edge"
              style={{
                background: "var(--card)",
                border: "1px solid var(--line)",
                padding: "12px 16px 20px",
                fontFamily: "var(--font-mono)",
                fontSize: 14,
                boxShadow: "var(--shadow-pop)",
                animation: "fd-toast-in 180ms cubic-bezier(0.2,0,0.2,1)",
              }}
            >
              {t.text}
            </div>
          ))}
        </div>
      )}
    </AppContext.Provider>
  );
}

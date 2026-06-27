"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { AppContext } from "@/components/app/context";
import { TopBar } from "@/components/app/TopBar";
import { DropOverlay } from "@/components/DropOverlay";
import { useI18n } from "@/i18n/I18nProvider";

/** Auth gate + chrome for the signed-in app: bounces signed-out visitors to
 * /login, otherwise renders the top bar, the shared property filter, and the
 * global drag-to-ingest overlay. Toasts live in the root <ToastProvider>; the
 * bill-editor drawer is owned by the bills page. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useI18n();

  const [propertyId, setPropertyId] = useState<string | undefined>(undefined);

  const value = useMemo(() => ({ propertyId, setPropertyId }), [propertyId]);

  // Signed out → leave the app for the public login flow.
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status === "loading" || status === "unauthenticated" || !session?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center font-mono text-xs uppercase tracking-label-wide text-muted">
        {t.app.loading}
      </div>
    );
  }

  return (
    <AppContext.Provider value={value}>
      <TopBar user={session.user} />
      <main className="w-full">{children}</main>
      <DropOverlay />
    </AppContext.Provider>
  );
}

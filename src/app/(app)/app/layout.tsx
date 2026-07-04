"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import posthog from "posthog-js";
import { AppContext } from "@/components/app/context";
import { AppFooter } from "@/components/app/AppFooter";
import { TopBar } from "@/components/app/TopBar";
import { BillIngestProvider } from "@/components/BillIngestProvider";
import { DropOverlay } from "@/components/DropOverlay";
import { UploadFab } from "@/components/UploadFab";
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

  // Identify the user in PostHog once the session is known.
  useEffect(() => {
    if (status === "authenticated" && session?.user?.email) {
      posthog.identify(session.user.email, {
        email: session.user.email,
        name: session.user.name ?? undefined,
      });
    }
  }, [status, session]);

  if (status === "loading" || status === "unauthenticated" || !session?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center font-mono text-xs uppercase tracking-label-wide text-muted">
        {t.app.loading}
      </div>
    );
  }

  return (
    <AppContext.Provider value={value}>
      <BillIngestProvider>
        <div className="flex min-h-screen flex-col">
          <TopBar user={session.user} />
          <main className="w-full flex-1">{children}</main>
          <AppFooter />
        </div>
        <DropOverlay />
        <UploadFab />
      </BillIngestProvider>
    </AppContext.Provider>
  );
}

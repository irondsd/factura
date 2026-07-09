"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Session } from "next-auth";
import { useSession } from "next-auth/react";
import {
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import posthog from "posthog-js";
import { AppContext } from "@/components/app/context";
import { AppFooter } from "@/components/app/AppFooter";
import { TopBar } from "@/components/app/TopBar";
import { BillIngestProvider } from "@/components/BillIngestProvider";
import { DropOverlay } from "@/components/DropOverlay";
import { UploadFab } from "@/components/UploadFab";
import { useI18n } from "@/i18n/I18nProvider";
import { trpc } from "@/lib/trpc";

/** Query-string key holding the selected property's nickname. Absent = "All". */
const PROPERTY_PARAM = "property";

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center font-mono text-xs uppercase tracking-label-wide text-muted">
      {label}
    </div>
  );
}

/** Chrome for the signed-in app. The selected property lives in the URL
 * (`?property=<nickname>`, omitted for "All") so it survives refresh and is
 * shareable; the TopBar links carry it forward across the filtered pages.
 * Reads `useSearchParams`, so it sits under a <Suspense> boundary. */
function AppShell({
  user,
  children,
}: {
  user: Session["user"];
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const properties = trpc.properties.list.useQuery();

  // Resolve the nickname in the URL to a property id (the shape consumers
  // expect). Unknown/stale names fall back to "All".
  const rawParam = searchParams.get(PROPERTY_PARAM)?.trim() || undefined;
  const propertyId = useMemo(() => {
    if (!rawParam) return undefined;
    const match = properties.data?.find(
      (p) => p.nickname.toLowerCase() === rawParam.toLowerCase(),
    );
    return match?.id;
  }, [rawParam, properties.data]);

  const setPropertyId = useCallback(
    (id?: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const nickname = id
        ? properties.data?.find((p) => p.id === id)?.nickname
        : undefined;
      if (nickname) params.set(PROPERTY_PARAM, nickname.toLowerCase());
      else params.delete(PROPERTY_PARAM);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, properties.data, router, pathname],
  );

  const value = useMemo(
    () => ({ propertyId, setPropertyId }),
    [propertyId, setPropertyId],
  );

  return (
    <AppContext.Provider value={value}>
      <BillIngestProvider>
        <div className="flex min-h-screen flex-col">
          <TopBar user={user} />
          <main className="w-full flex-1">{children}</main>
          <AppFooter />
        </div>
        <DropOverlay />
        <UploadFab />
      </BillIngestProvider>
    </AppContext.Provider>
  );
}

/** Auth gate for the signed-in app: bounces signed-out visitors to /login,
 * otherwise renders the app chrome. Toasts live in the root <ToastProvider>;
 * the bill-editor drawer is owned by the bills page. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useI18n();

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
    return <LoadingScreen label={t.app.loading} />;
  }

  return (
    <Suspense fallback={<LoadingScreen label={t.app.loading} />}>
      <AppShell user={session.user}>{children}</AppShell>
    </Suspense>
  );
}

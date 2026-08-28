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
import { BillIngestProvider } from "@/components/BillIngestProvider";
import { DropOverlay } from "@/components/DropOverlay";
import { UploadFab } from "@/components/UploadFab";
import { useT } from "@/i18n/I18nProvider";
import { loginHref } from "@/lib/nextPath";
import { trpc } from "@/lib/trpc";
import { AppFooter } from "./AppFooter";
import { ClaimSubmissions } from "./ClaimSubmissions";
import { AppContext } from "./context";
import { DisplayModeProbe } from "./DisplayModeProbe";
import { ShareTargetReceiver } from "./ShareTargetReceiver";
import { TopBar } from "./TopBar";

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
function AppChrome({
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

  // A name can only be resolved once the list is here. Until then the choice is
  // unknown — consumers that treat `undefined` as "All" would otherwise load
  // and paint every property before the real selection arrives.
  const propertyReady = !rawParam || properties.data !== undefined;

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
    () => ({ propertyId, propertyReady, setPropertyId }),
    [propertyId, propertyReady, setPropertyId],
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
        <ClaimSubmissions />
        <DisplayModeProbe />
        <ShareTargetReceiver />
      </BillIngestProvider>
    </AppContext.Provider>
  );
}

/** Auth gate for the signed-in app: bounces signed-out visitors to /login,
 * otherwise renders the app chrome. Toasts live in the root <ToastProvider>;
 * the bill-editor drawer is owned by the bills page.
 *
 * A component rather than the `/app` layout itself: the layout has to stay a
 * server module so the segment can export `generateMetadata` (a "use client"
 * file can't), and everything below needs the session, the router and tRPC. */
export function AppShell({
  initialUser,
  children,
}: {
  initialUser: Session["user"] | null;
  children: ReactNode;
}) {
  const { data: session, status: clientStatus } = useSession();
  const router = useRouter();
  const t = useT("app");
  const user = initialUser ?? session?.user;
  const status = initialUser ? "authenticated" : clientStatus;

  // Signed out → leave the app for the public login flow, carrying the page
  // that was asked for so signing in returns to it. Without this, a shared
  // /app/bills?property=depto link — or a share-target hand-off — quietly
  // becomes "/app" the moment it passes through sign-in. Read from `location`
  // rather than useSearchParams: this runs on the client only, and the hook
  // would drag a Suspense boundary up around the whole app shell.
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(
        loginHref(window.location.pathname + window.location.search),
      );
    }
  }, [status, router]);

  // Identify the user in PostHog once the session is known.
  useEffect(() => {
    if (status === "authenticated" && user?.email) {
      posthog.identify(user.email, {
        email: user.email,
        name: user.name ?? undefined,
      });
    }
  }, [status, user]);

  if (status === "loading" || status === "unauthenticated" || !user) {
    return <LoadingScreen label={t.loading} />;
  }

  return (
    <Suspense fallback={<LoadingScreen label={t.loading} />}>
      <AppChrome user={user}>{children}</AppChrome>
    </Suspense>
  );
}

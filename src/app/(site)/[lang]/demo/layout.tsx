import type { ReactNode } from "react";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { DemoTopBar } from "@/components/demo/DemoTopBar";
import { SiteFooter } from "@/components/landing/Footer";
import { toLocale } from "@/i18n/config";
import { I18nProvider } from "@/i18n/I18nProvider";
import { pickNamespaces } from "@/i18n/namespaces";
import { getI18n } from "@/i18n/server";

// Public, indexable demo of the signed-in app rendered on static sample data.
// Deliberately NOT under the /app auth gate — no session, no DB, no tRPC — so
// search engines and visitors can explore the product without signing in.
export default async function DemoLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const locale = toLocale((await params).lang);
  const { t } = await getI18n(locale);
  return (
    // The demo reuses the signed-in app's screens, so it needs the app's copy
    // — but only on these three routes, not on the ~180 others below the same
    // `[lang]` layout.
    <I18nProvider
      locale={locale}
      dictionary={pickNamespaces(t, [
        "billDrawer",
        "bills",
        "charts",
        "insights",
        "months",
        "nav",
        "overview",
      ])}
    >
      <DemoTopBar />
      <DemoBanner locale={locale} />
      <main className="w-full">{children}</main>
      <SiteFooter locale={locale} />
    </I18nProvider>
  );
}

import type { ReactNode } from "react";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { DemoTopBar } from "@/components/demo/DemoTopBar";
import { SiteFooter } from "@/components/landing/Footer";
import { toLocale } from "@/i18n/config";

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
  return (
    <>
      <DemoTopBar />
      <DemoBanner locale={locale} />
      <main className="w-full">{children}</main>
      <SiteFooter locale={locale} />
    </>
  );
}

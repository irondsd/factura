import "../globals.css";
import type { Metadata } from "next";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { fraunces, plexMono } from "@/config/fonts";
import { viewport } from "@/config/meta";
import { getDictionary } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/I18nProvider";
import { getLocale } from "@/i18n/server";
import { privateMetadata } from "@/lib/seo";
import { Providers } from "@/providers/Providers";

export { viewport };

// Nothing in this subtree belongs in a search index: it's the signed-in app and
// the sign-in flow. `privateMetadata` says so in the markup (robots.txt can only
// stop the crawl, not the indexing) and leaves out the canonical, which every
// one of these routes used to inherit from the homepage. Individual pages add
// their own title; see `appPageMetadata`.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  return privateMetadata({
    locale,
    title: t.meta.home.title,
    description: t.meta.home.description,
  });
}

// Root layout for the signed-in app + auth (`/app/*`, `/login`). This subtree is
// dynamic and cookie-driven: the locale comes from `NEXT_LOCALE`, not the URL.
// The public landing has its own static, `[lang]`-driven root layout.
export default async function AppRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const dictionary = await getDictionary(locale);

  return (
    <html
      lang={locale}
      className={`${fraunces.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* The whole dictionary, unlike the public site: every route under
            here is `force-dynamic`, so this payload is rendered per request and
            never stored, and the app's screens between them read most of the
            file anyway. */}
        <I18nProvider locale={locale} dictionary={dictionary}>
          <Providers>{children}</Providers>
        </I18nProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}

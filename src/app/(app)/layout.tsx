import "../globals.css";
import type { Metadata } from "next";
import { fraunces, plexMono } from "@/config/fonts";
import { viewport } from "@/config/meta";
import { getDictionary } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/I18nProvider";
import { getLocale } from "@/i18n/server";
import { privateMetadata } from "@/lib/seo";
import { Providers } from "@/providers/Providers";

export { viewport };

// The remaining route in this subtree is the sign-in flow. It has no search
// value, so it stays noindex and deliberately has no canonical URL.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  return privateMetadata({
    locale,
    title: t.meta.home.title,
    description: t.meta.home.description,
  });
}

// Root layout for `/login`. It remains on the marketing origin because this
// deployment owns Auth.js and the shared session cookie.
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
        <I18nProvider locale={locale} dictionary={dictionary}>
          <Providers>{children}</Providers>
        </I18nProvider>
      </body>
    </html>
  );
}

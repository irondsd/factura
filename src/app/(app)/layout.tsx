import "../globals.css";
import { fraunces, plexMono } from "@/config/fonts";
import { metadata, viewport } from "@/config/meta";
import { getDictionary } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/I18nProvider";
import { getLocale } from "@/i18n/server";
import { Providers } from "@/providers/Providers";

export { metadata, viewport };

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
        <I18nProvider locale={locale} dictionary={dictionary}>
          <Providers>{children}</Providers>
        </I18nProvider>
      </body>
    </html>
  );
}

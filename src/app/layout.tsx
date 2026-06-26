import { Providers } from "@/providers/Providers";
import "./globals.css";
import { fraunces, plexMono } from "../config/fonts";
import { metadata, viewport } from "../config/meta";
import { getDictionary } from "../i18n/dictionaries";
import { I18nProvider } from "../i18n/I18nProvider";
import { getLocale } from "../i18n/server";

export { metadata, viewport };

export default async function RootLayout({
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
        <Providers>
          <I18nProvider locale={locale} dictionary={dictionary}>
            {children}
          </I18nProvider>
        </Providers>
      </body>
    </html>
  );
}

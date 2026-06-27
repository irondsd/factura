import "../../globals.css";
import { notFound } from "next/navigation";
import { LangSuggestBanner } from "@/components/landing/LangSuggestBanner";
import { fraunces, plexMono } from "@/config/fonts";
import { metadata, viewport } from "@/config/meta";
import { isLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/I18nProvider";
import { ToastProvider } from "@/providers/ToastProvider";

// Base metadata (metadataBase, title template, OG defaults, robots, icons). Each
// landing page refines title/description/canonical/hreflang via generateMetadata.
export { metadata, viewport };

// Pre-render both locales: /es/* and /en/* are static. The proxy serves the
// Spanish pages at the bare paths (/, /faq, …) and redirects /es/* away.
export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

// Root layout for the public, statically-generated landing. The locale comes
// from the `[lang]` route segment (no cookie/header read), so these routes stay
// in the SSG path. The demo (which reuses the app's Bills/Insights views) needs
// the ToastProvider; it uses static fixtures, so no session/tRPC providers.
export default async function LandingRootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dictionary = await getDictionary(lang);

  return (
    <html
      lang={lang}
      className={`${fraunces.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <I18nProvider locale={lang} dictionary={dictionary}>
          <ToastProvider>
            {children}
            <LangSuggestBanner />
          </ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

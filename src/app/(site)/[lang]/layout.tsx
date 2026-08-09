import "../../globals.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LangSuggestBanner } from "@/components/landing/LangSuggestBanner";
import { JsonLd } from "@/components/seo/JsonLd";
import { fraunces, plexMono } from "@/config/fonts";
import { baseMetadata, viewport } from "@/config/meta";
import { isLocale, locales, toLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/I18nProvider";
import { siteLd } from "@/i18n/structuredData";
import { ToastProvider } from "@/providers/ToastProvider";

export { viewport };

// Base metadata (metadataBase, title template, OG defaults, robots, icons) in
// the language of the route, so a page that sets no metadata of its own — a 404
// under /en, say — doesn't answer in the wrong one. Every real landing page
// refines title/description/canonical/hreflang via its own generateMetadata.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const locale = toLocale((await params).lang);
  const t = await getDictionary(locale);
  return baseMetadata({
    locale,
    title: t.meta.home.title,
    description: t.meta.home.description,
  });
}

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
      // Hash links glide to their section instead of teleporting — the guide
      // table of contents, mostly. The attribute does double duty: it's the
      // hook the CSS in globals.css matches on (so the `(app)` layout keeps the
      // instant default), and it's what tells Next 16 to suspend smooth
      // scrolling for the duration of a route change. Without it, every
      // navigation would animate its jump to the top. See the "Scroll Behavior
      // Override" note in next/dist/docs/…/upgrading/version-16.md.
      data-scroll-behavior="smooth"
      className={`${fraunces.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <JsonLd data={siteLd(lang)} />
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

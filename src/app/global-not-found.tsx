import "./globals.css";
import type { Metadata } from "next";
import { NotFoundScreen } from "@/components/NotFoundScreen";
import { fraunces, plexMono } from "@/config/fonts";
import { siteName } from "@/config/meta";
import { getDictionary } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/I18nProvider";
import { getLocale } from "@/i18n/server";

// The 404 for a URL that matches no route at all — the broken inbound link, the
// guide slug that no longer exists, a mistyped /app path. Every one of those
// used to get Next's built-in grey "404: This page could not be found".
//
// It has to be this file rather than a plain `not-found.tsx` at the app root.
// The two route groups each own a root layout, so there is no single layout a
// root 404 could compose itself from, and an unmatched URL never reaches the
// `[lang]` subtree's own `not-found.tsx` — it isn't a `notFound()` inside a
// segment, it's a route miss. `global-not-found` is exactly the escape hatch
// the Next docs point at for a project shaped like this one (multiple root
// layouts, a top-level dynamic segment); it's behind `experimental.globalNotFound`
// in next.config.ts, and rendering it means rendering a whole document — the
// stylesheet, the fonts and the i18n provider that a layout would normally give.
//
// The locale is the NEXT_LOCALE cookie, which the proxy keeps pointed at the
// language the visitor is actually browsing. A first-ever request straight to a
// bad /en URL has no cookie yet and gets Spanish; that's the site default, and
// it's the right trade for not making this page guess.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary(await getLocale());
  return {
    // Absolute: there's no root layout here, so there's no title template to
    // append the brand — this spells it out instead.
    title: `${t.notFound.title} — ${siteName}`,
    description: t.notFound.body,
    robots: { index: false, follow: false },
  };
}

export default async function GlobalNotFound() {
  const locale = await getLocale();
  const dictionary = await getDictionary(locale);

  return (
    <html
      lang={locale}
      className={`${fraunces.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <I18nProvider locale={locale} dictionary={dictionary}>
          <NotFoundScreen />
        </I18nProvider>
      </body>
    </html>
  );
}

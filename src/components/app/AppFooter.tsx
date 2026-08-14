"use client";

import Link from "next/link";
import { NAV_LINK, NEW_TAB, Wordmark } from "@/components/landing/parts";
import { githubUrl } from "@/config/urls";
import { useI18n } from "@/i18n/I18nProvider";
import { localizedHref } from "@/i18n/routing";

// Footer for the signed-in app: the wordmark, then a quiet row of links back
// out to the public site. Cut down from <SiteFooter/> rather than styled apart
// from it — same NAV_LINK dress, one row instead of three titled columns,
// because this is a way out of the app, not a map of the site.
//
// Every link opens in a new tab. Someone in /app is in the middle of something
// (a drawer open, a filter set, a bill half-reviewed); reading a guide or the
// contact page shouldn't cost them that.
export function AppFooter() {
  const { t, locale } = useI18n();

  const links = [
    { label: t.nav.home, href: localizedHref("/", locale) },
    // Canonical `/guias`, not localized: the guides only exist in Spanish, and
    // `/en/guias` 404s. Same reason Estadísticas is Spanish-only below — but
    // that section is a wall of Argentine data rather than an article, so it
    // isn't worth offering to an English reader at all.
    { label: t.nav.guides, href: "/guias" },
    ...(locale === "es" ? [{ label: t.nav.stats, href: "/estadisticas" }] : []),
    { label: t.nav.contact, href: localizedHref("/contacto", locale) },
    { label: t.nav.github, href: githubUrl },
  ];

  return (
    <footer className="border-t border-line py-5 px-5">
      <div className="mx-auto flex max-w-[64rem] flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <Wordmark size={15} />
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={NAV_LINK}
              {...NEW_TAB}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

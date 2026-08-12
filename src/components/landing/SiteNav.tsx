import Link from "next/link";
import { MobileMenu } from "@/components/landing/MobileMenu";
import { NAV_LINK } from "@/components/landing/parts";
import { githubUrl } from "@/config/urls";
import type { Dictionary, Locale } from "@/i18n/config";
import { localizedHref } from "@/i18n/routing";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/cn";

export type NavLink = { label: string; href: string };

// Single source of truth for the marketing nav: which links exist, in what
// order, and the one piece of locale logic — Guías and Estadísticas are
// Spanish-only, because those two sections themselves only exist in Spanish.
//
// `signIn` is returned separately because the header treats it differently: it
// stays visible on mobile in the bar while the rest collapse behind the burger.
// (The footer has its own map — see `siteFooterColumns` below.)
//
// hrefs are canonical (unlocalized) so `active` matching works; <SiteNav/> and
// callers localize them at render time via `localizedHref`.
export function siteNavLinks(
  t: Dictionary,
  locale: Locale,
): { links: NavLink[]; signIn: NavLink } {
  return {
    links: [
      { label: t.nav.try, href: "/probar" },
      { label: t.nav.docs, href: "/docs" },
      { label: t.nav.faq, href: "/faq" },
      { label: t.nav.demo, href: "/demo" },
      ...(locale === "es"
        ? [
            { label: t.nav.guides, href: "/guias" },
            { label: t.nav.stats, href: "/estadisticas" },
          ]
        : []),
    ],
    signIn: { label: t.nav.signIn, href: "/login" },
  };
}

// The footer's own map of the site. The top nav is one row of the product's
// main pages; the footer is the full index, which by now is more links than a
// single wrapped row can present — hence three titled columns.
//
// The headings are labels, not links: a column head that navigates somewhere
// competes with the links under it, and two of these three groups have no page
// of their own to point at anyway.
//
// Same locale rule as the top nav: Guías and Estadísticas exist only in Spanish.
// hrefs stay canonical (unlocalized); the footer localizes them at render time.
export function siteFooterColumns(
  t: Dictionary,
  locale: Locale,
): { label: string; links: NavLink[] }[] {
  return [
    {
      label: t.siteChrome.footerProduct,
      links: [
        { label: t.nav.try, href: "/probar" },
        { label: t.nav.demo, href: "/demo" },
        { label: t.nav.docs, href: "/docs" },
        { label: t.nav.signIn, href: "/login" },
      ],
    },
    {
      label: t.siteChrome.footerLearn,
      links: [
        ...(locale === "es"
          ? [
              { label: t.nav.guides, href: "/guias" },
              { label: t.nav.stats, href: "/estadisticas" },
            ]
          : []),
        { label: t.nav.faq, href: "/faq" },
        { label: t.nav.glossary, href: "/glosario" },
      ],
    },
    {
      label: t.siteChrome.footerCompany,
      links: [
        { label: t.nav.contact, href: "/contacto" },
        { label: t.nav.privacy, href: "/privacy" },
        { label: t.nav.security, href: "/security" },
        { label: t.nav.github, href: githubUrl },
      ],
    },
  ];
}

const ACTIVE_LINK =
  "text-accent underline decoration-dotted underline-offset-[5px]";

// The marketing nav links, in two dresses:
//
// - `bar` (inside <SiteHeader/> on sub-pages): a full nav row from `sm:` up; on
//   mobile only Sign in stays, the rest collapse behind the burger.
// - `inline` (the landing page, which has no header on purpose): one quiet
//   centered row of micro links, every link visible at every width — no bar, no
//   burger, nothing to compete with the hero.
export async function SiteNav({
  locale,
  active,
  variant = "bar",
  className,
}: {
  locale: Locale;
  active?: string;
  variant?: "bar" | "inline";
  className?: string;
}) {
  const { t } = await getI18n(locale);
  const { links, signIn } = siteNavLinks(t, locale);
  const all = [...links, signIn];

  if (variant === "inline") {
    return (
      <nav
        className={cn(
          "flex flex-wrap items-center justify-center gap-x-5 gap-y-2.5",
          className,
        )}
      >
        {all.map((link) => (
          <Link
            key={link.href}
            href={localizedHref(link.href, locale)}
            className={cn(NAV_LINK, link.href === active && ACTIVE_LINK)}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <>
      {/* Desktop: full nav row. */}
      <nav className={cn("hidden items-center gap-[26px] sm:flex", className)}>
        {all.map((link) => (
          <Link
            key={link.href}
            href={localizedHref(link.href, locale)}
            className={cn(NAV_LINK, link.href === active && ACTIVE_LINK)}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Mobile: Sign in stays, everything else behind the burger. */}
      <div className="flex items-center gap-4 sm:hidden">
        <Link href={localizedHref(signIn.href, locale)} className={NAV_LINK}>
          {signIn.label}
        </Link>
        <MobileMenu
          links={links.map((link) => ({
            label: link.label,
            href: localizedHref(link.href, locale),
            active: link.href === active,
          }))}
        />
      </div>
    </>
  );
}

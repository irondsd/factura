import Link from "next/link";
import { MobileMenu } from "@/components/landing/MobileMenu";
import { NAV_LINK } from "@/components/landing/parts";
import type { Dictionary, Locale } from "@/i18n/config";
import { localizedHref } from "@/i18n/routing";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/cn";

export type NavLink = { label: string; href: string };

// Single source of truth for the marketing nav: which links exist, in what
// order, and the one piece of locale logic — Guías is Spanish-only, because the
// guides section itself only exists in Spanish.
//
// `signIn` is returned separately because it is treated differently everywhere:
// it stays visible on mobile in the header bar, and it sits last (after the
// legal links) in the landing footer.
//
// hrefs are canonical (unlocalized) so `active` matching works; <SiteNav/> and
// callers localize them at render time via `localizedHref`.
export function siteNavLinks(
  t: Dictionary,
  locale: Locale,
): { links: NavLink[]; signIn: NavLink } {
  return {
    links: [
      { label: t.nav.docs, href: "/docs" },
      { label: t.nav.faq, href: "/faq" },
      { label: t.nav.demo, href: "/demo" },
      ...(locale === "es" ? [{ label: t.nav.guides, href: "/guias" }] : []),
    ],
    signIn: { label: t.nav.signIn, href: "/login" },
  };
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

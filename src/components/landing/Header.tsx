import Link from "next/link";
import { MobileMenu } from "@/components/landing/MobileMenu";
import { NAV_LINK, SHELL, Wordmark } from "@/components/landing/parts";
import type { Locale } from "@/i18n/config";
import { localizedHref } from "@/i18n/routing";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/cn";

// Marketing sub-page header (FAQ, Docs, Guías…): a light paper top bar,
// deliberately NOT the signed-in app header. `locale` comes from the `[lang]`
// route so nav links stay in-locale and the dictionary loads statically.
//
// The Guías link is shown ONLY in Spanish (the guides section is Spanish-only).
// On mobile the bar collapses to: logo · Sign in · burger — every link except
// Sign in moves behind the burger (see <MobileMenu/>).
export async function SiteHeader({
  active,
  locale,
}: {
  active?: string;
  locale: Locale;
}) {
  const { t } = await getI18n(locale);

  // Canonical hrefs (locale-stable) so `active` matching works; localized at
  // render time. Sign in is kept separate — it stays visible on mobile.
  const links = [
    { label: t.nav.docs, href: "/docs" },
    { label: t.nav.faq, href: "/faq" },
    { label: t.nav.demo, href: "/demo" },
    ...(locale === "es" ? [{ label: t.nav.guides, href: "/guias" }] : []),
  ];
  const signIn = { label: t.nav.signIn, href: "/login" };

  const mobileLinks = links.map((link) => ({
    label: link.label,
    href: localizedHref(link.href, locale),
    active: link.href === active,
  }));

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--card)_78%,transparent)] backdrop-blur-[8px]">
      <div
        className={cn(SHELL, "flex h-[60px] items-center justify-between gap-5")}
      >
        <Link href={localizedHref("/", locale)} className="no-underline">
          <Wordmark size={21} />
        </Link>

        {/* Desktop: full nav row. */}
        <nav className="hidden items-center gap-[26px] sm:flex">
          {[...links, signIn].map((link) => (
            <Link
              key={link.href}
              href={localizedHref(link.href, locale)}
              className={cn(
                NAV_LINK,
                link.href === active &&
                  "text-accent underline decoration-dotted underline-offset-[5px]",
              )}
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
          <MobileMenu links={mobileLinks} />
        </div>
      </div>
    </header>
  );
}

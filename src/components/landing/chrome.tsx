import Link from "next/link";
import { Eyebrow, Wordmark } from "@/components/landing/parts";
import type { Locale } from "@/i18n/config";
import { LandingLanguageSwitch } from "@/i18n/LandingLanguageSwitch";
import { localizedHref } from "@/i18n/routing";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/cn";

// Marketing sub-page chrome (FAQ, Docs): a light paper top bar + footer that is
// deliberately NOT the signed-in app header. Built on the same tokens as the
// landing page; sits on a wider 1040px shell than the receipt column. `locale`
// comes from the `[lang]` route so nav links stay in-locale and the dictionary
// loads statically (no cookie).

export const SHELL = "max-w-[1040px] mx-auto px-5 sm:px-8";

const NAV_LINK =
  "font-mono text-micro uppercase tracking-[0.16em] text-muted no-underline whitespace-nowrap transition-colors hover:text-accent";

// `active` is matched by canonical href (stable across locales), e.g. "/docs".
export async function SiteTop({
  active,
  locale,
}: {
  active?: string;
  locale: Locale;
}) {
  const { t } = await getI18n(locale);
  const topNav = [
    { label: t.nav.docs, href: "/docs" },
    { label: t.nav.faq, href: "/faq" },
    { label: t.nav.demo, href: "/demo" },
    { label: t.nav.signIn, href: "/login" },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--card)_78%,transparent)] backdrop-blur-[8px]">
      <div
        className={cn(
          SHELL,
          "flex h-[60px] items-center justify-between gap-5",
        )}
      >
        <Link href={localizedHref("/", locale)} className="no-underline">
          <Wordmark size={21} />
        </Link>
        <nav className="flex items-center gap-4 sm:gap-[26px]">
          {topNav.map((link) => (
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
      </div>
    </header>
  );
}

export async function SiteFoot({ locale }: { locale: Locale }) {
  const { t } = await getI18n(locale);
  const footNav = [
    { label: t.nav.docs, href: "/docs" },
    { label: t.nav.faq, href: "/faq" },
    { label: t.nav.demo, href: "/demo" },
    { label: t.nav.privacy, href: "/privacy" },
    { label: t.nav.security, href: "/security" },
    { label: t.nav.signIn, href: "/login" },
    { label: t.nav.github, href: "https://github.com/irondsd/factura" },
  ];
  return (
    <footer className="mt-2 border-t border-line pt-[26px] pb-14">
      <div className={SHELL}>
        <div className="flex flex-wrap items-center justify-between gap-[18px]">
          <Wordmark size={22} />
          <nav className="flex flex-wrap gap-[22px]">
            {footNav.map((link) => (
              <a
                key={link.href}
                href={localizedHref(link.href, locale)}
                className={NAV_LINK}
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="mt-[22px] flex flex-wrap items-center justify-between gap-2">
          <Eyebrow>{t.siteChrome.footerLeft}</Eyebrow>
          <div className="flex items-center gap-4">
            <LandingLanguageSwitch />
            <Eyebrow>{t.siteChrome.footerRight}</Eyebrow>
          </div>
        </div>
      </div>
    </footer>
  );
}

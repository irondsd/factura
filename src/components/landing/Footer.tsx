import { Eyebrow, NAV_LINK, SHELL, Wordmark } from "@/components/landing/parts";
import { githubUrl } from "@/config/urls";
import type { Locale } from "@/i18n/config";
import { LandingLanguageSwitch } from "@/i18n/LandingLanguageSwitch";
import { localizedHref } from "@/i18n/routing";
import { getI18n } from "@/i18n/server";

// Marketing sub-page footer. `showLanguageSwitch` defaults to true; the
// Spanish-only guides pass `false`, since there is no English page to switch to.
// The Guías link, like in the header, only appears in Spanish.
export async function SiteFooter({
  locale,
  showLanguageSwitch = true,
}: {
  locale: Locale;
  showLanguageSwitch?: boolean;
}) {
  const { t } = await getI18n(locale);
  const footNav = [
    { label: t.nav.docs, href: "/docs" },
    { label: t.nav.faq, href: "/faq" },
    { label: t.nav.demo, href: "/demo" },
    ...(locale === "es" ? [{ label: t.nav.guides, href: "/guias" }] : []),
    { label: t.nav.privacy, href: "/privacy" },
    { label: t.nav.security, href: "/security" },
    { label: t.nav.signIn, href: "/login" },
    { label: t.nav.github, href: githubUrl },
  ];
  return (
    <footer className="mt-2 border-t border-line pt-[26px] pb-14">
      <div className={SHELL}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-[18px]">
          <Wordmark size={22} />
          <nav className="flex flex-wrap gap-x-5 gap-y-3">
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
        <div className="mt-8 flex flex-col gap-3 sm:mt-[22px] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
          <Eyebrow>{t.siteChrome.footerLeft}</Eyebrow>
          <div className="flex items-center gap-4">
            {showLanguageSwitch && <LandingLanguageSwitch />}
            <Eyebrow>{t.siteChrome.footerRight}</Eyebrow>
          </div>
        </div>
      </div>
    </footer>
  );
}

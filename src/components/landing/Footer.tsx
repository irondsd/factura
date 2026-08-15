import { Eyebrow, NAV_LINK, SHELL, Wordmark } from "@/components/landing/parts";
import { siteFooterColumns } from "@/components/landing/SiteNav";
import type { Locale } from "@/i18n/config";
import { LandingLanguageSwitch } from "@/i18n/LandingLanguageSwitch";
import { localizedHref } from "@/i18n/routing";
import { getI18n } from "@/i18n/server";

// Footer for every public page — the landing included. It spans the full
// viewport (the rule) with its contents in the shared SHELL column, so it lines
// up with the header even on the landing, whose body is a much narrower column.
//
// The site outgrew a single wrapped row of links, so this is a directory: the
// brand block, then three titled columns from `siteFooterColumns` (product /
// learn / company). Three columns from `sm:` up, stacked in order below it —
// a link list that reads as one column per group either way.
//
// `showLanguageSwitch` defaults to true; the Spanish-only guides pass `false`,
// since there is no English page to switch to.
export async function SiteFooter({
  locale,
  showLanguageSwitch = true,
}: {
  locale: Locale;
  showLanguageSwitch?: boolean;
}) {
  const { t } = await getI18n(locale);
  const columns = siteFooterColumns(t, locale);

  return (
    <footer className="mt-2 border-t border-line pt-[30px] pb-14">
      <div className={SHELL}>
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between lg:gap-12">
          <div className="flex flex-col gap-2">
            <Wordmark size={22} />
            <Eyebrow>{t.siteChrome.footerLeft}</Eyebrow>
          </div>

          {/* Three across from `md:`, not from `sm:`. Nav labels don't wrap, and
              "Estadísticas" is wider than a third of a 640px column once the
              brand block is beside it — so below that the groups stack in order
              rather than colliding. */}
          <nav className="grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-10 lg:gap-16">
            {columns.map((column) => (
              <div key={column.label} className="flex flex-col gap-3">
                {/* A label, not a link — see siteFooterColumns. */}
                <span className="font-mono text-micro uppercase tracking-label-wide text-ink">
                  {column.label}
                </span>
                <ul className="flex list-none flex-col gap-2.5 p-0 m-0">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <a
                        href={localizedHref(link.href, locale)}
                        className={NAV_LINK}
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <Eyebrow>{t.siteChrome.footerRight}</Eyebrow>
          {showLanguageSwitch && <LandingLanguageSwitch />}
        </div>
      </div>
    </footer>
  );
}

import { cn } from "@/lib/cn";
import { Eyebrow, SHELL, Wordmark } from "@/components/landing/parts";
import { siteFooterColumns } from "@/components/landing/SiteNav";
import { socialProfiles, trustpilotReviewUrl } from "@/config/social";
import type { Locale } from "@/i18n/config";
import { LandingLanguageSwitch } from "@/i18n/LandingLanguageSwitch";
import { localizedHref } from "@/i18n/routing";
import { getI18n } from "@/i18n/server";

// Footer for every public page — the landing included. It spans the full
// viewport with its contents in the shared SHELL column, so it lines up with
// the header even on the landing, whose body is a much narrower column.
//
// A directory of the site: the brand block (wordmark, blurb, the social
// profiles in `src/config/social.ts`), then the three titled columns from
// `siteFooterColumns` (product / learn / company), then a bar with the locale
// note, the Trustpilot review link and the language switch.
//
// It lays out by its OWN width — container queries, not viewport ones — so it
// holds in a narrow shell as well as across a full page:
//   ≥ 960px  four columns: brand | product | learn (a 2-col list) | company
//   600–959  the brand becomes a full-width row above a dashed rule, then the
//            three link columns
//   < 600    brand, then product | company side by side and learn full width
//            below them; every link gets a 44px tap row, the bar stacks
//
// `showLanguageSwitch` defaults to true; the Spanish-only guides pass `false`,
// since there is no English page to switch to.

const FOCUS =
  "focus-visible:outline-1 focus-visible:outline-offset-3 focus-visible:outline-accent";

const LINK = cn(
  "flex min-h-11 items-center text-sm leading-[1.4] text-muted no-underline transition-colors hover:text-accent",
  "@min-[600px]:inline @min-[600px]:min-h-0 @min-[600px]:text-[13px]",
  FOCUS,
);

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
    <footer className="@container mt-2 font-mono text-ink">
      <div className={cn(SHELL, "pt-10 pb-7 @min-[600px]:pt-14 @min-[600px]:pb-10")}>
        <div
          className={cn(
            "grid grid-cols-2 gap-x-5 gap-y-8",
            "@min-[600px]:grid-cols-[1fr_2fr_1fr] @min-[600px]:gap-x-8 @min-[600px]:gap-y-10",
            "@min-[960px]:grid-cols-[1.3fr_1fr_2fr_1fr] @min-[960px]:gap-10",
          )}
        >
          <div
            className={cn(
              "col-span-full border-b border-dashed border-line pb-6",
              "@min-[600px]:flex @min-[600px]:flex-wrap @min-[600px]:items-center @min-[600px]:justify-between @min-[600px]:gap-4 @min-[600px]:pb-7",
              "@min-[960px]:col-auto @min-[960px]:block @min-[960px]:border-b-0 @min-[960px]:pb-0",
            )}
          >
            <a
              href={localizedHref("/", locale)}
              className={cn(
                "inline-block leading-none no-underline @min-[600px]:mr-3 @min-[960px]:mr-0",
                FOCUS,
              )}
            >
              <Wordmark size={24} />
            </a>
            <p
              className={cn(
                "mt-2.5 mb-[18px] max-w-[30ch] text-xs leading-[1.6] text-pretty text-muted",
                "@min-[600px]:m-0 @min-[600px]:min-w-[200px] @min-[600px]:flex-1",
                "@min-[960px]:mt-3 @min-[960px]:mb-[22px] @min-[960px]:min-w-0",
              )}
            >
              {t.siteChrome.footerBlurb}
            </p>
            {/* Typographic badges, not logos — see `mark` in social.ts. */}
            <ul
              aria-label={t.siteChrome.footerFollow}
              className="m-0 flex list-none gap-1.5 p-0"
            >
              {socialProfiles.map((profile) => (
                <li key={profile.url}>
                  <a
                    href={profile.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={profile.label}
                    className={cn(
                      "grid size-11 place-items-center border border-line bg-card text-xs font-semibold text-ink no-underline transition-colors hover:border-accent hover:text-accent",
                      "@min-[600px]:size-8 @min-[600px]:text-micro",
                      FOCUS,
                    )}
                  >
                    {profile.mark}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {columns.map((column) => {
            const id = `site-footer-${column.key}`;
            const learn = column.key === "learn";
            return (
              <nav
                key={column.key}
                aria-labelledby={id}
                className={cn(
                  learn &&
                    "col-span-full order-3 @min-[600px]:col-auto @min-[600px]:order-none",
                )}
              >
                {/* A label, not a link — see siteFooterColumns. */}
                <h2
                  id={id}
                  className="m-0 text-micro font-medium uppercase tracking-label-wide text-ink"
                >
                  {column.label}
                </h2>
                <ul
                  className={cn(
                    "m-0 mt-2 grid list-none p-0 @min-[600px]:mt-[18px] @min-[600px]:gap-[11px]",
                    // Two columns that fill row by row, so the order reads
                    // across: Guías, Estadísticas, then the next pair.
                    learn && "grid-cols-2 gap-x-5 @min-[600px]:gap-x-7",
                  )}
                >
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <a href={localizedHref(link.href, locale)} className={LINK}>
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            );
          })}
        </div>

        <div
          className={cn(
            "mt-7 flex flex-col items-start gap-3.5 border-t border-line pt-[18px]",
            "@min-[600px]:mt-11 @min-[600px]:flex-row @min-[600px]:flex-wrap @min-[600px]:items-center @min-[600px]:justify-between @min-[600px]:gap-x-6 @min-[600px]:gap-y-4",
          )}
        >
          <Eyebrow>{t.siteChrome.footerRight}</Eyebrow>
          <a
            href={trustpilotReviewUrl[locale]}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 border border-ink bg-card px-[11px] py-[7px] text-xs text-ink no-underline transition-colors hover:border-accent",
              "@min-[600px]:min-h-0",
              FOCUS,
            )}
          >
            {t.siteChrome.footerReview}
            <span aria-hidden className="text-sm leading-none text-trustpilot">
              ★
            </span>
            Trustpilot
          </a>
          {showLanguageSwitch && <LandingLanguageSwitch />}
        </div>
      </div>
    </footer>
  );
}

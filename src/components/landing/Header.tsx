import Link from "next/link";
import { Wordmark } from "@/components/landing/parts";
import { SiteNav } from "@/components/landing/SiteNav";
import type { Locale } from "@/i18n/config";
import { localizedHref } from "@/i18n/routing";
import { cn } from "@/lib/cn";

// Marketing sub-page header (FAQ, Docs, Guías…): a light paper top bar,
// deliberately NOT the signed-in app header. `locale` comes from the `[lang]`
// route so nav links stay in-locale and the dictionary loads statically.
//
// This is only the bar: which links appear (and the Spanish-only Guías rule)
// lives in <SiteNav/>, which the header-less landing page renders too. The
// landing page has no header on purpose — see its `inline` nav variant.
export function SiteHeader({
  active,
  locale,
}: {
  active?: string;
  locale: Locale;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--card)_78%,transparent)] backdrop-blur-[8px]">
      <div
        className={cn(
          // This bar is navigation, not editorial content. Give the complete
          // row its own wider measure so it can stay relaxed on large screens;
          // the page body below keeps the shared, readable content measure.
          "mx-auto flex h-[60px] w-full max-w-[1200px] items-center justify-between gap-5 px-5 sm:px-8",
        )}
      >
        <Link href={localizedHref("/", locale)} className="no-underline">
          <Wordmark size={21} />
        </Link>

        <SiteNav locale={locale} active={active} />
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/landing/parts";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";

/** App-style top bar for the public demo: the same chrome as the signed-in
 * header, but the nav points at /demo and the avatar is replaced by a sign-in
 * call to action. No property switcher (the demo has a single property). */
export function DemoTopBar() {
  const pathname = usePathname();
  const { t } = useI18n();

  const NAV = [
    { href: "/demo", label: t.nav.overview },
    { href: "/demo/insights", label: t.nav.insights },
    { href: "/demo/bills", label: t.nav.bills },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-[color-mix(in_srgb,var(--card)_72%,transparent)] backdrop-blur-[6px]">
      <div className="mx-auto flex max-w-[64rem] items-center gap-5 py-3 px-5">
        <Link href="/" className="no-underline">
          <Wordmark size={20} />
        </Link>

        <nav className="flex gap-4">
          {NAV.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "font-mono text-micro uppercase tracking-label underline-offset-4 decoration-dotted transition-colors hover:text-ink",
                  active ? "text-accent underline" : "text-muted no-underline",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <Link
          href="/login"
          className="ml-auto inline-flex items-center justify-center whitespace-nowrap py-1.5 px-3 font-mono text-micro uppercase tracking-label leading-none border border-ink bg-ink text-paper no-underline transition-colors hover:bg-accent hover:border-accent"
        >
          {t.nav.signIn}
        </Link>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { Eyebrow, SHELL } from "@/components/landing/parts";
import { useLocale, useT } from "@/i18n/I18nProvider";

// The 404 body, shared by the two places a 404 can be produced: `not-found.tsx`
// in the landing subtree (an explicit `notFound()`) and `global-not-found.tsx`
// (a URL that matches no route at all).
//
// A client component because that's the only way it can know which language to
// speak: neither file receives `params`, and reading the locale cookie in the
// landing subtree would opt the statically generated pages out of prerendering.
// `useT` reads the locale the provider above already resolved — the route's
// `[lang]` on the landing, the cookie on the global page.

export function NotFoundScreen() {
  const t = useT("notFound");
  const locale = useLocale();
  const nf = t;

  const link =
    "font-mono text-micro uppercase tracking-label-wide no-underline transition-colors";

  return (
    <main className={SHELL}>
      <div className="flex min-h-[60vh] flex-col justify-center py-20">
        <Eyebrow tone="accent">{nf.eyebrow}</Eyebrow>
        <h1 className="font-display font-semibold text-[34px] sm:text-[44px] tracking-[-0.025em] leading-[1.06] mt-[18px] mb-0">
          {nf.title}
        </h1>
        <p className="font-mono text-sm leading-[1.7] text-muted mt-5 max-w-[46ch]">
          {nf.body}
        </p>

        <nav className="flex flex-wrap gap-x-6 gap-y-3 mt-9">
          <Link href="/" className={`${link} text-accent`}>
            {nf.home} →
          </Link>
          {/* The guides are Spanish-only, so the shortcut to them is too —
              pointing an English reader at a Spanish section is a second dead
              end, not a recovery. */}
          {locale === "es" && (
            <Link
              href="/guias"
              className={`${link} text-muted hover:text-accent`}
            >
              {nf.guides} →
            </Link>
          )}
        </nav>
      </div>
    </main>
  );
}

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LOCALE_COOKIE, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { oppositePath } from "@/i18n/routing";

const DISMISS_KEY = "factura-lang-suggest-dismissed";
const ONE_YEAR = 60 * 60 * 24 * 365;

// First matching supported locale in the browser's language preferences.
function preferredLocale(): Locale | null {
  const langs = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  for (const l of langs) {
    const base = l.toLowerCase().slice(0, 2);
    if (base === "es" || base === "en") return base;
  }
  return null;
}

/** Dismissible nudge shown when the visitor's browser language differs from the
 * page they landed on (e.g. an English browser on the Spanish `/`). Links to the
 * same page in the other language; never auto-redirects. Remembered once closed. */
export function LangSuggestBanner() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Browser-only check (navigator.languages + localStorage) — must run after
    // mount, so a one-shot setState here is intentional.
    if (localStorage.getItem(DISMISS_KEY)) return;
    const pref = preferredLocale();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pref && pref !== locale) setShow(true);
  }, [locale]);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  const target = locale === "es" ? "en" : "es";
  const accept = () => {
    document.cookie = `${LOCALE_COOKIE}=${target}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
    localStorage.setItem(DISMISS_KEY, "1");
    router.push(oppositePath(pathname, locale));
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-[320px] border border-line bg-card shadow-pop px-4 py-3">
      <p className="font-mono text-xs text-ink leading-[1.5]">
        {t.meta.suggestText}
      </p>
      <div className="mt-2.5 flex items-center gap-3">
        <button
          type="button"
          onClick={accept}
          className="font-mono text-micro uppercase tracking-label leading-none border border-ink bg-ink text-paper py-2 px-3 cursor-pointer transition-colors hover:bg-accent hover:border-accent"
        >
          {t.meta.switchTo}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="font-mono text-micro uppercase tracking-label text-muted cursor-pointer bg-transparent border-none hover:text-accent transition-colors"
        >
          {t.meta.suggestDismiss}
        </button>
      </div>
    </div>
  );
}

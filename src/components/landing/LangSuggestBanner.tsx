"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { LOCALE_COOKIE, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { isSpanishOnlyPath, oppositePath } from "@/i18n/routing";

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

  // Guías, Estadísticas and Normativa are Spanish-only: never nudge toward a
  // /en page that doesn't exist. A render guard (not just an effect guard) is
  // required because this banner lives in the persistent [lang] layout — on a
  // client-side nav into one of those sections the banner would otherwise
  // linger from the previous page.
  if (!show || isSpanishOnlyPath(pathname)) return null;

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
        <Button type="button" variant="solid" onClick={accept}>
          {t.meta.switchTo}
        </Button>
        <Button type="button" variant="quiet" onClick={dismiss}>
          {t.meta.suggestDismiss}
        </Button>
      </div>
    </div>
  );
}

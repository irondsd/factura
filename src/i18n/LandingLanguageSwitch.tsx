"use client";

import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { LOCALE_COOKIE } from "./config";
import { useI18n } from "./I18nProvider";
import { oppositePath } from "./routing";

const ONE_YEAR = 60 * 60 * 24 * 365;

// Landing-only language switch: navigates to the same page in the other
// language (/ ↔ /en) AND persists the choice in the cookie, so the signed-in
// app and transactional emails follow. The label ("Switch to English" /
// "Cambiar a español") is always in the target language. The app/profile uses
// the separate cookie+DB `LanguageSwitch`.
export function LandingLanguageSwitch({ className }: { className?: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const target = locale === "es" ? "en" : "es";

  function switchTo() {
    document.cookie = `${LOCALE_COOKIE}=${target}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
    router.push(oppositePath(pathname, locale));
  }

  return (
    <button
      type="button"
      onClick={switchTo}
      className={cn(
        "font-mono text-micro uppercase tracking-[0.16em] text-muted no-underline whitespace-nowrap transition-colors hover:text-accent cursor-pointer bg-transparent border-none p-0",
        className,
      )}
    >
      {t.meta.switchTo}
    </button>
  );
}

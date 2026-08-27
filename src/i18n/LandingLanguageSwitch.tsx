"use client";

import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { LOCALE_COOKIE } from "./config";
import { useLocale, useT } from "./I18nProvider";
import { oppositePath } from "./routing";

const ONE_YEAR = 60 * 60 * 24 * 365;

// Landing-only language switch: navigates to the same page in the other
// language (/ ↔ /en) AND persists the choice in the cookie, so the signed-in
// app and transactional emails follow. The label ("Switch to English" /
// "Cambiar a español") is always in the target language. The app/profile uses
// the separate cookie+DB `LanguageSwitch`.
export function LandingLanguageSwitch({ className }: { className?: string }) {
  const t = useT("meta");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const target = locale === "es" ? "en" : "es";

  function switchTo() {
    document.cookie = `${LOCALE_COOKIE}=${target}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
    router.push(oppositePath(pathname, locale));
  }

  return (
    <Button
      type="button"
      variant="quiet"
      onClick={switchTo}
      className={cn("whitespace-nowrap", className)}
    >
      {t.switchTo}
    </Button>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { SegmentedControl } from "@/components/ui";
import { setLocale } from "./actions";
import { type Locale, localeNames } from "./config";
import { useLocale, useT } from "./I18nProvider";

// The invitation is intentionally written in the language you'd switch *to*,
// so a visitor stuck on the wrong language can always read the way out.
// Keyed by the target locale.
const INVITE: Record<Locale, string> = {
  en: "Looking for the English version?",
  es: "¿Buscas la versión en español?",
};

// Display order of the segments, independent of `locales` (which leads with the
// default language). Alphabetical here, so the control never reorders itself
// under a reader who just switched.
const ORDER: Locale[] = ["en", "es"];

const OPTIONS = ORDER.map((code) => ({
  value: code,
  label: code,
  ariaLabel: localeNames[code],
}));

export function LanguageSwitch() {
  const t = useT("profile");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Two languages only — the target is simply the other one.
  const target: Locale = locale === "es" ? "en" : "es";

  function switchTo(next: Locale) {
    if (next === locale) return;
    startTransition(async () => {
      await setLocale(next);
      // Re-runs the server layout so it re-reads the cookie and feeds the new
      // dictionary into the provider.
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-5 border border-line bg-card py-3 px-5">
      <p className="font-mono text-[13px] text-muted leading-[1.5]">
        {t.language.help} <span className="text-ink">{INVITE[target]}</span>
      </p>
      <SegmentedControl
        options={OPTIONS}
        value={locale}
        onChange={switchTo}
        // Only the in-flight switch disables the control; picking the language
        // that is already on is a no-op (`switchTo` guards).
        disabled={pending}
        label={t.language.help}
      />
    </div>
  );
}

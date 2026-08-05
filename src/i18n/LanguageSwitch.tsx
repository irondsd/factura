"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/cn";
import { setLocale } from "./actions";
import { type Locale, localeNames } from "./config";
import { useI18n } from "./I18nProvider";

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

/** One segment of the EN/ES control. Inverts when it is the language you are
 * already in; the wrapper draws the only border, so segments carry none. */
function Segment({
  code,
  active,
  disabled,
  onClick,
}: {
  code: Locale;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={localeNames[code]}
      aria-pressed={active}
      // Only the in-flight switch disables a segment. The active one stays
      // focusable so a keyboard reader can still land on it and hear which
      // language is on; clicking it is a no-op.
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "font-mono text-micro uppercase tracking-label py-[5px] px-2.5 transition-colors",
        active
          ? "bg-ink text-paper cursor-default"
          : "bg-transparent text-muted hover:text-accent cursor-pointer",
      )}
    >
      {code}
    </button>
  );
}

export function LanguageSwitch() {
  const { locale, t } = useI18n();
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
        {t.profile.language.help}{" "}
        <span className="text-ink">{INVITE[target]}</span>
      </p>
      <div className="flex border border-line">
        {ORDER.map((code) => (
          <Segment
            key={code}
            code={code}
            active={code === locale}
            disabled={pending}
            onClick={() => switchTo(code)}
          />
        ))}
      </div>
    </div>
  );
}

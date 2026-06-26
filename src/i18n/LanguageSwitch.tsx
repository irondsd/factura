"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui";
import { setLocale } from "./actions";
import type { Locale } from "./config";
import { useI18n } from "./I18nProvider";

// The invitation is intentionally written in the language you'd switch *to*,
// so a visitor stuck on the wrong language can always read the way out.
// Keyed by the target locale.
const INVITE: Record<Locale, { prompt: string; cta: string }> = {
  en: { prompt: "Looking for the English version?", cta: "Click here" },
  es: { prompt: "¿Buscas la versión en español?", cta: "Haz clic aquí" },
};

export function LanguageSwitch() {
  const { locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Two languages only — the target is simply the other one.
  const target: Locale = locale === "es" ? "en" : "es";
  const invite = INVITE[target];

  function switchTo() {
    startTransition(async () => {
      await setLocale(target);
      // Re-runs the server layout so it re-reads the cookie and feeds the new
      // dictionary into the provider.
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="font-mono text-xs text-muted">{invite.prompt}</p>
      <Button variant="outline" onClick={switchTo} disabled={pending}>
        {invite.cta}
      </Button>
    </div>
  );
}

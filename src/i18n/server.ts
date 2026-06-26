import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { getDictionary } from "./dictionaries";

// Resolves the active locale from the persisted cookie, falling back to the
// default (Spanish). Reading cookies opts the calling route into dynamic
// rendering — acceptable for the app shell; Phase 3 handles static landing
// pages via dedicated /en routes.
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : defaultLocale;
}

// Server-component counterpart of the client `useI18n()` hook. Resolves the
// locale + dictionary for the current request. `cache` dedupes within a single
// render, so any number of server components can call this freely.
export const getI18n = cache(async () => {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  return { locale, t };
});

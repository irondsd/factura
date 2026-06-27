import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { getDictionary } from "./dictionaries";

// Resolves the active locale from the persisted cookie, falling back to the
// default (Spanish). Reading cookies opts the calling route into dynamic
// rendering — used by the signed-in app shell (`(app)` route group). The static
// landing (`(site)/[lang]`) passes its route locale to `getI18n` instead.
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : defaultLocale;
}

// Server-component counterpart of the client `useI18n()` hook. Resolves the
// locale + dictionary for the current render. `cache` dedupes within a single
// render, so any number of server components can call this freely.
//
// Pass `localeOverride` to skip the cookie entirely (e.g. landing pages whose
// locale comes from the `[lang]` route param) — that keeps the call free of
// dynamic APIs so the route can still be statically generated.
export const getI18n = cache(async (localeOverride?: Locale) => {
  const locale = localeOverride ?? (await getLocale());
  const t = await getDictionary(locale);
  return { locale, t };
});

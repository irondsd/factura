// Shared, client-safe i18n config. Keep this free of server-only imports so it
// can be used from both server components and the client I18nProvider.

export const locales = ["es", "en"] as const;

export type Locale = (typeof locales)[number];

// Spanish is the primary language; English is the opt-in alternative.
export const defaultLocale: Locale = "es";

// Cookie that persists the visitor's chosen locale. `NEXT_LOCALE` is the name
// Next.js itself uses for locale detection, so we follow that convention.
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: string | undefined | null): value is Locale {
  return value != null && (locales as readonly string[]).includes(value);
}

// Fills `{placeholder}` tokens in a dictionary string. Keeps i18n simple without
// a runtime dependency: `interpolate("{n} de {total}", { n: 3, total: 4 })`.
export function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}

// Human-readable name of each language, written in that language.
export const localeNames: Record<Locale, string> = {
  es: "Español",
  en: "English",
};

// The structural shape of a dictionary is derived from the Spanish source of
// truth. This is a type-only construct — it is erased at build time and pulls
// nothing into the client bundle. Every dictionary must match es.json.
export type Dictionary = typeof import("./dictionaries/es.json");

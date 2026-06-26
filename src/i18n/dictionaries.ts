import "server-only";
import type { Dictionary, Locale } from "./config";

// Dynamic imports keep each dictionary out of the bundle until its locale is
// actually requested. Only the resolved JSON for the active locale is sent to
// the client (via the I18nProvider), not every translation we maintain.
const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
  es: () => import("./dictionaries/es.json").then((m) => m.default),
  en: () => import("./dictionaries/en.json").then((m) => m.default),
};

export const getDictionary = (locale: Locale): Promise<Dictionary> =>
  dictionaries[locale]();

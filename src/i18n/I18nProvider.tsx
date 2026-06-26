"use client";

import { createContext, useContext } from "react";
import type { Dictionary, Locale } from "./config";

type I18nValue = {
  locale: Locale;
  /** Resolved dictionary for the active locale. */
  t: Dictionary;
};

const I18nContext = createContext<I18nValue | null>(null);

// Holds the server-resolved locale + dictionary so any client component can
// read translations without prop-drilling. Fed from the root layout, which
// reads the locale cookie on every request (and on router.refresh()).
export function I18nProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale;
  dictionary: Dictionary;
  children: React.ReactNode;
}) {
  return (
    <I18nContext.Provider value={{ locale, t: dictionary }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within an <I18nProvider>");
  }
  return ctx;
}

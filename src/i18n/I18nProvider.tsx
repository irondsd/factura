"use client";

import { createContext, useContext, useMemo } from "react";
import type { Dictionary, Locale } from "./config";

/** A top-level section of the dictionary — `nav`, `probar`, `legal`… */
export type Namespace = keyof Dictionary;

// Translations for the client components below a route, and *only* the ones
// they read.
//
// The dictionary is 93 KB of JSON. It used to be handed to this provider whole,
// from the root of each tree, which put every translation this project
// maintains into the RSC payload of every single route — the glossary, the
// legal pages, the parser builder's copy, all of it on a guide about reading an
// electricity bill. On the public site that payload is not just sent, it is
// *stored*: a prerendered route keeps its RSC payload in durable ISR storage,
// where it is billed by the byte and rewritten on every deployment. Half of
// what this site was paying to store was copies of this file.
//
// So a provider takes a subset, and a component asks for the namespace it
// reads. A route that needs more than its layout offers nests a second provider
// (see `/docs`, `/probar`, `/demo`), which merges rather than replaces — the
// nested one adds its namespaces to the parent's instead of hiding them.
//
// The trade is that "did I provide what this component reads?" is a runtime
// question, not a compile-time one: React context cannot carry the set of
// namespaces into the type of a component that consumes it. Two things answer
// it in practice. `useT` throws by name rather than rendering `undefined`, and
// `next build` server-renders every prerendered route, so a component reading a
// namespace its route does not carry fails the build rather than a visitor's
// page.

type I18nValue = {
  locale: Locale;
  /** Partial by construction: a tree carries the namespaces it was given. */
  t: Partial<Dictionary>;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider<K extends Namespace>({
  locale,
  dictionary,
  children,
}: {
  locale: Locale;
  dictionary: Pick<Dictionary, K>;
  children: React.ReactNode;
}) {
  const parent = useContext(I18nContext);
  const value = useMemo(
    () => ({ locale, t: { ...parent?.t, ...dictionary } }),
    [locale, parent, dictionary],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** The translations for one namespace. Name the namespace you read: it is what
 * lets a route carry 3 KB of dictionary instead of 93. */
export function useT<K extends Namespace>(namespace: K): Dictionary[K] {
  const value = useI18nValue().t[namespace];
  if (value === undefined) {
    throw new Error(
      `The i18n namespace "${namespace}" was not provided to this part of the tree. ` +
        `Add it to the <I18nProvider> that wraps this route.`,
    );
  }
  return value as Dictionary[K];
}

/** The active locale, for a component that branches on language rather than
 * reading copy. */
export function useLocale(): Locale {
  return useI18nValue().locale;
}

function useI18nValue(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useT must be used within an <I18nProvider>");
  }
  return ctx;
}

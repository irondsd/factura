"use client";

import { createContext, useContext } from "react";

export type AppState = {
  /** Selected property, or undefined for "All". */
  propertyId?: string;
  /** False while a `?property=` name is still being resolved to an id — until
   * it flips, `propertyId` is unknown rather than "All". Property-scoped
   * queries must stay idle until then, or the page paints every property's
   * data and then replaces it. */
  propertyReady: boolean;
  setPropertyId: (id?: string) => void;
};

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within the /app layout");
  return ctx;
}

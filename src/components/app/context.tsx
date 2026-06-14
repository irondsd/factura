"use client";

import { createContext, useContext } from "react";

export type Currency = "ARS" | "USD";

export type AppState = {
  /** Selected property, or undefined for "All". */
  propertyId?: string;
  currency: Currency;
  setPropertyId: (id?: string) => void;
  setCurrency: (c: Currency) => void;
  /** Open the bill editor drawer for a bill id. */
  openBill: (id: string) => void;
  /** Show a transient bottom-right toast. */
  showToast: (text: string) => void;
};

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within <AppShell>");
  return ctx;
}

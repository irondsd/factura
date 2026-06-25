"use client";

import { createContext, useContext } from "react";

export type AppState = {
  /** Selected property, or undefined for "All". */
  propertyId?: string;
  setPropertyId: (id?: string) => void;
};

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within the /app layout");
  return ctx;
}

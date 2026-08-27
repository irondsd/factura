"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  parseColumnPreferences,
  readStoredColumnPreferences,
  PREFERENCES_CHANGED_EVENT,
  type ColumnPreferences,
} from "../columnPreferences";
import type { ContentSection } from "@/content-system/types";

const serverSnapshot = () => null;

export function useContentColumnPreferences(
  section: ContentSection,
): ColumnPreferences {
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener("storage", notify);
    window.addEventListener(PREFERENCES_CHANGED_EVENT, notify);
    return () => {
      window.removeEventListener("storage", notify);
      window.removeEventListener(PREFERENCES_CHANGED_EVENT, notify);
    };
  }, []);

  const getSnapshot = useCallback(
    () => readStoredColumnPreferences(section),
    [section],
  );

  const storedPreference = useSyncExternalStore(
    subscribe,
    getSnapshot,
    serverSnapshot,
  );

  return parseColumnPreferences(storedPreference, section);
}

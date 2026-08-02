"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Live answer to a CSS media query.
 *
 * Reports `false` on the server and for the hydrating render — there is no
 * viewport to measure until the browser takes over — then re-renders with the
 * real value. Callers must therefore treat `false` as "the wide/default case",
 * never as "definitely not matching". */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onStoreChange);
      return () => mql.removeEventListener("change", onStoreChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

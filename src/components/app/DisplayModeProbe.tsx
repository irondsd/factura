"use client";

import { useEffect } from "react";
import { DISPLAY_MODE_COOKIE, INSTALLED_MODES } from "@/lib/displayMode";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** How this page is being displayed, as a CSS display-mode keyword. */
function currentDisplayMode(): string {
  // iOS predates the media query for home-screen web apps and still answers
  // through this non-standard flag, so it has to be asked first — Safari does
  // not match `(display-mode: standalone)` in every version that sets it.
  if ((navigator as { standalone?: boolean }).standalone === true) {
    return "standalone";
  }
  return (
    INSTALLED_MODES.find(
      (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
    ) ?? "browser"
  );
}

/**
 * Reports whether the app is running in a browser tab or as an installed app.
 *
 * No browser ships a display-mode request header — the idea has sat unadopted
 * in w3c/manifest#954 since 2021 — so this is the only place the answer exists.
 * It travels by cookie rather than by a request of its own: every later request
 * carries it for free, and the session heartbeat (src/server/auth.ts) picks it
 * up with the rest of the client reading.
 *
 * The cookie is deliberately not httpOnly (script sets it) and holds nothing
 * sensitive — a display-mode keyword. The server treats it as untrusted input
 * and drops anything outside the known set.
 *
 * One caveat this can't fix: on desktop and Android the installed app shares a
 * cookie jar with the browser, so both surfaces ARE one session — the row
 * reports whichever was used last. iOS gives a home-screen app its own storage,
 * so there it is genuinely a separate session, correctly labelled.
 */
export function DisplayModeProbe() {
  useEffect(() => {
    const write = () => {
      const secure = window.location.protocol === "https:" ? "; secure" : "";
      document.cookie = `${DISPLAY_MODE_COOKIE}=${currentDisplayMode()}; path=/; max-age=${ONE_YEAR}; samesite=lax${secure}`;
    };
    write();

    // A window can move between surfaces mid-session (installing the app from
    // an open tab, or popping a tab out), which fires this.
    const query = window.matchMedia("(display-mode: browser)");
    query.addEventListener("change", write);
    return () => query.removeEventListener("change", write);
  }, []);

  return null;
}

/** How a session is being displayed: a browser tab, or an installed app.
 *
 * Shared between the client probe that reports it and the server that stores
 * it, so the cookie name and the vocabulary are written down once. Values are
 * CSS `display-mode` keywords — the same ones `window.matchMedia` answers on. */

export const DISPLAY_MODE_COOKIE = "fd-display-mode";

/** Every keyword the server will accept into the column. The cookie is set by
 * script, so this is the allowlist that keeps user-controlled input out. */
export const DISPLAY_MODES = [
  "browser",
  "minimal-ui",
  "standalone",
  "fullscreen",
  "window-controls-overlay",
  "picture-in-picture",
] as const;

export type DisplayMode = (typeof DISPLAY_MODES)[number];

/** The modes that mean "launched from the home screen / app list", most
 * immersive first — the order the probe tests them in. */
export const INSTALLED_MODES: DisplayMode[] = [
  "fullscreen",
  "standalone",
  "minimal-ui",
  "window-controls-overlay",
];

export function isDisplayMode(value: string): value is DisplayMode {
  return (DISPLAY_MODES as readonly string[]).includes(value);
}

/** True for a session last used as an installed app. An unreported mode (null)
 * is not an app — it's a client that never told us, most likely an older
 * session, and a browser tab is the honest default. */
export function isInstalled(mode: string | null | undefined): boolean {
  return !!mode && mode !== "browser" && mode !== "picture-in-picture";
}

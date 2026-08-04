/** Minimal user-agent parsing for the sessions list.
 *
 * The list only has to answer "is this me, or someone else?", which a browser
 * name and an OS name do. That is a far smaller job than device fingerprinting,
 * so it's a table of regexes rather than a dependency — and a UA it can't place
 * is reported as `null` (rendered as "unknown") instead of guessed at.
 *
 * Order matters in both tables: Chromium forks all claim "Chrome", every
 * Chromium claims "Safari", iOS claims "Mac OS X", and Android claims "Linux".
 * The first match wins, so the more specific pattern is listed first. */

export type ParsedUserAgent = {
  browser: string | null;
  os: string | null;
};

const BROWSERS: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/(?:Firefox|FxiOS)\//, "Firefox"],
  [/CriOS\//, "Chrome"],
  [/Chrome\//, "Chrome"],
  // Real Safari carries a Version/ token; a bare "Safari" without it is some
  // WebKit shell (an in-app browser, a crawler) we'd rather not name.
  [/Version\/[\d.]+ (?:Mobile\/\S+ )?Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPod/, "iOS"],
  [/iPad/, "iPadOS"],
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Windows/, "Windows"],
  [/Linux|X11/, "Linux"],
];

const match = (table: [RegExp, string][], ua: string) =>
  table.find(([pattern]) => pattern.test(ua))?.[1] ?? null;

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua) return { browser: null, os: null };
  return { browser: match(BROWSERS, ua), os: match(SYSTEMS, ua) };
}

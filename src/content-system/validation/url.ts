// What a URL written in content is allowed to be.
//
// One module, no imports, because two very different layers need the same
// answer: the grammar validator, which reads link destinations out of a parsed
// body, and the metadata schemas, which read `sources[].href` out of JSONB.
// Two spellings of "is this link safe" would eventually disagree, and the
// disagreement would be a `javascript:` href that one of them let through.
//
// Allowlist, not denylist — the same rule the component manifest already uses.
// A scheme that is not named here is refused whether or not anyone has thought
// about what it does, which is the only way to be ahead of `vbscript:`,
// `data:text/html`, and whatever the next one is called.

/** Schemes a link in content may use.
 *
 * `http`/`https` are the web; `mailto`/`tel` are the two the guides actually
 * write (a distributor's contact address, a claims line). Everything else —
 * `javascript:`, `data:`, `vbscript:`, `file:`, `blob:` — is either a script
 * delivered through an attribute or a link to the reader's own machine. */
export const ALLOWED_URL_SCHEMES = ["http", "https", "mailto", "tel"] as const;

export type AllowedUrlScheme = (typeof ALLOWED_URL_SCHEMES)[number];

/** A leading scheme, per RFC 3986: a letter followed by letters, digits, `+`,
 * `-` or `.`, then a colon. Anchored, so `/guias/a:b` is a path and not a
 * scheme called `/guias/a`. */
const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

/** ASCII whitespace and C0 controls, which a URL parser removes before it looks
 * for the scheme. */
const STRIPPED = /[\u0000-\u0020]/g;

/** Strip what a URL parser strips before it looks for the scheme.
 *
 * `java\tscript:alert(1)` and a leading newline are the classic ways past a
 * naive `startsWith("javascript:")`: browsers remove ASCII whitespace and C0
 * controls from a URL, so the tab is not part of the scheme by the time
 * anything navigates. Removing them here means this function sees what the
 * browser will see rather than what the author typed. */
function normalize(value: string): string {
  return value.replace(STRIPPED, "");
}

/** The scheme of a URL that content may not use, or `null` when the URL is
 * fine. Relative URLs and fragments have no scheme and are always allowed —
 * they cannot leave the site or execute anything.
 *
 * Returns the offending scheme rather than a boolean so the diagnostic can
 * name it: "javascript: links are not allowed" is a message an author can act
 * on, and "invalid URL" is not. */
export function unsafeUrlScheme(value: string): string | null {
  const match = SCHEME.exec(normalize(value));
  if (!match) return null;
  const scheme = match[1].toLowerCase();
  return (ALLOWED_URL_SCHEMES as readonly string[]).includes(scheme)
    ? null
    : scheme;
}

/** Whether a URL written in content may be used as-is. */
export function isSafeContentUrl(value: string): boolean {
  return unsafeUrlScheme(value) === null;
}

/** The message every layer uses, so the editor, the MCP and the metadata
 * schema all say the same thing about the same mistake. */
export function unsafeUrlMessage(scheme: string): string {
  return `${scheme}: links are not allowed in content. Use a site path, an https URL, or a mailto:/tel: link.`;
}

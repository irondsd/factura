/** Product limits shared between client UI and server validation. Kept in a
 * dependency-free module so client components can import it without pulling in
 * server-only code. */

/** How many properties a single user may *own*. Properties shared with them by
 * someone else don't count against this. */
export const OWNED_PROPERTY_LIMIT = 1;

// ── Contact form (/contacto) ─────────────────────────────────────────────────
// The other surface open to the internet. Bounds are shared so the browser
// stops a message the server would only reject, and both agree on the number
// the help text prints.

/** Longest message the contact form accepts. Generous enough for a detailed
 * bug report, short enough that the body stays a body. */
export const CONTACT_MESSAGE_MAX = 4000;

/** Shortest message worth sending. Filters the empty "hi" that is really a
 * mis-click, without making someone pad a one-line question. */
export const CONTACT_MESSAGE_MIN = 10;

/** Ceiling on the optional name field. */
export const CONTACT_NAME_MAX = 120;

/** Ceiling on the reply address, matching the rest of the app's email fields. */
export const CONTACT_EMAIL_MAX = 255;

// ── Public bill drop (/probar) ───────────────────────────────────────────────
// Everything below bounds the one surface anyone on the internet can hand bytes
// to. The authenticated ingest route is deliberately more generous: there, an
// abusive upload costs the attacker an account.

/** Per-file ceiling on the public drop.
 *
 * Set by the host, not by us: Vercel caps a Serverless Function's request body
 * at 4.5 MB and rejects anything larger with its own opaque 413 BEFORE our
 * handler runs — so a higher number here would be fiction, and the user would
 * get Vercel's error page instead of our copy. 4 MB leaves headroom for the
 * multipart envelope (boundaries, the keepFile and locale fields) so a file we
 * accept can't push the encoded body over the platform limit.
 *
 * It's not a painful ceiling in practice: a text-layer utility bill is well
 * under 2 MB. If Vercel's limit ever moves, this is the one place to change. */
export const PUBLIC_MAX_BYTES = 4 * 1024 * 1024;

/** Pages read from a public upload before extraction stops. Not a nicety: a
 * small crafted PDF can declare tens of thousands of pages, and looping them is
 * the cheapest way to exhaust an instance's memory and its whole maxDuration. */
export const PUBLIC_MAX_PAGES = 30;

/** Files accepted from one drop. Enforced in the browser; server-side the real
 * control is PROBAR_SUBMIT's burst capacity, since each file is its own request
 * and the server never sees a "drop". Keep that capacity above this number or a
 * legitimate full drop rate-limits itself partway through. */
export const MAX_FILES_PER_DROP = 10;

/** Sustained per-IP ceiling, enforced against the bill_submissions table. The
 * in-process token bucket dies with the instance; this is what survives. */
export const PUBLIC_SUBMISSIONS_PER_IP_PER_DAY = 50;

/** How long an opted-out, unclaimed submission's PDF survives before the
 * retention sweep deletes it. Long enough to cover "I'll sign up tonight",
 * short enough that the un-checked "keep my file" box means something. The
 * extracted text is never deleted — only the stored original. */
export const SUBMISSION_FILE_GRACE_DAYS = 7;

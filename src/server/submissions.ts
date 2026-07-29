import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { billSubmissions } from "@/db/schema";

// Capability tokens for anonymous /probar submissions.
//
// A submission has no owner, so "may this caller see this row?" can't be
// answered by a session. It's answered by possession of a secret instead: the
// browser holds `<id>:<secret>` pairs in an httpOnly cookie, the DB holds only
// sha256(secret), and every read or claim must present a matching secret.
//
// Why not just the uuid: ids leak — through server logs, Referer headers, error
// reports, a shared screenshot — and a leaked one must not expose the visitor's
// bill text or let a stranger claim it into their own account. Why not a cookie
// of bare uuids: httpOnly prevents a *script* from reading a cookie; it does
// nothing to stop a client sending whatever cookie it likes. Only a secret the
// server can verify is actually authorization.

// ONE COOKIE PER SUBMISSION, and that is load-bearing rather than a style
// choice. The original design packed every ticket into a single `probar_subs`
// value, which meant each /submit response rebuilt the whole cookie from the
// value it had been *sent*. A drop of several files uploads them concurrently,
// so two in-flight requests read the same value, and the second Set-Cookie
// overwrote the first one's ticket — the file then 404'd on its next /parse
// call and died mid-cascade. Separate names can't clobber each other.
export const SUBMISSION_COOKIE_PREFIX = "probar_sub_";

/** The old combined cookie. Read-only now: a visitor who dropped bills before
 * this change still has tickets in here, and they must stay claimable until it
 * expires on its own. Nothing writes it. */
export const LEGACY_SUBMISSION_COOKIE = "probar_subs";

/** 30 days, deliberately longer than SUBMISSION_FILE_GRACE_DAYS: a visitor who
 * comes back on day 20 can still claim the extracted text, they've just lost
 * the stored original. */
export const SUBMISSION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

/** Cap on how many submissions a browser tracks; the oldest are evicted first.
 * Now a cap on cookie *count*, which matters more than the byte total it used
 * to bound — a domain that keeps minting cookies eventually pushes older ones
 * (the session included) out of the jar. */
export const MAX_TRACKED_SUBMISSIONS = 20;

export type Ticket = { id: string; secret: string };

/** A ticket as it came out of the jar. `issuedAt` is epoch ms, 0 when unknown
 * (a legacy-cookie entry, or a value written before this field existed). */
export type StoredTicket = Ticket & { issuedAt: number };

/** The subset of a cookie jar these helpers need, so they stay pure and
 * testable without a request. */
export type CookiePair = { name: string; value: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_RE = /^[A-Za-z0-9_-]{16,64}$/;
const ISSUED_AT_RE = /^[0-9a-z]{1,10}$/;

export function submissionCookieName(id: string): string {
  return `${SUBMISSION_COOKIE_PREFIX}${id}`;
}

/** `<secret>.<epoch seconds, base36>`. The timestamp rides along because
 * eviction needs an order and cookies carry none; base36 seconds keeps it to
 * ~7 chars. The separator is safe: the secret is base64url, which has no `.`.
 *
 * It's client-controlled like everything else in a cookie, but it decides only
 * which of the visitor's OWN tickets get dropped first when they exceed the
 * cap. It is never an input to authorization — that's `secret`, checked against
 * the row's hash. Pure. */
export function submissionCookieValue(secret: string, issuedAtMs: number): string {
  return `${secret}.${Math.floor(issuedAtMs / 1000).toString(36)}`;
}

/** Read one `probar_sub_<id>` pair. Null for anything malformed. Pure. */
function readSubmissionCookie(pair: CookiePair): StoredTicket | null {
  const id = pair.name.slice(SUBMISSION_COOKIE_PREFIX.length);
  if (!UUID_RE.test(id)) return null;
  const dot = pair.value.indexOf(".");
  const secret = dot < 0 ? pair.value : pair.value.slice(0, dot);
  const stamp = dot < 0 ? "" : pair.value.slice(dot + 1);
  if (!SECRET_RE.test(secret)) return null;
  // A missing or junk timestamp costs the ticket its place in the eviction
  // order, never its validity — the secret is what authorizes.
  const issuedAt = ISSUED_AT_RE.test(stamp) ? parseInt(stamp, 36) * 1000 : 0;
  return { id, secret, issuedAt: Number.isFinite(issuedAt) ? issuedAt : 0 };
}

/** Parse the legacy combined cookie. Fully attacker-controlled input, so this
 * never throws and never trusts shape: malformed entries are dropped
 * individually. Pure. */
export function parseLegacyTickets(raw: string | undefined): Ticket[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const tickets: Ticket[] = [];
  for (const entry of raw.split("|")) {
    const sep = entry.indexOf(":");
    if (sep < 0) continue;
    const id = entry.slice(0, sep);
    const secret = entry.slice(sep + 1);
    if (!UUID_RE.test(id) || !SECRET_RE.test(secret)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    tickets.push({ id, secret });
    if (tickets.length >= MAX_TRACKED_SUBMISSIONS) break;
  }
  return tickets;
}

/** Every ticket this browser holds, newest first, capped at
 * MAX_TRACKED_SUBMISSIONS so a forged jar can't turn one claim request into
 * unbounded DB work. Per-submission cookies win over a legacy entry for the
 * same id. Pure. */
export function readTickets(cookies: CookiePair[]): StoredTicket[] {
  const found: StoredTicket[] = [];
  for (const pair of cookies) {
    if (!pair.name.startsWith(SUBMISSION_COOKIE_PREFIX)) continue;
    const ticket = readSubmissionCookie(pair);
    if (ticket) found.push(ticket);
  }
  for (const pair of cookies) {
    if (pair.name !== LEGACY_SUBMISSION_COOKIE) continue;
    for (const t of parseLegacyTickets(pair.value))
      found.push({ ...t, issuedAt: 0 });
  }

  // Newest first, stable within a timestamp. Sorting before dedup is what makes
  // the per-submission cookie beat the legacy entry for the same id.
  const ordered = found
    .map((ticket, i) => ({ ticket, i }))
    .sort((a, b) => b.ticket.issuedAt - a.ticket.issuedAt || a.i - b.i)
    .map((entry) => entry.ticket);

  const seen = new Set<string>();
  const tickets: StoredTicket[] = [];
  for (const ticket of ordered) {
    if (seen.has(ticket.id)) continue;
    seen.add(ticket.id);
    tickets.push(ticket);
    if (tickets.length >= MAX_TRACKED_SUBMISSIONS) break;
  }
  return tickets;
}

/** The ticket for one submission, or null. Pure. */
export function findTicket(
  cookies: CookiePair[],
  id: string,
): StoredTicket | null {
  return readTickets(cookies).find((t) => t.id === id) ?? null;
}

/** Names of every cookie holding tickets — what a spent claim clears. Pure. */
export function trackedCookieNames(cookies: CookiePair[]): string[] {
  return cookies
    .map((c) => c.name)
    .filter(
      (name) =>
        name === LEGACY_SUBMISSION_COOKIE ||
        (name.startsWith(SUBMISSION_COOKIE_PREFIX) &&
          UUID_RE.test(name.slice(SUBMISSION_COOKIE_PREFIX.length))),
    );
}

/** Per-submission cookies to delete so the jar keeps only the newest `keep`
 * tickets. Deleting the oldest is safe under concurrency in a way that
 * rewriting a shared value never was: two overlapping submits evict the same
 * already-old ids, and neither touches the ticket the other is adding.
 *
 * Junk `probar_sub_*` cookies are swept too — they can't be a ticket, so
 * leaving them would let a forged jar hold real ones out of the cap. Pure. */
export function evictableCookieNames(
  cookies: CookiePair[],
  keep = MAX_TRACKED_SUBMISSIONS,
): string[] {
  const kept = new Set(readTickets(cookies).slice(0, keep).map((t) => t.id));
  return cookies
    .map((c) => c.name)
    .filter((name) => name.startsWith(SUBMISSION_COOKIE_PREFIX))
    .filter((name) => !kept.has(name.slice(SUBMISSION_COOKIE_PREFIX.length)));
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Mint a capability for a submission: the ticket goes to the browser, the hash
 * goes in the row. 32 bytes of CSPRNG output — the secret is the only thing
 * standing between a guessed uuid and someone else's bill. */
export function mintTicket(id: string): { ticket: Ticket; secretHash: string } {
  const secret = randomBytes(24).toString("base64url");
  return { ticket: { id, secret }, secretHash: hashSecret(secret) };
}

/** Does `secret` open the capability recorded as `storedHash`?
 *
 * Constant-time, so a caller can't narrow a secret by timing repeated guesses.
 * Tolerant of a malformed or truncated `storedHash` (returns false rather than
 * throwing) because a corrupted row must fail closed, not 500. Pure — unit
 * tested in submissions.test.ts. */
export function secretMatches(storedHash: string, secret: string): boolean {
  const left = Buffer.from(storedHash, "hex");
  const right = Buffer.from(hashSecret(secret), "hex");
  // A hex string that didn't decode to a full digest can't be a real hash;
  // treating a length mismatch as "no" also keeps timingSafeEqual from throwing.
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

export type SubmissionRow = typeof billSubmissions.$inferSelect;

/** Load a submission only when `secret` matches the one it was minted with.
 * Returns null for both "no such row" and "wrong secret", and never throws, so
 * this can't be used to probe which ids exist — the same reasoning behind
 * assertOwnsPackage answering NOT_FOUND rather than FORBIDDEN. */
export async function loadOwnedSubmission(
  db: Database,
  id: string,
  secret: string,
): Promise<SubmissionRow | null> {
  if (!UUID_RE.test(id) || !SECRET_RE.test(secret)) return null;
  const row = await db.query.billSubmissions.findFirst({
    where: eq(billSubmissions.id, id),
  });
  if (!row) return null;
  return secretMatches(row.secretHash, secret) ? row : null;
}

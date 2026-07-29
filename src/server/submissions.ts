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

export const SUBMISSION_COOKIE = "probar_subs";

/** 30 days, deliberately longer than SUBMISSION_FILE_GRACE_DAYS: a visitor who
 * comes back on day 20 can still claim the extracted text, they've just lost
 * the stored original. */
export const SUBMISSION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

/** Cap on cookie growth; the oldest entries are dropped first. ~80 bytes each,
 * so 20 sits well under the 4 KB per-cookie limit even with the name. */
export const MAX_TRACKED_SUBMISSIONS = 20;

export type Ticket = { id: string; secret: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** Parse the cookie into tickets. Fully attacker-controlled input, so this never
 * throws and never trusts shape: malformed entries are dropped individually, and
 * the result is truncated to MAX_TRACKED_SUBMISSIONS so an oversized cookie
 * can't turn one claim request into unbounded DB work. Pure. */
export function parseTickets(raw: string | undefined): Ticket[] {
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

/** Serialize tickets for the cookie, newest last, keeping only the most recent
 * MAX_TRACKED_SUBMISSIONS. Pure. */
export function serializeTickets(tickets: Ticket[]): string {
  return tickets
    .slice(-MAX_TRACKED_SUBMISSIONS)
    .map((t) => `${t.id}:${t.secret}`)
    .join("|");
}

/** Add a ticket to an existing cookie value, replacing any entry for the same
 * id. Pure. */
export function appendTicket(
  raw: string | undefined,
  ticket: Ticket,
): string {
  const kept = parseTickets(raw).filter((t) => t.id !== ticket.id);
  return serializeTickets([...kept, ticket]);
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

/** Constant-time compare of two hex digests of equal length. */
function hashMatches(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length === 0 || left.length !== right.length) return false;
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
  return hashMatches(row.secretHash, hashSecret(secret)) ? row : null;
}

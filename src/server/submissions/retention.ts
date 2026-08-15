import type { SQL } from "drizzle-orm";
import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  notInArray,
  or,
} from "drizzle-orm";
import { billSubmissions, submissionOutcome } from "@/db/schema";

/** What happens to an anonymous /probar submission after the visitor walks away.
 *
 * Two scripts act on this and they must not disagree, so the predicates live
 * here once rather than as two hand-written WHERE clauses that drift:
 *
 *   cleanupSubmissionFiles — the periodic broom. Nothing it matches is worth
 *                            keeping, so past the grace window file AND row go.
 *   pullUnrecognizedSubmissions — the opposite job. These bills are the reason
 *                            the /probar page exists; they get copied to disk
 *                            before anything is deleted.
 *
 * The split between them is `PARSER_MATERIAL`, and the invariant they share is
 * ORPHAN-FREE: the S3 object is deleted BEFORE the row that names it. A failed
 * object delete leaves the row alone so the next run retries it. The reverse
 * order would leave bytes in the bucket with nothing left pointing at them.
 */

type Outcome = (typeof submissionOutcome.enumValues)[number];

/** Outcomes that are worth a parser, and therefore worth keeping.
 *
 * `unrecognized` — no parser matched at all; this is the queue of parsers to
 *   write next.
 * `parse_failed` — a parser DID match but couldn't extract a field. Per the
 *   schema, the single most useful signal for improving that parser, so it is
 *   material in exactly the same way.
 *
 * Everything else (`parsed`, `pending`, `no_text`) exists only so a visitor can
 * claim it, and expires with the claim window. */
export const PARSER_MATERIAL = [
  "unrecognized",
  "parse_failed",
] as const satisfies readonly Outcome[];

/** A visitor who left an address to hear back about their bill and hasn't been
 * written to yet. Their row is never deleted by either script — the address is
 * the only way to keep that promise and it exists nowhere else. The stored PDF
 * is still fair game; it's the row that has to survive. */
export const owesAnEmail = (): SQL =>
  and(
    isNotNull(billSubmissions.notifyEmail),
    isNull(billSubmissions.notifiedAt),
  )!;

/** De Morgan of `owesAnEmail`, spelled out rather than wrapped in NOT so it
 * stays index-friendly and readable in an EXPLAIN. */
const emailSettled = (): SQL =>
  or(
    isNull(billSubmissions.notifyEmail),
    isNotNull(billSubmissions.notifiedAt),
  )!;

const unclaimed = () => isNull(billSubmissions.claimedByUserId);

export const olderThan = (days: number): SQL =>
  lt(
    billSubmissions.createdAt,
    new Date(Date.now() - days * 24 * 60 * 60 * 1000),
  );

/** CLEANUP, rule A — the retention promise.
 *
 * `keep_file = false` means the visitor unchecked "keep my file", and that has
 * to hold for EVERY outcome, including the parser material we otherwise hoard:
 * a checkbox that doesn't delete the file is a lie. Deletes the object only —
 * the row and its `raw_text` survive, which is what the checkbox copy says we
 * retain. Parser material swept here still reaches disk later, as a .txt,
 * because pull reads `raw_text` and doesn't need the PDF to do its job. */
export const optedOutFileDue = (days: number): SQL =>
  and(
    eq(billSubmissions.keepFile, false),
    unclaimed(),
    isNotNull(billSubmissions.storageKey),
    olderThan(days),
  )!;

/** CLEANUP, rule B — the expiry.
 *
 * A recognized bill is held for one reason: so the visitor can sign in and
 * claim it. Past the window nobody is coming, and we have no use for a
 * stranger's electricity bill, so object and row both go regardless of
 * `keep_file` — that checkbox governs how long we hold a file, not whether an
 * abandoned submission outlives its purpose. */
export const expiredSubmissionDue = (days: number): SQL =>
  and(expiredIgnoringEmailHold(days), emailSettled())!;

/** Rule B without its email exemption. Only useful for counting what the
 * exemption is holding back, so an operator can see the backlog. Never use it
 * to delete — that's the whole point of the exemption. */
export const expiredIgnoringEmailHold = (days: number): SQL =>
  and(
    notInArray(billSubmissions.outcome, [...PARSER_MATERIAL]),
    unclaimed(),
    olderThan(days),
  )!;

/** PULL — everything worth writing a parser for.
 *
 * No grace window and no `storage_key` requirement: a row whose PDF is already
 * gone (swept by rule A, or never stored) still carries `raw_text`, and the text
 * is the part that makes a bill worth a parser. Claimed rows are excluded —
 * their object belongs to a real bill now and the user owns it. */
export const parserMaterialDue = (): SQL =>
  and(inArray(billSubmissions.outcome, [...PARSER_MATERIAL]), unclaimed())!;

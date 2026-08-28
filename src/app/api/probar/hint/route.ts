import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { billSubmissions } from "@/db/schema";
import { VENDOR_GUESS_MAX } from "@/lib/probar";
import { probarOptions, withProbarCors } from "@/server/probarCors";
import { limitKey, PROBAR_HINT, take } from "@/server/rateLimit";
import { findTicket, loadOwnedSubmission } from "@/server/submissions";

export const runtime = "nodejs";

/** "Who is this bill from?" — the one thing the visitor knows about an
 * unrecognized bill that we don't.
 *
 * Saved as they type (the field on the card debounces and calls this), because
 * asking them to press a button to submit a single optional word is how the
 * answer gets lost. Idempotent by design: the last write for a submission wins,
 * so a rate-limited or dropped intermediate keystroke costs nothing as long as
 * one later request lands.
 *
 * Ticket-gated like every other submission endpoint — the guess goes on YOUR
 * row or on none. Stored as free text and never resolved against `vendors`
 * automatically: it's a hint for whoever writes the parser, and a typo'd or
 * joke answer must not be able to reshape our vendor table. */
async function handlePost(request: Request) {
  const limit = take(limitKey(request, "probar:hint"), PROBAR_HINT);
  if (!limit.ok)
    return Response.json(
      { error: "Too many requests", retryAfterSec: limit.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  const { submissionId, vendor } = (body ?? {}) as Record<string, unknown>;
  if (typeof submissionId !== "string" || typeof vendor !== "string")
    return Response.json({ error: "Invalid body" }, { status: 400 });

  const jar = await cookies();
  const ticket = findTicket(jar.getAll(), submissionId);
  if (!ticket) return Response.json({ error: "Not found" }, { status: 404 });

  const row = await loadOwnedSubmission(db, ticket.id, ticket.secret);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });

  // Clearing the field clears the column: someone who deletes what they typed
  // has withdrawn it, and leaving the old value behind would keep a guess they
  // decided against.
  const guess = vendor.trim().slice(0, VENDOR_GUESS_MAX);

  await db
    .update(billSubmissions)
    .set({ vendorGuess: guess.length > 0 ? guess : null })
    .where(eq(billSubmissions.id, row.id));

  return Response.json({ ok: true });
}

export const POST = withProbarCors(handlePost);
export const OPTIONS = probarOptions();

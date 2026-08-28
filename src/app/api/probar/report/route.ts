import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { billSubmissions } from "@/db/schema";
import { REPORT_MESSAGE_MAX } from "@/lib/probar";
import { probarOptions, withProbarCors } from "@/server/probarCors";
import { limitKey, PROBAR_CLAIM, take } from "@/server/rateLimit";
import { findTicket, loadOwnedSubmission } from "@/server/submissions";

export const runtime = "nodejs";

/** "You read this wrong" — a correction against a bill a parser DID recognize.
 *
 * The most valuable report on the page: a labelled extraction bug on a document
 * whose text we still hold, so the fix is reproducible without asking the
 * visitor for anything else. Nothing about the bill travels in the request —
 * only the id and what they typed; the text is already on the row.
 *
 * Ticket-gated, and one report per submission: the column is overwritten rather
 * than appended, so a second, better-worded report replaces the first instead of
 * queueing another row to triage. */
async function handlePost(request: Request) {
  const limit = take(limitKey(request, "probar:report"), PROBAR_CLAIM);
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
  const { submissionId, message, email } = (body ?? {}) as Record<
    string,
    unknown
  >;
  if (typeof submissionId !== "string" || typeof message !== "string")
    return Response.json({ error: "Invalid body" }, { status: 400 });

  const text = message.trim().slice(0, REPORT_MESSAGE_MAX);
  if (text.length === 0)
    return Response.json({ error: "Invalid body" }, { status: 400 });

  // The address is optional here in a way it isn't on /notify — the report is
  // worth having on its own, so a missing or malformed one is dropped rather
  // than refused.
  const replyTo =
    typeof email === "string" && email.includes("@") && email.length <= 255
      ? email.trim()
      : null;

  const jar = await cookies();
  const ticket = findTicket(jar.getAll(), submissionId);
  if (!ticket) return Response.json({ error: "Not found" }, { status: 404 });

  const row = await loadOwnedSubmission(db, ticket.id, ticket.secret);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });

  await db
    .update(billSubmissions)
    .set({
      reportMessage: text,
      reportEmail: replyTo,
      reportedAt: new Date(),
    })
    .where(eq(billSubmissions.id, row.id));

  return Response.json({ ok: true });
}

export const POST = withProbarCors(handlePost);
export const OPTIONS = probarOptions();

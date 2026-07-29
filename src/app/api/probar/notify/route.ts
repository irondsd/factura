import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { billSubmissions } from "@/db/schema";
import { limitKey, PROBAR_CLAIM, take } from "@/server/rateLimit";
import {
  loadOwnedSubmission,
  parseTickets,
  SUBMISSION_COOKIE,
} from "@/server/submissions";

export const runtime = "nodejs";

/** Attach a "tell me when you support this" address to a submission.
 *
 * Separate from /submit because the offer is only made once we know the bill
 * failed, which is several requests after the upload. Ticket-gated like every
 * other submission endpoint, so nobody can staple an address to a stranger's row.
 *
 * The address is deliberately inert: unverified, never linked to an account,
 * never used to authenticate, and good for exactly one notice. */
export async function POST(request: Request) {
  const limit = take(limitKey(request, "probar:notify"), PROBAR_CLAIM);
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
  const { submissionId, email } = (body ?? {}) as Record<string, unknown>;
  if (
    typeof submissionId !== "string" ||
    typeof email !== "string" ||
    !email.includes("@") ||
    email.length > 255
  )
    return Response.json({ error: "Invalid body" }, { status: 400 });

  const jar = await cookies();
  const ticket = parseTickets(jar.get(SUBMISSION_COOKIE)?.value).find(
    (t) => t.id === submissionId,
  );
  if (!ticket) return Response.json({ error: "Not found" }, { status: 404 });

  const row = await loadOwnedSubmission(db, ticket.id, ticket.secret);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });

  await db
    .update(billSubmissions)
    .set({ notifyEmail: email.trim() })
    .where(eq(billSubmissions.id, row.id));

  return Response.json({ ok: true });
}

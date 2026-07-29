import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { billSubmissions } from "@/db/schema";
import { limitKey, PROBAR_CLAIM, take } from "@/server/rateLimit";
import {
  findTicket,
  loadOwnedSubmission,
  MAX_TRACKED_SUBMISSIONS,
} from "@/server/submissions";

export const runtime = "nodejs";

/** Every submission id in one request, deduped. The page asks for the address
 * ONCE per drop and applies it to every bill we couldn't read, so the common
 * call carries several ids; `submissionId` stays accepted for a single one. */
function requestedIds(body: Record<string, unknown>): string[] | null {
  const { submissionId, submissionIds } = body;
  const raw = Array.isArray(submissionIds)
    ? submissionIds
    : submissionId === undefined
      ? []
      : [submissionId];
  if (raw.length === 0 || raw.length > MAX_TRACKED_SUBMISSIONS) return null;
  if (!raw.every((id) => typeof id === "string")) return null;
  return [...new Set(raw as string[])];
}

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
  const { email } = (body ?? {}) as Record<string, unknown>;
  const ids = requestedIds((body ?? {}) as Record<string, unknown>);
  if (
    !ids ||
    typeof email !== "string" ||
    !email.includes("@") ||
    email.length > 255
  )
    return Response.json({ error: "Invalid body" }, { status: 400 });

  const jar = await cookies();
  const cookiePairs = jar.getAll();

  // Each id is checked against its own ticket. One unownable id in the list
  // can't lend ownership to the others, and can't fail the whole batch either —
  // a cookie evicted mid-drop shouldn't cost the visitor the bills they can
  // still be told about.
  const saved: string[] = [];
  for (const id of ids) {
    const ticket = findTicket(cookiePairs, id);
    if (!ticket) continue;
    const row = await loadOwnedSubmission(db, ticket.id, ticket.secret);
    if (!row) continue;
    await db
      .update(billSubmissions)
      .set({ notifyEmail: email.trim() })
      .where(eq(billSubmissions.id, row.id));
    saved.push(row.id);
  }

  // Nothing matched: the caller owns none of what it named, which is the same
  // answer the single-id form gave.
  if (saved.length === 0)
    return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ ok: true, saved: saved.length });
}

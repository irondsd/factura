import { cookies } from "next/headers";
import { db } from "@/db";
import type { ClaimResponse } from "@/lib/probar";
import { auth } from "@/server/auth";
import { claimSubmissions } from "@/server/claim";
import { limitKey, PROBAR_CLAIM, take } from "@/server/rateLimit";
import { readTickets, trackedCookieNames } from "@/server/submissions";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Attach the submissions this browser dropped on /probar to the signed-in
 * account, then forget them.
 *
 * Takes no body: the submission ids come from the httpOnly cookie, never from
 * the caller, so a signed-in user can only ever claim bills they actually
 * dropped. A Route Handler rather than a tRPC mutation because the whole job is
 * a cookie lifecycle — read it, spend it, delete it — and owning the response
 * explicitly beats relying on the tRPC adapter's incidental access to it. */
export async function POST(request: Request) {
  const limit = take(limitKey(request, "probar:claim"), PROBAR_CLAIM);
  if (!limit.ok)
    return Response.json(
      { error: "Too many requests", retryAfterSec: limit.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );

  // Defense in depth behind SameSite=Lax: reject a cross-site POST outright
  // rather than trusting cookie policy alone to have kept it credential-free.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none")
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const jar = await cookies();
  const tickets = readTickets(jar.getAll());
  if (tickets.length === 0) return Response.json({ results: [] } as ClaimResponse);

  const results = await claimSubmissions(db, userId, tickets);

  // Spent. Clearing them is also what stops the sign-up path (which can read
  // the cookies but not write them) from retrying these rows on every /app
  // visit. `path` must match what /submit set, or the browser scopes the expiry
  // to /api/probar/claim and the originals survive.
  for (const name of trackedCookieNames(jar.getAll()))
    jar.delete({ name, path: "/" });

  // The claim event is captured by the caller (ClaimSubmissions), where
  // posthog-js already holds the identity the rest of the /probar funnel was
  // recorded against. A server event keyed by `userId` would land on a
  // different person than the client's `identify(email)` and break the join.

  return Response.json({ results } as ClaimResponse);
}

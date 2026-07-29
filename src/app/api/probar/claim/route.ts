import { cookies } from "next/headers";
import { after } from "next/server";
import { db } from "@/db";
import { getPostHogClient } from "@/lib/posthog-server";
import type { ClaimResponse } from "@/lib/probar";
import { auth } from "@/server/auth";
import { claimSubmissions } from "@/server/claim";
import { limitKey, PROBAR_CLAIM, take } from "@/server/rateLimit";
import { parseTickets, SUBMISSION_COOKIE } from "@/server/submissions";

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
  const tickets = parseTickets(jar.get(SUBMISSION_COOKIE)?.value);
  if (tickets.length === 0) return Response.json({ results: [] } as ClaimResponse);

  const results = await claimSubmissions(db, userId, tickets);

  // Spent. Clearing it is also what stops the sign-up path (which can read the
  // cookie but not write one) from retrying these rows on every /app visit.
  jar.delete(SUBMISSION_COOKIE);

  after(async () => {
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: userId,
      event: "probar_claimed",
      properties: {
        count: results.length,
        claimed: results.filter((r) => r.status === "claimed").length,
      },
    });
    await posthog.shutdown();
  });

  return Response.json({ results } as ClaimResponse);
}

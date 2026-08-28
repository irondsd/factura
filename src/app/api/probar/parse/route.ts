import { after } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { billSubmissions } from "@/db/schema";
import { type ParseResponse, type Tier, TIERS } from "@/lib/probar";
import { normalize } from "@/parsers/normalize";
import { probarOptions, withProbarCors } from "@/server/probarCors";
import { limitKey, PROBAR_PARSE, take } from "@/server/rateLimit";
import { notifyUnrecognizedSubmission } from "@/server/submissions/alerts";
import { runTier } from "@/server/submissions/cascade";
import { findTicket, loadOwnedSubmission } from "@/server/submissions";

// The worker the cascade spawns needs Node's worker_threads.
export const runtime = "nodejs";
export const maxDuration = 30;

function isTier(value: unknown): value is Tier {
  return (
    typeof value === "string" && (TIERS as readonly string[]).includes(value)
  );
}

/** Run ONE trust tier against a submission. The browser calls this once per tier
 * — official, then verified, then community — stopping at the first match, so
 * the page can show the cascade stepping rather than a single spinner.
 *
 * The result is persisted on the submission row, and it's that row (never
 * anything the client sends back) that a later claim reads. The client cannot
 * name the parser its bill was filed under. */
async function handlePost(request: Request) {
  const limit = take(limitKey(request, "probar:parse"), PROBAR_PARSE);
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
  const { submissionId, tier } = (body ?? {}) as Record<string, unknown>;
  if (typeof submissionId !== "string" || !isTier(tier))
    return Response.json({ error: "Invalid body" }, { status: 400 });

  // Authorization is possession of the submission's secret, held in the
  // httpOnly cookie. 404 rather than 401/403 on every failure, so a caller with
  // a guessed id can't learn whether it exists.
  const jar = await cookies();
  const ticket = findTicket(jar.getAll(), submissionId);
  if (!ticket) return Response.json({ error: "Not found" }, { status: 404 });

  const row = await loadOwnedSubmission(db, ticket.id, ticket.secret);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });

  // A claimed submission is a real bill now; re-parsing it would rewrite history
  // the user already acted on.
  if (row.claimedByUserId || row.outcome === "no_text")
    return Response.json({ error: "Not found" }, { status: 404 });

  const run = await runTier(db, tier, normalize(row.rawText));
  const best = run.best;

  if (best) {
    await db
      .update(billSubmissions)
      .set({
        outcome: best.ok ? "parsed" : "parse_failed",
        matchedTier: best.tier,
        matchedConfigId: best.configId,
        matchedVersionId: best.versionId,
        matchedSlug: best.slug,
        matchedVendorName: best.displayName,
        result: best.result,
        parseError: best.error,
      })
      .where(eq(billSubmissions.id, row.id));
  } else if (tier === TIERS[TIERS.length - 1]) {
    // Last tier and still nothing: the cascade is exhausted. Recording this is
    // what makes the table useful — these are the bills worth writing a parser
    // for next.
    await db
      .update(billSubmissions)
      .set({ outcome: "unrecognized" })
      .where(eq(billSubmissions.id, row.id));

    // …and telling us about it is what makes them arrive while the visitor is
    // still on the page. Only on the transition — a re-parse of a submission
    // already known to be unrecognized posts nothing — and after the response,
    // because reading the PDF back off storage to attach it must never be
    // something the visitor waits through.
    if (row.outcome !== "unrecognized")
      after(async () => {
        try {
          await notifyUnrecognizedSubmission(row);
        } catch (err) {
          console.error("[probar] unrecognized-bill notice failed:", err);
        }
      });
  }

  const response: ParseResponse = {
    tier,
    matched: best !== null,
    ambiguous: run.ambiguous,
    evaluated: run.evaluated,
    best,
    alternatives: run.alternatives,
  };
  return Response.json(response);
}

export const POST = withProbarCors(handlePost);
export const OPTIONS = probarOptions();

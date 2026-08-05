import { db } from "@/db";
import { revokeToken } from "@/server/mcp/oauth";
import { limitKey, OAUTH_TOKEN, take } from "@/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RFC 7009 token revocation — how a client disconnects itself, as opposed to
 * the user disconnecting it from the connections page.
 *
 * The spec requires 200 for an unknown token, which reads wrong until you see
 * why: a revocation endpoint that distinguished "revoked" from "no such token"
 * would be an oracle for testing whether a stolen string is live. The client's
 * goal — that this token no longer works — is satisfied either way. */
export async function POST(request: Request) {
  const burst = take(limitKey(request, "oauth:revoke"), OAUTH_TOKEN);
  if (!burst.ok) {
    return new Response(null, {
      status: 429,
      headers: { "Retry-After": String(burst.retryAfterSec) },
    });
  }

  let token: string | null = null;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { token?: unknown };
      token = typeof body.token === "string" ? body.token : null;
    } else {
      token = new URLSearchParams(await request.text()).get("token");
    }
  } catch {
    // Fall through to the 200 below: a malformed revocation is still a request
    // to stop using a token, and there is nothing useful to tell the caller.
  }

  if (token) await revokeToken(db, token);

  return new Response(null, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

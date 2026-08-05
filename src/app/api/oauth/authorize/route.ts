import { db } from "@/db";
import { auth } from "@/server/auth";
import { checkAuthorizeRequest, redirectBack } from "@/server/mcp/authorize";
import { baseUrl, mcpResourceUrl } from "@/server/mcp/config";
import { findClient, issueAuthCode } from "@/server/mcp/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The consent decision. The user has read the screen at /oauth/authorize and
 * pressed Allow or Deny; this is where that becomes an authorization code, or
 * an `access_denied` sent back to the client.
 *
 * Two things guard it, because this is the endpoint where a cross-site request
 * would silently hand somebody's bills to an attacker's client:
 *
 *   1. The Auth.js session cookie is SameSite=Lax, so a cross-site form POST
 *      does not carry it and arrives unauthenticated. That is the same property
 *      /api/probar/claim leans on, and it is the load-bearing one.
 *   2. An explicit Origin check on top, because a defence that rests entirely
 *      on a cookie attribute set somewhere else is one refactor away from
 *      being gone.
 *
 * The form fields are re-validated from scratch against the registered client
 * rather than trusted. They travelled through the user's browser, so they are
 * input, not state — the page that rendered them proves nothing about what came
 * back.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== baseUrl()) {
    return new Response("Cross-origin consent submissions are not accepted.", {
      status: 403,
    });
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    // The session expired between rendering the screen and pressing the button.
    // Nothing to redirect to safely yet — the parameters have not been checked —
    // so send them back to sign in and return here.
    return new Response("Not signed in.", { status: 401 });
  }

  const form = await request.formData();
  const query = new URLSearchParams();
  for (const key of [
    "client_id",
    "redirect_uri",
    "state",
    "code_challenge",
    "code_challenge_method",
    "response_type",
    "scope",
    "resource",
  ]) {
    const value = form.get(key);
    if (typeof value === "string" && value !== "") query.set(key, value);
  }

  const clientId = query.get("client_id");
  const client = clientId ? ((await findClient(db, clientId)) ?? null) : null;
  const check = checkAuthorizeRequest(query, client, mcpResourceUrl());

  if (!check.ok) {
    // A fatal failure here means the client_id or redirect_uri did not survive
    // re-validation — nothing may be sent onward, so the user gets the error.
    if (check.fatal) {
      return new Response(check.description, { status: 400 });
    }
    return Response.redirect(
      redirectBack(check.redirectUri, check.state, {
        error: check.error,
        error_description: check.description,
      }),
      303,
    );
  }

  const { params } = check;

  if (form.get("decision") !== "allow") {
    return Response.redirect(
      redirectBack(params.redirectUri, params.state, {
        error: "access_denied",
        error_description: "The user declined the request.",
      }),
      303,
    );
  }

  // `client` is non-null here: checkAuthorizeRequest returns fatal otherwise.
  const code = await issueAuthCode(db, {
    clientRowId: client!.id,
    userId,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    scope: params.scope,
    resource: params.resource,
  });

  // 303 so the browser follows with GET. A 302 after a POST is where redirect
  // loops and re-submitted consents come from.
  return Response.redirect(
    redirectBack(params.redirectUri, params.state, { code }),
    303,
  );
}

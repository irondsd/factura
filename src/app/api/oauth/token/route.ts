import { db } from "@/db";
import { resourceMatches } from "@/server/mcp/authorize";
import { mcpResourceUrl } from "@/server/mcp/config";
import { exchangeAuthCode, rotateRefreshToken } from "@/server/mcp/oauth";
import { ACCESS_TOKEN_TTL_MS } from "@/server/mcp/tokens";
import { limitKey, OAUTH_TOKEN, take } from "@/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The OAuth token endpoint: authorization codes in, token pairs out, and
 * refresh rotation afterwards.
 *
 * Everything with teeth (single-use codes, PKCE, redirect_uri re-check, refresh
 * reuse detection) lives in @/server/mcp/oauth so it can be reasoned about
 * without the wire format in the way. This file is the form parsing, the error
 * shapes RFC 6749 §5.2 asks for, and nothing else.
 */

/** RFC 6749 §5.2: `invalid_client` is the one that carries 401, because it is a
 * failure to authenticate rather than a bad request. */
function oauthError(error: string, description: string) {
  return Response.json(
    { error, error_description: description },
    {
      status: error === "invalid_client" ? 401 : 400,
      headers: {
        // Token responses must never be cached — this one contains credentials.
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

export async function POST(request: Request) {
  const burst = take(limitKey(request, "oauth:token"), OAUTH_TOKEN);
  if (!burst.ok) {
    return Response.json(
      { error: "temporarily_unavailable" },
      { status: 429, headers: { "Retry-After": String(burst.retryAfterSec) } },
    );
  }

  let form: URLSearchParams;
  try {
    // The spec mandates form encoding here, but some clients send JSON anyway.
    // Accepting both costs nothing and turns a confusing "invalid_request" into
    // a working exchange.
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;
      form = new URLSearchParams(
        Object.entries(body).map(([k, v]) => [k, String(v)]),
      );
    } else {
      form = new URLSearchParams(await request.text());
    }
  } catch {
    return oauthError("invalid_request", "Could not read the request body.");
  }

  const grantType = form.get("grant_type");
  const clientId = form.get("client_id");
  const clientSecret = form.get("client_secret");

  if (!clientId) {
    return oauthError("invalid_client", "Missing client_id.");
  }

  // RFC 8707 again, on the redemption side. A client that names a resource must
  // name this one — the token it is about to get is only good here.
  const resource = form.get("resource");
  if (resource !== null && !resourceMatches(resource, mcpResourceUrl())) {
    return oauthError(
      "invalid_target",
      `This authorization server only issues tokens for ${mcpResourceUrl()}.`,
    );
  }

  if (grantType === "authorization_code") {
    const code = form.get("code");
    const redirectUri = form.get("redirect_uri");
    const codeVerifier = form.get("code_verifier");

    if (!code) return oauthError("invalid_request", "Missing code.");
    if (!redirectUri)
      return oauthError("invalid_request", "Missing redirect_uri.");
    if (!codeVerifier)
      return oauthError("invalid_request", "Missing code_verifier.");

    const result = await exchangeAuthCode(db, {
      code,
      clientId,
      redirectUri,
      codeVerifier,
      clientSecret,
    });
    if (!result.ok) return oauthError(result.error, result.description);
    return tokenResponse(result);
  }

  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token");
    if (!refreshToken)
      return oauthError("invalid_request", "Missing refresh_token.");

    const result = await rotateRefreshToken(db, {
      refreshToken,
      clientId,
      clientSecret,
    });
    if (!result.ok) return oauthError(result.error, result.description);
    return tokenResponse(result);
  }

  return oauthError(
    "unsupported_grant_type",
    "Supported grant types are authorization_code and refresh_token.",
  );
}

function tokenResponse(result: {
  accessToken: string;
  refreshToken: string;
  scope: string;
}) {
  return Response.json(
    {
      access_token: result.accessToken,
      token_type: "Bearer",
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      refresh_token: result.refreshToken,
      scope: result.scope,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
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

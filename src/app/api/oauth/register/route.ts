import { z } from "zod";
import { db } from "@/db";
import { isAcceptableRedirectUri } from "@/server/mcp/authorize";
import { registerClient } from "@/server/mcp/oauth";
import { limitKey, OAUTH_REGISTER, take } from "@/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RFC 7591 dynamic client registration.
 *
 * Open and unauthenticated, which is the whole reason MCP works with clients
 * this deployment has never heard of: an editor, a CLI, somebody's script can
 * present itself and get a client_id without anyone provisioning anything.
 *
 * What keeps that from being a hole is that a registration grants NOTHING. It
 * is a name and a callback address; access begins only when a signed-in human
 * reads the consent screen and presses Allow. The two things worth being strict
 * about are therefore the redirect URIs (validated below — that is where a
 * stolen authorization code would be delivered) and the volume (rate-limited,
 * because every call writes a row).
 */

/** Field caps are display-length limits, not security ones: every string here
 * is rendered on the consent screen, and a client_name of a thousand characters
 * is a layout attack on the screen where the user is deciding whether to trust
 * this thing. */
const registrationSchema = z.object({
  client_name: z.string().trim().min(1).max(120),
  redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
  client_uri: z.string().max(2000).optional(),
  logo_uri: z.string().max(2000).optional(),
  software_id: z.string().max(120).optional(),
  token_endpoint_auth_method: z.enum(["none", "client_secret_post"]).optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  scope: z.string().max(200).optional(),
});

function error(status: number, code: string, description: string) {
  return Response.json(
    { error: code, error_description: description },
    { status },
  );
}

export async function POST(request: Request) {
  const burst = take(limitKey(request, "oauth:register"), OAUTH_REGISTER);
  if (!burst.ok) {
    return Response.json(
      { error: "temporarily_unavailable", retryAfterSec: burst.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(burst.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(400, "invalid_client_metadata", "Body must be JSON.");
  }

  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    return error(
      400,
      "invalid_client_metadata",
      parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    );
  }
  const input = parsed.data;

  const bad = input.redirect_uris.filter(
    (uri) => !isAcceptableRedirectUri(uri),
  );
  if (bad.length > 0) {
    return error(
      400,
      "invalid_redirect_uri",
      `Unusable redirect_uri: ${bad.join(", ")}. Use https, http on loopback, or a private scheme.`,
    );
  }

  // We only implement these two grant types, so a client asking for something
  // else (implicit, password) is told now rather than at the token endpoint
  // after the user has already been walked through a consent screen.
  const unsupported = (input.grant_types ?? []).filter(
    (g) => g !== "authorization_code" && g !== "refresh_token",
  );
  if (unsupported.length > 0) {
    return error(
      400,
      "invalid_client_metadata",
      `Unsupported grant_types: ${unsupported.join(", ")}.`,
    );
  }

  const { clientId, clientSecret } = await registerClient(db, {
    clientName: input.client_name,
    redirectUris: input.redirect_uris,
    clientUri: input.client_uri,
    logoUri: input.logo_uri,
    softwareId: input.software_id,
    tokenEndpointAuthMethod: input.token_endpoint_auth_method,
  });

  return Response.json(
    {
      client_id: clientId,
      // Present only for a confidential client, and only in this response —
      // it is stored hashed and cannot be read back afterwards.
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      // 0 means "does not expire" (RFC 7591 §3.2.1).
      ...(clientSecret ? { client_secret_expires_at: 0 } : {}),
      client_name: input.client_name,
      redirect_uris: input.redirect_uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: clientSecret ? "client_secret_post" : "none",
    },
    { status: 201, headers: { "Access-Control-Allow-Origin": "*" } },
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

import "server-only";
import { MCP_SCOPE } from "./scope";

/** Where this deployment says it lives, and the documents that say it.
 *
 * Every URL an MCP client is handed comes from here. That matters more than it
 * looks: an OAuth issuer is compared as an exact string, so a token minted
 * against `https://factura.uno` and validated against `https://www.factura.uno`
 * is simply invalid. One function, used by both the metadata documents and the
 * endpoints they describe, is what keeps them from drifting apart.
 */

export { MCP_SCOPE };

/** Absolute origin, no trailing slash.
 *
 * Same env precedence as the email links (AUTH_URL, then NEXT_PUBLIC_APP_URL,
 * then the dev port), so a deployment configures its address once. Taken from
 * configuration rather than from the incoming request's Host header on purpose:
 * Host is attacker-controlled, and an issuer that echoes it would let anyone who
 * can reach the app mint metadata pointing wherever they like. */
export function baseUrl(): string {
  return (
    process.env.AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:4000"
  ).replace(/\/$/, "");
}

/** The OAuth issuer identifier. Bare origin, no path, no trailing slash. */
export function issuer(): string {
  return baseUrl();
}

/** The protected resource itself — the MCP endpoint. This exact string is what
 * clients send as RFC 8707 `resource`, and what both endpoints check it
 * against. */
export function mcpResourceUrl(): string {
  return `${baseUrl()}/api/mcp`;
}

export function authorizationEndpoint(): string {
  return `${baseUrl()}/oauth/authorize`;
}

export function tokenEndpoint(): string {
  return `${baseUrl()}/api/oauth/token`;
}

export function registrationEndpoint(): string {
  return `${baseUrl()}/api/oauth/register`;
}

export function revocationEndpoint(): string {
  return `${baseUrl()}/api/oauth/revoke`;
}

/** Where a client should look for the metadata that describes this resource
 * (RFC 9728). Sent in the `WWW-Authenticate` header on every 401 from the MCP
 * endpoint — that header is the entire bootstrap: it is how a client that knows
 * only the MCP URL discovers there is an authorization server at all. */
export function protectedResourceMetadataUrl(): string {
  return `${baseUrl()}/.well-known/oauth-protected-resource`;
}

/** RFC 9728 §2. Says what this resource is and who can authorize access to it. */
export function protectedResourceMetadata() {
  return {
    resource: mcpResourceUrl(),
    authorization_servers: [issuer()],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Factura MCP",
    resource_documentation: `${baseUrl()}/docs`,
  };
}

/** RFC 8414 §2. Everything a client needs to run the flow without being told
 * anything out of band.
 *
 * `code_challenge_methods_supported` is S256 and nothing else — OAuth 2.1
 * removes `plain`, and advertising it would invite clients to use it.
 * `token_endpoint_auth_methods_supported` leads with `none` because the typical
 * MCP client is a public client on someone's machine with no way to keep a
 * secret; PKCE is what secures it. */
export function authorizationServerMetadata() {
  return {
    issuer: issuer(),
    authorization_endpoint: authorizationEndpoint(),
    token_endpoint: tokenEndpoint(),
    registration_endpoint: registrationEndpoint(),
    revocation_endpoint: revocationEndpoint(),
    scopes_supported: [MCP_SCOPE],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    code_challenge_methods_supported: ["S256"],
    service_documentation: `${baseUrl()}/docs`,
  };
}

/** The `WWW-Authenticate` value for an unauthenticated or rejected MCP call.
 *
 * `resource_metadata` is the part that does the work; the rest is RFC 6750
 * error reporting so a client can tell "I have no token" from "my token
 * expired" and refresh instead of restarting the whole flow. */
export function wwwAuthenticate(
  error?: "invalid_token" | "insufficient_scope",
  description?: string,
): string {
  const parts = [
    `Bearer resource_metadata="${protectedResourceMetadataUrl()}"`,
  ];
  if (error) parts.push(`error="${error}"`);
  if (description)
    parts.push(`error_description="${description.replace(/"/g, "")}"`);
  return parts.join(", ");
}

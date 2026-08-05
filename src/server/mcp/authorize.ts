import { MCP_SCOPE } from "./scope";

/** Validation for an /authorize request, split out from the page and the route
 * handler that both need it — and kept pure so the rules can be tested without
 * a browser, a session or a database.
 *
 * The distinction that matters here is between failures that may be reported
 * back to the client and failures that may not. RFC 6749 §4.1.2.1 is explicit:
 * if `client_id` or `redirect_uri` is missing, unknown or unregistered, the
 * server MUST NOT redirect. Doing so would turn this endpoint into an open
 * redirector that anyone can point anywhere, and would hand an attacker a
 * factura.uno URL that bounces to their own site. Those failures are `fatal`
 * and get rendered as a page the user reads. Everything after that point is
 * reported to a redirect URI we have already verified belongs to the client.
 */

/** The parameters of a well-formed authorization request. */
export type AuthorizeParams = {
  clientId: string;
  redirectUri: string;
  /** Opaque client value, echoed back untouched. Null when the client omitted
   * it — it is the client's own CSRF defence, so its absence is their problem
   * to have, not ours to reject over. */
  state: string | null;
  codeChallenge: string;
  scope: string;
  /** RFC 8707 resource indicator, when sent. */
  resource: string | null;
};

export type AuthorizeCheck =
  /** Nothing may be sent to the client: render an error the user can read. */
  | { ok: false; fatal: true; error: string; description: string }
  /** Report to the client at its verified redirect URI. */
  | {
      ok: false;
      fatal: false;
      error: string;
      description: string;
      redirectUri: string;
      state: string | null;
    }
  | { ok: true; params: AuthorizeParams };

/** What the checker needs to know about the registered client. Deliberately not
 * the database row — this function has no business reading anything else off
 * it, and the narrow shape says so. */
export type RegisteredClient = { redirectUris: string[] } | null;

export function checkAuthorizeRequest(
  query: URLSearchParams,
  client: RegisteredClient,
  expectedResource: string,
): AuthorizeCheck {
  const clientId = query.get("client_id");
  if (!clientId) {
    return {
      ok: false,
      fatal: true,
      error: "invalid_request",
      description: "Missing client_id.",
    };
  }
  if (!client) {
    return {
      ok: false,
      fatal: true,
      error: "invalid_client",
      description: "This application is not registered with Factura.",
    };
  }

  const redirectUri = query.get("redirect_uri");
  if (!redirectUri) {
    return {
      ok: false,
      fatal: true,
      error: "invalid_request",
      description: "Missing redirect_uri.",
    };
  }
  // Exact match, never a prefix. See redirectUriAllowed in ./oauth.ts.
  if (!client.redirectUris.includes(redirectUri)) {
    return {
      ok: false,
      fatal: true,
      error: "invalid_request",
      description: "redirect_uri is not registered for this application.",
    };
  }

  // From here the redirect URI is verified, so failures are reportable.
  const state = query.get("state");
  const fail = (error: string, description: string): AuthorizeCheck => ({
    ok: false,
    fatal: false,
    error,
    description,
    redirectUri,
    state,
  });

  if (query.get("response_type") !== "code") {
    return fail(
      "unsupported_response_type",
      "Only the authorization code flow is supported.",
    );
  }

  const codeChallenge = query.get("code_challenge");
  if (!codeChallenge) {
    // PKCE is mandatory under OAuth 2.1 — there is no non-PKCE path to fall
    // back to, so a client that omits the challenge is refused rather than
    // quietly given a weaker grant.
    return fail("invalid_request", "PKCE is required: missing code_challenge.");
  }
  const method = query.get("code_challenge_method");
  if (method !== "S256") {
    return fail("invalid_request", "code_challenge_method must be S256.");
  }

  // An absent scope means "whatever you offer", which here is exactly one
  // thing. A present scope must name only that.
  const requested = query.get("scope");
  const scopes = requested
    ? requested.split(/\s+/).filter(Boolean)
    : [MCP_SCOPE];
  const unknown = scopes.filter((s) => s !== MCP_SCOPE);
  if (unknown.length > 0) {
    return fail("invalid_scope", `Unknown scope: ${unknown.join(", ")}.`);
  }

  // RFC 8707. A client that names a resource must name this one; a token minted
  // here is only ever good for this deployment's MCP endpoint, and saying so
  // out loud is what stops a token from being replayed against a different
  // server that trusts the same issuer.
  const resource = query.get("resource");
  if (resource !== null && !resourceMatches(resource, expectedResource)) {
    return fail(
      "invalid_target",
      `This authorization server only issues tokens for ${expectedResource}.`,
    );
  }

  return {
    ok: true,
    params: {
      clientId,
      redirectUri,
      state,
      codeChallenge,
      scope: MCP_SCOPE,
      resource,
    },
  };
}

/** Resource indicators are compared as URIs, not as raw strings: a trailing
 * slash and a differently-cased host are the same resource, and rejecting a
 * client over one would be a compatibility bug wearing a security costume.
 * Everything that actually distinguishes one resource from another — scheme,
 * host, port, path — still has to match. */
export function resourceMatches(candidate: string, expected: string): boolean {
  try {
    const a = new URL(candidate);
    const b = new URL(expected);
    return (
      a.protocol === b.protocol &&
      a.host.toLowerCase() === b.host.toLowerCase() &&
      a.pathname.replace(/\/$/, "") === b.pathname.replace(/\/$/, "")
    );
  } catch {
    return false;
  }
}

/** Schemes that must never be accepted as a redirect target. Each one turns a
 * redirect into code execution or a local file read in whatever browser follows
 * it, and none of them is a plausible OAuth callback. */
const FORBIDDEN_SCHEMES = new Set([
  "javascript:",
  "data:",
  "vbscript:",
  "file:",
  "blob:",
]);

/** Is this a redirect URI we will accept at registration time?
 *
 * Three shapes are legitimate for an MCP client:
 *   • https, for a hosted client like claude.ai;
 *   • http on loopback, for a desktop client that spins up a local listener —
 *     the one case where plaintext is fine, because the traffic never leaves
 *     the machine;
 *   • a private scheme (`cursor://`, `vscode://`), for a native app the OS
 *     hands the callback to directly.
 *
 * Plain http to a real host is refused: the authorization code would cross the
 * network in the clear, and a code in the clear is an account in the clear. */
export function isAcceptableRedirectUri(candidate: string): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (FORBIDDEN_SCHEMES.has(url.protocol)) return false;
  // A fragment is meaningless on a redirect target and is never sent to the
  // server; its presence means the client has misunderstood something.
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") {
    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
  }
  // Any other scheme is a native-app callback. It must at least be a scheme —
  // `new URL` guarantees that much — and must not be one of the dangerous ones
  // ruled out above.
  return url.protocol.length > 1;
}

/** Build the redirect back to the client, for either outcome. `state` rides
 * along untouched whenever the client sent one. */
export function redirectBack(
  redirectUri: string,
  state: string | null,
  params: Record<string, string>,
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  if (state !== null) url.searchParams.set("state", state);
  return url.toString();
}

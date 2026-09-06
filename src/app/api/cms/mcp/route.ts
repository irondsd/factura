import { db } from "@/db";
import { handleCmsMessage } from "@/cms/mcp/handler";
import { resolveCmsToken } from "@/cms/mcp/tokens";
import {
  checkLegacyHeaders,
  checkRequestHeaders,
  detectEra,
  faultResponse,
  httpStatusFor,
  isNotification,
  isSupportedVersion,
  legacyResponseVersion,
  negotiateVersion,
  parseMessage,
  PROTOCOL_VERSION,
  type ProtocolEra,
  type RequestHeaders,
  RPC,
  rpcError,
} from "@/server/mcp/protocol";
import { limitKey, MCP_CALL, take } from "@/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Wide open on purpose, and safe here for one specific reason: this endpoint
 * authenticates with a bearer token and nothing else. It reads no cookie, so a
 * browser cannot be made to authenticate to it silently — the attacker would
 * need the token, and with the token they do not need the browser. The DNS
 * rebinding attack the spec's origin rule defends against targets *local*
 * servers that trust the network instead of a credential; this one is neither.
 * Locking the list down would break claude.ai connectors, whose origin is not
 * ours to enumerate. */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, MCP-Protocol-Version, Mcp-Method, Mcp-Name",
  "Access-Control-Expose-Headers": "MCP-Protocol-Version",
} as const;

/** The version stamped on a response is the one the exchange actually used, so
 * a legacy client is answered in its own era's terms rather than being told
 * about a revision it cannot speak. Before a request is parsed there is no era
 * yet — only whatever the client declared — so those early answers echo a
 * declared version we recognise and otherwise name our preferred one. */
const headersFor = (version: string) =>
  ({
    ...CORS,
    "Cache-Control": "no-store",
    "MCP-Protocol-Version": version,
  }) as const;

const HEADERS = headersFor(PROTOCOL_VERSION);

const json = (body: unknown, status: number, version = PROTOCOL_VERSION) =>
  Response.json(body, { status, headers: headersFor(version) });

export async function POST(request: Request) {
  const limited = take(limitKey(request, "cms:mcp"), MCP_CALL);
  if (!limited.ok)
    return Response.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { ...HEADERS, "Retry-After": String(limited.retryAfterSec) },
      },
    );

  // Authenticate before parsing anything. An unauthenticated caller learns
  // nothing about the protocol, and the body is never read on their behalf.
  const bearer = /^Bearer\s+(\S+)$/i.exec(
    request.headers.get("authorization") ?? "",
  )?.[1];
  const caller = bearer ? await resolveCmsToken(bearer, db) : null;
  const declared = request.headers.get("mcp-protocol-version");
  const stamp = isSupportedVersion(declared)
    ? (declared as string)
    : PROTOCOL_VERSION;
  if (!caller) return json({ error: "unauthorized" }, 401, stamp);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(
      rpcError(0, RPC.PARSE_ERROR, "Request body is not valid JSON."),
      400,
      stamp,
    );
  }

  // JSON-RPC batching left MCP in `2025-06-18`, and `2025-03-26` — which this
  // endpoint accepts — is the last revision that allowed it. Rejected for both
  // anyway: no client this serves batches, and the alternative is a second
  // wire format whose per-message era could differ inside one body.
  if (Array.isArray(body))
    return json(
      rpcError(
        0,
        RPC.INVALID_REQUEST,
        "Batched requests are not supported. Send one JSON-RPC message per POST.",
      ),
      400,
      stamp,
    );

  const parsed = parseMessage(body);
  if (!parsed.ok)
    return json(rpcError(0, RPC.INVALID_REQUEST, parsed.reason), 400, stamp);
  const message = parsed.message;

  // Which era this is decided once, here, from the framing the client used —
  // and everything downstream, validation and response shape alike, follows
  // from it. Nothing is remembered between requests: the next POST on this same
  // connection is sorted again from scratch.
  const headers: RequestHeaders = {
    protocolVersion: request.headers.get("mcp-protocol-version"),
    method: request.headers.get("mcp-method"),
    name: request.headers.get("mcp-name"),
  };
  const era: ProtocolEra = detectEra(message, headers);
  // A legacy response is stamped with the version that exchange is actually
  // using: whatever the client declared in the header, except on `initialize`,
  // where the header does not exist yet and the negotiated version — the one
  // the body is about to agree to — is the only coherent answer.
  const version =
    era === "modern"
      ? stamp
      : message.method === "initialize"
        ? negotiateVersion(message.params?.protocolVersion)
        : legacyResponseVersion(headers);

  // A notification gets 202 and no body. Neither era defines a client-to-server
  // notification over HTTP that this endpoint answers — `notifications/
  // initialized`, which a legacy client sends after the handshake, is exactly
  // this case — so they are acknowledged rather than validated.
  if (isNotification(message))
    return new Response(null, { status: 202, headers: headersFor(version) });

  const id = message.id as string | number;
  const fault =
    era === "modern"
      ? checkRequestHeaders(message, headers)
      : checkLegacyHeaders(headers);
  if (fault) {
    const response = faultResponse(id, fault);
    return json(response, httpStatusFor(response, era), version);
  }

  try {
    const response = await handleCmsMessage(message, caller, era);
    if (!response)
      return new Response(null, { status: 202, headers: headersFor(version) });
    return json(response, httpStatusFor(response, era), version);
  } catch (cause) {
    // The handler catches tool failures itself, so reaching here means dispatch
    // broke. Answer in band: an unhandled rejection here becomes a 500 with an
    // HTML body, which is the one thing an MCP client cannot parse.
    console.error("[cms-mcp] dispatch failed:", cause);
    const response = rpcError(
      id,
      RPC.INTERNAL_ERROR,
      "The server could not handle this request.",
    );
    return json(response, httpStatusFor(response, era), version);
  }
}

/** The GET stream and the DELETE that ended a session both left the protocol in
 * `2026-07-28`, and this endpoint never implemented either: it has always been
 * stateless, so there was no session to resume or to end. 405 is the answer in
 * both eras — a 2025-era client treats it as "no server-initiated stream here"
 * and carries on over POST, which is all it ever needed. */
const gone = () =>
  new Response(null, {
    status: 405,
    headers: { ...HEADERS, Allow: "POST, OPTIONS" },
  });
export const GET = gone;
export const DELETE = gone;

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...HEADERS, "Access-Control-Max-Age": "86400" },
  });
}

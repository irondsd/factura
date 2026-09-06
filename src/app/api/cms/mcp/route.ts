import { db } from "@/db";
import { handleCmsMessage, legacyInitializeFault } from "@/cms/mcp/handler";
import { resolveCmsToken } from "@/cms/mcp/tokens";
import {
  checkRequestHeaders,
  faultResponse,
  httpStatusFor,
  isNotification,
  parseMessage,
  PROTOCOL_VERSION,
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

const HEADERS = {
  ...CORS,
  "Cache-Control": "no-store",
  "MCP-Protocol-Version": PROTOCOL_VERSION,
} as const;

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: HEADERS });

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
  if (!caller) return json({ error: "unauthorized" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(
      rpcError(0, RPC.PARSE_ERROR, "Request body is not valid JSON."),
      400,
    );
  }

  // JSON-RPC batching left MCP in `2025-06-18`; the body is one message.
  if (Array.isArray(body))
    return json(
      rpcError(
        0,
        RPC.INVALID_REQUEST,
        "Batched requests are not supported. Send one JSON-RPC message per POST.",
      ),
      400,
    );

  const parsed = parseMessage(body);
  if (!parsed.ok)
    return json(rpcError(0, RPC.INVALID_REQUEST, parsed.reason), 400);
  const message = parsed.message;

  // Answered before header validation, and deliberately: a client still
  // speaking the handshake sends none of the headers this revision requires, so
  // checking them first would bury the one error that tells its user what is
  // actually wrong under a complaint about a missing header.
  if (message.method === "initialize") {
    const fault = legacyInitializeFault();
    const response = faultResponse(message.id ?? 0, fault);
    return json(response, httpStatusFor(response));
  }

  // A notification gets 202 and no body. This revision defines no
  // client-to-server notifications over HTTP and does not specify header
  // requirements for them, so they are acknowledged rather than validated.
  if (isNotification(message))
    return new Response(null, { status: 202, headers: HEADERS });

  const id = message.id as string | number;
  const fault = checkRequestHeaders(message, {
    protocolVersion: request.headers.get("mcp-protocol-version"),
    method: request.headers.get("mcp-method"),
    name: request.headers.get("mcp-name"),
  });
  if (fault) {
    const response = faultResponse(id, fault);
    return json(response, httpStatusFor(response));
  }

  try {
    const response = await handleCmsMessage(message, caller);
    if (!response) return new Response(null, { status: 202, headers: HEADERS });
    return json(response, httpStatusFor(response));
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
    return json(response, httpStatusFor(response));
  }
}

/** The GET stream and the DELETE that ended a session both left the protocol in
 * `2026-07-28`. Answering 405 is what the spec asks a modern-only server to do
 * when an older client reaches for either. */
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

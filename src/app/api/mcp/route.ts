import { db } from "@/db";
import { wwwAuthenticate } from "@/server/mcp/config";
import { handleMessage } from "@/server/mcp/handler";
import {
  ASSUMED_PROTOCOL_VERSION,
  type JsonRpcResponse,
  LATEST_PROTOCOL_VERSION,
  parseMessage,
  RPC,
  rpcError,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@/server/mcp/protocol";
import { resolveBearer } from "@/server/mcp/resolve";
import { bearerFromHeader } from "@/server/mcp/tokens";
import { limitKey, MCP_CALL, take } from "@/server/rateLimit";

// Database work and Node crypto, well past the edge runtime's reach.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The MCP endpoint: one URL, JSON-RPC in the body, Streamable HTTP transport.
 *
 * STATELESS. There is no session id, no `Mcp-Session-Id` header, and no
 * server-initiated stream — every request carries its own bearer token and is
 * answered on the spot. That is a deliberate fit for the deployment: serverless
 * instances have no shared memory to hang a session off, and none of the tools
 * here need to push anything to the client. It is also why GET and DELETE
 * answer 405 rather than opening a stream or ending a session that does not
 * exist.
 *
 * The 401 is load-bearing. It is not merely a rejection: the `WWW-Authenticate`
 * header on it names the protected-resource metadata document, and that is the
 * entire discovery bootstrap. A client that knows only this URL learns from the
 * 401 that there is an authorization server, where it is, and how to register.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, MCP-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, MCP-Protocol-Version",
} as const;

function unauthorized(
  error: "invalid_token" | undefined,
  description: string,
): Response {
  return Response.json(
    { error: "unauthorized", error_description: description },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": wwwAuthenticate(error, description),
        ...CORS,
      },
    },
  );
}

export async function POST(request: Request) {
  // Cheapest check first: an in-process bucket, before any database work and
  // before the token lookup. See the honesty note at the top of rateLimit.ts
  // about what this does and does not protect against.
  const burst = take(limitKey(request, "mcp"), MCP_CALL);
  if (!burst.ok) {
    return Response.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(burst.retryAfterSec), ...CORS },
      },
    );
  }

  // An absent header means an older client that predates it — the spec names
  // 2025-03-26 as the assumption in that case. A header we don't speak is
  // refused with the list, so the client can fall back rather than guess.
  const declared = request.headers.get("mcp-protocol-version");
  if (
    declared !== null &&
    !(SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(declared)
  ) {
    return Response.json(
      {
        error: "unsupported_protocol_version",
        supported: SUPPORTED_PROTOCOL_VERSIONS,
      },
      { status: 400, headers: CORS },
    );
  }
  const negotiated = declared ?? ASSUMED_PROTOCOL_VERSION;

  const bearer = bearerFromHeader(request.headers.get("authorization"));
  if (!bearer) {
    return unauthorized(undefined, "An access token is required.");
  }

  const caller = await resolveBearer(db, bearer);
  if (!caller) {
    // One message for every failure mode — expired, revoked, never existed.
    // Distinguishing them would confirm to an attacker that a guessed token was
    // structurally right.
    return unauthorized(
      "invalid_token",
      "The access token is invalid or expired.",
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      rpcError(0, RPC.PARSE_ERROR, "Request body is not valid JSON."),
      { status: 400, headers: CORS },
    );
  }

  // Batching was removed in the 2025-06-18 revision but is still sent by
  // clients negotiating 2025-03-26, so an array is handled rather than refused.
  const incoming = Array.isArray(body) ? body : [body];
  if (incoming.length === 0) {
    return Response.json(rpcError(0, RPC.INVALID_REQUEST, "Empty batch."), {
      status: 400,
      headers: CORS,
    });
  }

  const responses: JsonRpcResponse[] = [];
  for (const raw of incoming) {
    const parsed = parseMessage(raw);
    if (!parsed.ok) {
      // The id may be unusable on a malformed message; 0 is the conventional
      // stand-in and clients treat it as unmatched.
      const maybeId =
        typeof raw === "object" && raw !== null
          ? (raw as { id?: unknown }).id
          : undefined;
      responses.push(
        rpcError(
          typeof maybeId === "string" || typeof maybeId === "number"
            ? maybeId
            : 0,
          RPC.INVALID_REQUEST,
          parsed.reason,
        ),
      );
      continue;
    }

    try {
      const response = await handleMessage(parsed.message, {
        userId: caller.userId,
      });
      // null = notification: nothing goes back for it.
      if (response) responses.push(response);
    } catch (err) {
      // The handler catches tool failures itself, so reaching here means
      // something broke in dispatch. Log it and answer in-band; a 500 with an
      // HTML body would leave the client with nothing it can parse.
      console.error("[mcp] dispatch failed:", err);
      responses.push(
        rpcError(
          parsed.message.id ?? 0,
          RPC.INTERNAL_ERROR,
          "The server could not handle this request.",
        ),
      );
    }
  }

  const headers = {
    "MCP-Protocol-Version": negotiated,
    "Cache-Control": "no-store",
    ...CORS,
  };

  // Every message was a notification. 202 with no body is what the spec asks
  // for, and a client waiting on a response body would hang without it.
  if (responses.length === 0) {
    return new Response(null, { status: 202, headers });
  }

  return Response.json(Array.isArray(body) ? responses : responses[0], {
    headers,
  });
}

/** GET opens the server-to-client stream in the Streamable HTTP transport.
 * This server has nothing to push, so it declines — which the spec explicitly
 * allows, and which clients handle by simply not opening one. */
export async function GET() {
  return Response.json(
    { error: "This MCP server does not offer a server-initiated stream." },
    { status: 405, headers: { Allow: "POST, OPTIONS", ...CORS } },
  );
}

/** DELETE ends a session. There are none to end. */
export async function DELETE() {
  return Response.json(
    { error: "This MCP server is stateless; there is no session to end." },
    { status: 405, headers: { Allow: "POST, OPTIONS", ...CORS } },
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      ...CORS,
      "Access-Control-Max-Age": "86400",
      "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
    },
  });
}

/** JSON-RPC 2.0 plumbing for the MCP endpoint, protocol revision `2026-07-28`.
 *
 * Written by hand rather than pulled from the reference SDK, deliberately. The
 * SDK's HTTP transport is built around Node's `http.ServerResponse`, which a
 * Next route handler does not have — it speaks Web `Request`/`Response` — and
 * bridging the two costs more than this file does.
 *
 * `2026-07-28` made that bet better rather than worse. The revision deleted
 * protocol-level sessions, the GET stream, SSE resumability and
 * server-initiated requests — which is very nearly the list this file used to
 * name as the moment to take the dependency. What is left is message framing
 * and header validation, and that is all this is.
 *
 * The tradeoff to know about: nothing here is validated against the SDK's own
 * schemas, so protocol drift has to be caught by the tests in
 * ./protocol.test.ts and by actually connecting a client.
 *
 * Pure: no I/O, no clock, no database. The route handler owns the wire.
 */

/** The one revision this server speaks.
 *
 * Deliberately not dual-era. `2026-07-28` removed the `initialize` handshake in
 * favour of per-request metadata, and serving both eras means carrying two
 * shapes of every result forever. The client side of that decision was checked
 * rather than assumed: Claude Code ships the modern runtime, and claude.ai
 * connectors probe for it. A legacy client gets the diagnostic the spec asks
 * for — see the `initialize` branch in the route handler — and nothing else. */
export const PROTOCOL_VERSION = "2026-07-28";
export const SUPPORTED_PROTOCOL_VERSIONS = [PROTOCOL_VERSION] as const;

/** `_meta` keys the spec reserves. Every one carries the mandatory
 * `io.modelcontextprotocol/` prefix, so they are written out rather than
 * assembled — a typo in a key is silent, and grep should find them. */
export const META_PROTOCOL_VERSION = "io.modelcontextprotocol/protocolVersion";
export const META_CLIENT_INFO = "io.modelcontextprotocol/clientInfo";
export const META_CLIENT_CAPABILITIES =
  "io.modelcontextprotocol/clientCapabilities";
export const META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";

export type JsonRpcId = string | number;

export type JsonRpcMessage = {
  jsonrpc: "2.0";
  /** Absent on a notification — that is the only thing distinguishing one. */
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | {
      jsonrpc: "2.0";
      id: JsonRpcId;
      error: { code: number; message: string; data?: unknown };
    };

/** JSON-RPC 2.0 §5.1 reserved codes, plus the two MCP allocates for itself out
 * of the `-32020`..`-32099` band the spec reserves for protocol-defined errors.
 *
 * Anything that went wrong *inside* a tool is still reported as a successful
 * call with `isError: true`, which is what lets the model read the failure and
 * try something else. These codes are for failures of the protocol itself. */
export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  HEADER_MISMATCH: -32020,
  UNSUPPORTED_PROTOCOL_VERSION: -32022,
} as const;

/** The HTTP status each protocol error must be delivered with.
 *
 * This matters more than it looks. A dual-era client tells a modern server from
 * a legacy one by POSTing a modern request and reading the body of a `400` — so
 * `400` plus a recognised code means "this server is modern, fix your request",
 * while a `400` with anything else means "fall back to `initialize`". Returning
 * the wrong status here makes well-behaved clients draw the wrong conclusion.
 * `-32601` is `404` for the same reason: it separates an unimplemented method
 * on a modern endpoint from a `404` for an endpoint that isn't there at all. */
const STATUS_BY_CODE: Record<number, number> = {
  [RPC.PARSE_ERROR]: 400,
  [RPC.INVALID_REQUEST]: 400,
  [RPC.INVALID_PARAMS]: 400,
  [RPC.METHOD_NOT_FOUND]: 404,
  [RPC.INTERNAL_ERROR]: 500,
  [RPC.HEADER_MISMATCH]: 400,
  [RPC.UNSUPPORTED_PROTOCOL_VERSION]: 400,
};

export function httpStatusFor(response: JsonRpcResponse): number {
  return "error" in response
    ? (STATUS_BY_CODE[response.error.code] ?? 400)
    : 200;
}

export function rpcResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data ? { data } : {}) },
  };
}

/** A protocol-level failure, before it is given a JSON-RPC id. Keeping the id
 * out of these lets the pure checks below stay ignorant of message plumbing. */
export type ProtocolFault = { code: number; message: string; data?: unknown };

export const faultResponse = (
  id: JsonRpcId,
  fault: ProtocolFault,
): JsonRpcResponse => rpcError(id, fault.code, fault.message, fault.data);

/** Is this a notification — a message the client expects no answer to?
 *
 * The distinction drives the HTTP status: a notification gets 202 with an empty
 * body, while anything carrying an id gets a response. Getting this wrong makes
 * clients hang. */
export function isNotification(message: JsonRpcMessage): boolean {
  return message.id === undefined;
}

/** Narrow an unknown parsed body to a JSON-RPC message, or explain why not.
 *
 * `id` is checked for type as well as presence: JSON-RPC allows string or
 * number, and null is explicitly not an id — a message with `"id": null` is
 * malformed rather than a notification. */
export function parseMessage(
  value: unknown,
): { ok: true; message: JsonRpcMessage } | { ok: false; reason: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "Message must be a JSON object." };
  }
  const record = value as Record<string, unknown>;
  if (record.jsonrpc !== "2.0") {
    return {
      ok: false,
      reason: 'Missing or invalid "jsonrpc": must be "2.0".',
    };
  }
  if (typeof record.method !== "string" || record.method === "") {
    return { ok: false, reason: 'Missing or invalid "method".' };
  }
  if (
    record.id !== undefined &&
    typeof record.id !== "string" &&
    typeof record.id !== "number"
  ) {
    return { ok: false, reason: '"id" must be a string or a number.' };
  }
  if (
    record.params !== undefined &&
    (typeof record.params !== "object" ||
      record.params === null ||
      Array.isArray(record.params))
  ) {
    return { ok: false, reason: '"params" must be an object.' };
  }
  return {
    ok: true,
    message: {
      jsonrpc: "2.0",
      ...(record.id !== undefined ? { id: record.id as JsonRpcId } : {}),
      method: record.method,
      params: record.params as Record<string, unknown> | undefined,
    },
  };
}

/** The request's `_meta`, which lives inside `params` rather than beside it. */
export function requestMeta(message: JsonRpcMessage): Record<string, unknown> {
  const meta = message.params?._meta;
  return typeof meta === "object" && meta !== null && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : {};
}

export const isSupportedVersion = (value: unknown): value is string =>
  typeof value === "string" &&
  (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(value);

export function unsupportedVersionFault(requested: unknown): ProtocolFault {
  return {
    code: RPC.UNSUPPORTED_PROTOCOL_VERSION,
    message: "Unsupported protocol version",
    data: { supported: [...SUPPORTED_PROTOCOL_VERSIONS], requested },
  };
}

/** Undo the `=?base64?...?=` sentinel a client uses when a header value cannot
 * be written as plain ASCII. Anything not wearing the sentinel is already the
 * literal value; the markers are case-sensitive and lowercase by spec. */
const BASE64_SENTINEL = /^=\?base64\?([\s\S]*)\?=$/;

export function decodeHeaderValue(value: string): string {
  const match = BASE64_SENTINEL.exec(value);
  if (!match) return value;
  try {
    return Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return value;
  }
}

/** The value a conforming client mirrors into `Mcp-Name`, or null when the
 * method has none to mirror. Only `tools/call` is relevant here: this server
 * hosts no resources and no prompts. A `tools/call` that omits `params.name`
 * returns null too — the client is right to send no header for a value that
 * isn't there, and the missing name is the tool dispatcher's complaint to
 * make, with an error the model can actually act on. */
export function mcpNameFor(message: JsonRpcMessage): string | null {
  if (message.method !== "tools/call") return null;
  const name = message.params?.name;
  return typeof name === "string" ? name : null;
}

export type RequestHeaders = {
  protocolVersion: string | null;
  method: string | null;
  name: string | null;
};

/** Check the headers a client is required to mirror from the body against the
 * body itself, then check that we speak the version it asked for.
 *
 * The mirroring exists so intermediaries — load balancers, gateways, WAFs — can
 * route and inspect without parsing the body. That is only safe if someone
 * verifies the two agree, and the spec puts that job on whoever reads the body.
 * Skipping it would let a request be routed as one method and executed as
 * another. */
export function checkRequestHeaders(
  message: JsonRpcMessage,
  headers: RequestHeaders,
): ProtocolFault | null {
  const mismatch = (message: string): ProtocolFault => ({
    code: RPC.HEADER_MISMATCH,
    message,
  });

  if (!headers.method) return mismatch("Missing required header: Mcp-Method.");
  if (headers.method !== message.method)
    return mismatch(
      `Header mismatch: Mcp-Method header value '${headers.method}' does not match body value '${message.method}'.`,
    );

  const expectedName = mcpNameFor(message);
  if (expectedName !== null) {
    if (!headers.name) return mismatch("Missing required header: Mcp-Name.");
    const decoded = decodeHeaderValue(headers.name);
    if (decoded !== expectedName)
      return mismatch(
        `Header mismatch: Mcp-Name header value '${decoded}' does not match body value '${expectedName}'.`,
      );
  }

  if (!headers.protocolVersion)
    return mismatch("Missing required header: MCP-Protocol-Version.");
  const bodyVersion = requestMeta(message)[META_PROTOCOL_VERSION];
  if (typeof bodyVersion !== "string")
    return mismatch(
      `Header mismatch: MCP-Protocol-Version is '${headers.protocolVersion}' but the body carries no '${META_PROTOCOL_VERSION}' in _meta.`,
    );
  if (bodyVersion !== headers.protocolVersion)
    return mismatch(
      `Header mismatch: MCP-Protocol-Version header value '${headers.protocolVersion}' does not match body value '${bodyVersion}'.`,
    );
  if (!isSupportedVersion(bodyVersion))
    return unsupportedVersionFault(bodyVersion);
  return null;
}

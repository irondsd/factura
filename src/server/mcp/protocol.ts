/** JSON-RPC 2.0 plumbing for the MCP endpoint.
 *
 * Written by hand rather than pulled from the reference SDK, deliberately. The
 * SDK's HTTP transport is built around Node's `http.ServerResponse`, which a
 * Next route handler does not have — it speaks Web `Request`/`Response` — and
 * bridging the two costs more than this file does. A STATELESS server is also
 * genuinely small: no sessions to track, no server-initiated messages, no
 * resumability. What is left is message framing, and that is all this is.
 *
 * The tradeoff to know about: nothing here is validated against the SDK's own
 * schemas, so protocol drift has to be caught by the tests in ./protocol.test.ts
 * and by actually connecting a client. If this server ever needs to push
 * notifications to clients, that is the moment to stop hand-rolling and take
 * the dependency.
 *
 * Pure: no I/O, no clock, no database. The route handler owns the wire.
 */

/** Protocol revisions this server speaks, newest first.
 *
 * 2025-06-18 is what we advertise. 2025-03-26 is accepted because clients in
 * the wild still negotiate it and the subset we implement is unchanged between
 * them — the differences (JSON-RPC batching removed, elicitation added,
 * structured tool output) are all in parts this server either doesn't use or
 * handles either way. */
export const LATEST_PROTOCOL_VERSION = "2025-06-18";
export const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-06-18",
  "2025-03-26",
] as const;

/** What a client that sends no `MCP-Protocol-Version` header is assumed to
 * speak. The spec names this fallback explicitly so that older clients, which
 * predate the header, keep working. */
export const ASSUMED_PROTOCOL_VERSION = "2025-03-26";

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

/** JSON-RPC 2.0 §5.1 reserved codes, plus nothing of our own: protocol-level
 * failures use these, and anything that went wrong *inside* a tool is reported
 * as a successful call with `isError: true`, which is what lets the model read
 * the failure and try something else. */
export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

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

/** Is this a notification — a message the client expects no answer to?
 *
 * The distinction drives the HTTP status: a body of nothing but notifications
 * gets 202 with an empty body, while anything carrying an id gets 200 and a
 * response. Getting this wrong makes clients hang. */
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

/** Pick the protocol version to answer `initialize` with.
 *
 * If the client asked for one we speak, agree to it. Otherwise answer with our
 * latest and let the client decide whether it can live with that — the spec
 * puts the choice on the client rather than making the mismatch fatal here. */
export function negotiateVersion(requested: unknown): string {
  if (
    typeof requested === "string" &&
    (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
  ) {
    return requested;
  }
  return LATEST_PROTOCOL_VERSION;
}

/** Is a `MCP-Protocol-Version` header value one we can serve? An absent header
 * is fine — see ASSUMED_PROTOCOL_VERSION. */
export function protocolHeaderAcceptable(header: string | null): boolean {
  if (header === null) return true;
  return (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(header);
}

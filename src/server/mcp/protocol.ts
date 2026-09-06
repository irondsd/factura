/** JSON-RPC 2.0 plumbing for the MCP endpoint, speaking two protocol eras.
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
 * The 2025 handshake era is served alongside it, because clients that never
 * got the upgrade still exist and an endpoint nobody can reach is worth less
 * than a slightly wider one. Both eras share every tool and one dispatcher; a
 * request is sorted into an era once, on arrival, and only the envelope
 * differs after that. See `detectEra`.
 *
 * The tradeoff to know about: nothing here is validated against the SDK's own
 * schemas, so protocol drift has to be caught by the tests in
 * ./protocol.test.ts and by actually connecting a client.
 *
 * Pure: no I/O, no clock, no database. The route handler owns the wire.
 */

/** The revision this server prefers, and the only one with modern framing. */
export const PROTOCOL_VERSION = "2026-07-28";
export const MODERN_PROTOCOL_VERSIONS = [PROTOCOL_VERSION] as const;

/** The handshake era, newest first.
 *
 * `2025-06-18` is what a legacy client is answered with. `2025-03-26` is
 * accepted because clients in the wild still negotiate it and the subset
 * implemented here is unchanged between them — the differences (JSON-RPC
 * batching removed, elicitation added, structured tool output) are all in
 * parts this server either doesn't use or handles either way. */
export const LEGACY_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26"] as const;
export const LEGACY_LATEST_VERSION = LEGACY_PROTOCOL_VERSIONS[0];

/** What a legacy client that sends no `MCP-Protocol-Version` header is assumed
 * to speak. The 2025 spec names this fallback explicitly so that clients which
 * predate the header keep working. */
export const ASSUMED_PROTOCOL_VERSION = "2025-03-26";

/** Everything the server speaks, for discovery and diagnostics. Note that no
 * single request may choose freely from this list: the framing decides the
 * era, and the era decides which half of it is on offer. */
export const SUPPORTED_PROTOCOL_VERSIONS = [
  ...MODERN_PROTOCOL_VERSIONS,
  ...LEGACY_PROTOCOL_VERSIONS,
] as const;

/** Which protocol era a request belongs to. Computed per request and never
 * stored: nothing here is a session, and two consecutive requests on the same
 * connection may legitimately be different eras. */
export type ProtocolEra = "modern" | "legacy";

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
const MODERN_STATUS_BY_CODE: Record<number, number> = {
  [RPC.PARSE_ERROR]: 400,
  [RPC.INVALID_REQUEST]: 400,
  [RPC.INVALID_PARAMS]: 400,
  [RPC.METHOD_NOT_FOUND]: 404,
  [RPC.INTERNAL_ERROR]: 500,
  [RPC.HEADER_MISMATCH]: 400,
  [RPC.UNSUPPORTED_PROTOCOL_VERSION]: 400,
};

/** The 2025 era carried JSON-RPC errors on a `200` and reserved non-2xx for
 * failures of the HTTP exchange itself. A legacy client reading a `404` for
 * `resources/list` concludes the endpoint is gone rather than the method, and
 * a `400` for a tool it mistyped can trip a transport-level retry loop. So the
 * mapping is era-specific, and only the malformed-request cases — which a
 * legacy client also delivered as `400` — keep their status. */
const LEGACY_STATUS_BY_CODE: Record<number, number> = {
  [RPC.PARSE_ERROR]: 400,
  [RPC.INVALID_REQUEST]: 400,
  [RPC.UNSUPPORTED_PROTOCOL_VERSION]: 400,
};

export function httpStatusFor(
  response: JsonRpcResponse,
  era: ProtocolEra = "modern",
): number {
  if (!("error" in response)) return 200;
  return era === "legacy"
    ? (LEGACY_STATUS_BY_CODE[response.error.code] ?? 200)
    : (MODERN_STATUS_BY_CODE[response.error.code] ?? 400);
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

const speaks = (versions: readonly string[]) => (value: unknown) =>
  typeof value === "string" && versions.includes(value);

export const isModernVersion = speaks(MODERN_PROTOCOL_VERSIONS);
export const isLegacyVersion = speaks(LEGACY_PROTOCOL_VERSIONS);
export const isSupportedVersion = speaks(SUPPORTED_PROTOCOL_VERSIONS);

/** `supported` is the versions available *in the era the request is already
 * in*, not everything the server speaks. A client that sent modern framing
 * cannot be helped by being told about `2025-06-18`: it would have to abandon
 * the framing to use it, which is a different conversation than "retry with
 * one of these". `server/discover` is where the full list lives. */
export function unsupportedVersionFault(
  requested: unknown,
  supported: readonly string[] = SUPPORTED_PROTOCOL_VERSIONS,
): ProtocolFault {
  return {
    code: RPC.UNSUPPORTED_PROTOCOL_VERSION,
    message: "Unsupported protocol version",
    data: { supported: [...supported], requested },
  };
}

export type RequestHeaders = {
  protocolVersion: string | null;
  method: string | null;
  name: string | null;
};

/** Which era a request is speaking.
 *
 * Modern framing announces itself: `2026-07-28` requires the protocol version
 * in `_meta` and requires `Mcp-Method` mirrored into the headers, so any of
 * those markers means the client believes it is modern and gets held to it —
 * a modern client that forgets a header still gets the loud `-32020` rather
 * than being quietly demoted. `initialize` is the reverse tell: the method
 * exists only in the handshake era.
 *
 * What is left — no markers, no `initialize` — is a legacy `tools/list`,
 * `tools/call` or `ping`, and it is the one genuinely ambiguous case. Reading
 * it as legacy is the whole point of this function, and the cost is that a
 * modern client which sends *none* of its required headers is served rather
 * than corrected. That is the trade dual-era support is: strictness survives
 * for everyone who claims modernity, and only a client claiming nothing at all
 * gets the benefit of the doubt. */
export function detectEra(
  message: JsonRpcMessage,
  headers: RequestHeaders,
): ProtocolEra {
  if (message.method === "initialize") return "legacy";
  if (requestMeta(message)[META_PROTOCOL_VERSION] !== undefined)
    return "modern";
  if (headers.method !== null || headers.name !== null) return "modern";
  if (isModernVersion(headers.protocolVersion)) return "modern";
  return "legacy";
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
  if (!isModernVersion(bodyVersion))
    return unsupportedVersionFault(bodyVersion, MODERN_PROTOCOL_VERSIONS);
  return null;
}

/** The 2025 era's entire header contract: one optional `MCP-Protocol-Version`,
 * which must name a version we speak if it is there at all. Nothing is
 * mirrored from the body, so there is nothing to cross-check. */
export function checkLegacyHeaders(
  headers: RequestHeaders,
): ProtocolFault | null {
  const version = headers.protocolVersion;
  if (version === null) return null;
  return isLegacyVersion(version)
    ? null
    : unsupportedVersionFault(version, LEGACY_PROTOCOL_VERSIONS);
}

/** Pick the protocol version to answer `initialize` with.
 *
 * If the client asked for one we speak, agree to it. Otherwise answer with the
 * newest handshake-era revision and let the client decide whether it can live
 * with that — the spec puts the choice on the client rather than making the
 * mismatch fatal here. A client that asks for `2026-07-28` through `initialize`
 * is answered the same way: the method it used does not exist in the revision
 * it named, so the handshake era is the only honest answer. */
export function negotiateVersion(requested: unknown): string {
  return isLegacyVersion(requested)
    ? (requested as string)
    : LEGACY_LATEST_VERSION;
}

/** The version to stamp on a legacy response: what the client declared, or the
 * fallback the spec names for clients that predate the header. */
export const legacyResponseVersion = (headers: RequestHeaders): string =>
  isLegacyVersion(headers.protocolVersion)
    ? (headers.protocolVersion as string)
    : ASSUMED_PROTOCOL_VERSION;

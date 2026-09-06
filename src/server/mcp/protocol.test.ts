import { describe, expect, it } from "vitest";
import {
  checkRequestHeaders,
  decodeHeaderValue,
  httpStatusFor,
  isNotification,
  type JsonRpcMessage,
  mcpNameFor,
  META_PROTOCOL_VERSION,
  parseMessage,
  PROTOCOL_VERSION,
  requestMeta,
  RPC,
  rpcError,
  rpcResult,
  SUPPORTED_PROTOCOL_VERSIONS,
  unsupportedVersionFault,
} from "./protocol";

const message = (
  method: string,
  params?: Record<string, unknown>,
): JsonRpcMessage => ({ jsonrpc: "2.0", id: 1, method, params });

/** A well-formed modern request: `_meta` carries the version, and the headers
 * mirror the body exactly the way a conforming client sends them. */
const modern = (method: string, params: Record<string, unknown> = {}) =>
  message(method, {
    ...params,
    _meta: { [META_PROTOCOL_VERSION]: PROTOCOL_VERSION },
  });

const headersFor = (method: string, name: string | null = null) => ({
  protocolVersion: PROTOCOL_VERSION,
  method,
  name,
});

describe("parseMessage", () => {
  it("accepts a request", () => {
    const parsed = parseMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    expect(parsed).toEqual({
      ok: true,
      message: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: undefined,
      },
    });
  });

  it("accepts a notification, which has no id", () => {
    const parsed = parseMessage({
      jsonrpc: "2.0",
      method: "notifications/progress",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(isNotification(parsed.message)).toBe(true);
  });

  it("accepts a string id", () => {
    const parsed = parseMessage({
      jsonrpc: "2.0",
      id: "abc",
      method: "tools/list",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.message.id).toBe("abc");
  });

  it("treats a null id as malformed, not as a notification", () => {
    // JSON-RPC reserves null for a response whose id could not be determined;
    // a request carrying it is broken, and silently answering nothing would
    // leave the client waiting forever.
    const parsed = parseMessage({
      jsonrpc: "2.0",
      id: null,
      method: "tools/list",
    });
    expect(parsed.ok).toBe(false);
  });

  it("rejects a wrong or missing jsonrpc version", () => {
    expect(parseMessage({ id: 1, method: "tools/list" }).ok).toBe(false);
    expect(
      parseMessage({ jsonrpc: "1.0", id: 1, method: "tools/list" }).ok,
    ).toBe(false);
  });

  it("rejects a missing or empty method", () => {
    expect(parseMessage({ jsonrpc: "2.0", id: 1 }).ok).toBe(false);
    expect(parseMessage({ jsonrpc: "2.0", id: 1, method: "" }).ok).toBe(false);
    expect(parseMessage({ jsonrpc: "2.0", id: 1, method: 5 }).ok).toBe(false);
  });

  it("rejects params that are not an object", () => {
    expect(
      parseMessage({ jsonrpc: "2.0", id: 1, method: "x", params: [] }).ok,
    ).toBe(false);
    expect(
      parseMessage({ jsonrpc: "2.0", id: 1, method: "x", params: "x" }).ok,
    ).toBe(false);
  });

  it("rejects anything that is not an object", () => {
    expect(parseMessage(null).ok).toBe(false);
    expect(parseMessage("hello").ok).toBe(false);
    expect(parseMessage(42).ok).toBe(false);
    // Batching left MCP in 2025-06-18; an array body is not a message.
    expect(parseMessage([{ jsonrpc: "2.0", id: 1, method: "x" }]).ok).toBe(
      false,
    );
  });
});

describe("isNotification", () => {
  it("keys off the absence of an id, and nothing else", () => {
    expect(isNotification({ jsonrpc: "2.0", method: "x" })).toBe(true);
    // id 0 is falsy but present — the classic way this check goes wrong.
    expect(isNotification({ jsonrpc: "2.0", id: 0, method: "x" })).toBe(false);
    expect(isNotification({ jsonrpc: "2.0", id: "", method: "x" })).toBe(false);
  });
});

describe("requestMeta", () => {
  it("reads _meta out of params, where the spec puts it", () => {
    const meta = requestMeta(modern("tools/list"));
    expect(meta[META_PROTOCOL_VERSION]).toBe(PROTOCOL_VERSION);
  });

  it("is an empty object when there is no usable _meta", () => {
    expect(requestMeta(message("tools/list"))).toEqual({});
    expect(requestMeta(message("tools/list", { _meta: null }))).toEqual({});
    expect(requestMeta(message("tools/list", { _meta: [] }))).toEqual({});
    expect(requestMeta(message("tools/list", { _meta: "x" }))).toEqual({});
  });
});

describe("decodeHeaderValue", () => {
  it("passes a plain ASCII value through untouched", () => {
    expect(decodeHeaderValue("get_content")).toBe("get_content");
  });

  it("decodes the base64 sentinel", () => {
    const encoded = `=?base64?${Buffer.from("Hola, 世界", "utf8").toString("base64")}?=`;
    expect(decodeHeaderValue(encoded)).toBe("Hola, 世界");
  });

  it("leaves a value that only looks like the sentinel alone", () => {
    // The markers are case-sensitive and lowercase by spec.
    expect(decodeHeaderValue("=?BASE64?abc?=")).toBe("=?BASE64?abc?=");
  });
});

describe("mcpNameFor", () => {
  it("mirrors params.name for tools/call", () => {
    expect(mcpNameFor(modern("tools/call", { name: "get_content" }))).toBe(
      "get_content",
    );
  });

  it("has nothing to mirror for other methods", () => {
    expect(mcpNameFor(modern("tools/list"))).toBe(null);
    expect(mcpNameFor(modern("server/discover"))).toBe(null);
  });

  it("has nothing to mirror when tools/call carries no name", () => {
    // The client is right to omit the header for a value that is not there;
    // the missing name is the dispatcher's complaint to make.
    expect(mcpNameFor(modern("tools/call", {}))).toBe(null);
    expect(mcpNameFor(modern("tools/call", { name: 42 }))).toBe(null);
  });
});

describe("checkRequestHeaders", () => {
  it("passes a conforming request", () => {
    expect(
      checkRequestHeaders(modern("tools/list"), headersFor("tools/list")),
    ).toBe(null);
    expect(
      checkRequestHeaders(
        modern("tools/call", { name: "get_content" }),
        headersFor("tools/call", "get_content"),
      ),
    ).toBe(null);
  });

  it("accepts a base64-encoded Mcp-Name that decodes to the body value", () => {
    const encoded = `=?base64?${Buffer.from("get_content", "utf8").toString("base64")}?=`;
    expect(
      checkRequestHeaders(
        modern("tools/call", { name: "get_content" }),
        headersFor("tools/call", encoded),
      ),
    ).toBe(null);
  });

  it("refuses a request whose Mcp-Method disagrees with the body", () => {
    // The whole point of mirroring: an intermediary routing on the header must
    // not be able to disagree with what the server executes.
    const fault = checkRequestHeaders(
      modern("tools/call", { name: "get_content" }),
      headersFor("tools/list", "get_content"),
    );
    expect(fault).toMatchObject({ code: RPC.HEADER_MISMATCH });
  });

  it("refuses a request whose Mcp-Name disagrees with the body", () => {
    const fault = checkRequestHeaders(
      modern("tools/call", { name: "set_content_status" }),
      headersFor("tools/call", "get_content"),
    );
    expect(fault).toMatchObject({ code: RPC.HEADER_MISMATCH });
  });

  it("refuses each missing required header", () => {
    const call = modern("tools/call", { name: "get_content" });
    expect(
      checkRequestHeaders(call, { ...headersFor("tools/call"), method: null }),
    ).toMatchObject({ code: RPC.HEADER_MISMATCH });
    expect(
      checkRequestHeaders(call, headersFor("tools/call", null)),
    ).toMatchObject({ code: RPC.HEADER_MISMATCH });
    expect(
      checkRequestHeaders(call, {
        ...headersFor("tools/call", "get_content"),
        protocolVersion: null,
      }),
    ).toMatchObject({ code: RPC.HEADER_MISMATCH });
  });

  it("refuses a legacy request, which carries no _meta version at all", () => {
    // This is exactly what a client still speaking the handshake sends. It has
    // to be a recognised modern error so a dual-era client reads the 400 body
    // and stays modern instead of falling back.
    const fault = checkRequestHeaders(
      message("tools/list"),
      headersFor("tools/list"),
    );
    expect(fault).toMatchObject({ code: RPC.HEADER_MISMATCH });
  });

  it("refuses a header and body that name different versions", () => {
    const fault = checkRequestHeaders(
      message("tools/list", {
        _meta: { [META_PROTOCOL_VERSION]: "2025-06-18" },
      }),
      headersFor("tools/list"),
    );
    expect(fault).toMatchObject({ code: RPC.HEADER_MISMATCH });
  });

  it("refuses a version we do not speak, and says which we do", () => {
    const agreed = message("tools/list", {
      _meta: { [META_PROTOCOL_VERSION]: "2025-06-18" },
    });
    const fault = checkRequestHeaders(agreed, {
      ...headersFor("tools/list"),
      protocolVersion: "2025-06-18",
    });
    expect(fault).toMatchObject({
      code: RPC.UNSUPPORTED_PROTOCOL_VERSION,
      data: {
        supported: [...SUPPORTED_PROTOCOL_VERSIONS],
        requested: "2025-06-18",
      },
    });
  });
});

describe("unsupportedVersionFault", () => {
  it("names every version we speak so the client can retry", () => {
    expect(unsupportedVersionFault("1900-01-01")).toEqual({
      code: -32022,
      message: "Unsupported protocol version",
      data: {
        supported: [...SUPPORTED_PROTOCOL_VERSIONS],
        requested: "1900-01-01",
      },
    });
  });
});

describe("httpStatusFor", () => {
  // A dual-era client distinguishes a modern server from a legacy one by
  // reading the body of a 400. These statuses are load-bearing, not cosmetic.
  it("delivers protocol faults as 400 so a modern client inspects the body", () => {
    for (const code of [
      RPC.HEADER_MISMATCH,
      RPC.UNSUPPORTED_PROTOCOL_VERSION,
      RPC.PARSE_ERROR,
      RPC.INVALID_REQUEST,
      RPC.INVALID_PARAMS,
    ]) {
      expect(httpStatusFor(rpcError(1, code, "x")), String(code)).toBe(400);
    }
  });

  it("delivers an unknown method as 404, separating it from a missing endpoint", () => {
    expect(httpStatusFor(rpcError(1, RPC.METHOD_NOT_FOUND, "x"))).toBe(404);
  });

  it("delivers a dispatch failure as 500", () => {
    expect(httpStatusFor(rpcError(1, RPC.INTERNAL_ERROR, "x"))).toBe(500);
  });

  it("delivers any result as 200, including a failed tool call", () => {
    // A tool failure is data for the model, not a transport fault.
    expect(httpStatusFor(rpcResult(1, { isError: true }))).toBe(200);
    expect(httpStatusFor(rpcResult(1, { ok: true }))).toBe(200);
  });
});

describe("response builders", () => {
  it("shapes a result", () => {
    expect(rpcResult(7, { ok: true })).toEqual({
      jsonrpc: "2.0",
      id: 7,
      result: { ok: true },
    });
  });

  it("shapes an error, omitting data when there is none", () => {
    expect(rpcError(7, RPC.METHOD_NOT_FOUND, "nope")).toEqual({
      jsonrpc: "2.0",
      id: 7,
      error: { code: -32601, message: "nope" },
    });
  });

  it("carries data when given", () => {
    const response = rpcError(7, RPC.INVALID_PARAMS, "bad", { field: "x" });
    expect(response).toMatchObject({ error: { data: { field: "x" } } });
  });
});

import { describe, expect, it } from "vitest";
import {
  ASSUMED_PROTOCOL_VERSION,
  isNotification,
  LATEST_PROTOCOL_VERSION,
  negotiateVersion,
  parseMessage,
  protocolHeaderAcceptable,
  RPC,
  rpcError,
  rpcResult,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "./protocol";

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
      method: "notifications/initialized",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(isNotification(parsed.message)).toBe(true);
  });

  it("accepts a string id", () => {
    const parsed = parseMessage({ jsonrpc: "2.0", id: "abc", method: "ping" });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.message.id).toBe("abc");
  });

  it("treats a null id as malformed, not as a notification", () => {
    // JSON-RPC reserves null for a response whose id could not be determined;
    // a request carrying it is broken, and silently answering nothing would
    // leave the client waiting forever.
    const parsed = parseMessage({ jsonrpc: "2.0", id: null, method: "ping" });
    expect(parsed.ok).toBe(false);
  });

  it("rejects a wrong or missing jsonrpc version", () => {
    expect(parseMessage({ id: 1, method: "ping" }).ok).toBe(false);
    expect(parseMessage({ jsonrpc: "1.0", id: 1, method: "ping" }).ok).toBe(
      false,
    );
  });

  it("rejects a missing or empty method", () => {
    expect(parseMessage({ jsonrpc: "2.0", id: 1 }).ok).toBe(false);
    expect(parseMessage({ jsonrpc: "2.0", id: 1, method: "" }).ok).toBe(false);
    expect(parseMessage({ jsonrpc: "2.0", id: 1, method: 5 }).ok).toBe(false);
  });

  it("rejects params that are not an object", () => {
    expect(
      parseMessage({ jsonrpc: "2.0", id: 1, method: "ping", params: [] }).ok,
    ).toBe(false);
    expect(
      parseMessage({ jsonrpc: "2.0", id: 1, method: "ping", params: "x" }).ok,
    ).toBe(false);
  });

  it("rejects anything that is not an object", () => {
    expect(parseMessage(null).ok).toBe(false);
    expect(parseMessage("hello").ok).toBe(false);
    expect(parseMessage(42).ok).toBe(false);
    expect(parseMessage([{ jsonrpc: "2.0", id: 1, method: "ping" }]).ok).toBe(
      false,
    );
  });
});

describe("isNotification", () => {
  it("keys off the absence of an id, and nothing else", () => {
    expect(isNotification({ jsonrpc: "2.0", method: "x" })).toBe(true);
    expect(isNotification({ jsonrpc: "2.0", id: 0, method: "x" })).toBe(false);
    // id 0 is falsy but present — the classic way this check goes wrong.
    expect(isNotification({ jsonrpc: "2.0", id: 0, method: "x" })).toBe(false);
    expect(isNotification({ jsonrpc: "2.0", id: "", method: "x" })).toBe(false);
  });
});

describe("negotiateVersion", () => {
  it("agrees to a version we speak", () => {
    for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
      expect(negotiateVersion(version)).toBe(version);
    }
  });

  it("answers with our latest when the client asks for something else", () => {
    expect(negotiateVersion("2024-01-01")).toBe(LATEST_PROTOCOL_VERSION);
    expect(negotiateVersion(undefined)).toBe(LATEST_PROTOCOL_VERSION);
    expect(negotiateVersion(42)).toBe(LATEST_PROTOCOL_VERSION);
  });
});

describe("protocolHeaderAcceptable", () => {
  it("accepts an absent header, which means an older client", () => {
    expect(protocolHeaderAcceptable(null)).toBe(true);
    expect(
      (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(
        ASSUMED_PROTOCOL_VERSION,
      ),
    ).toBe(true);
  });

  it("accepts what we support and refuses the rest", () => {
    expect(protocolHeaderAcceptable(LATEST_PROTOCOL_VERSION)).toBe(true);
    expect(protocolHeaderAcceptable("2099-01-01")).toBe(false);
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

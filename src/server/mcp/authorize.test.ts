import { describe, expect, it } from "vitest";
import {
  checkAuthorizeRequest,
  isAcceptableRedirectUri,
  redirectBack,
  resourceMatches,
} from "./authorize";

const RESOURCE = "https://factura.uno/api/mcp";
const CLIENT = { redirectUris: ["https://claude.ai/api/mcp/auth_callback"] };

/** A well-formed request, which each test then breaks one way. */
function query(overrides: Record<string, string | null> = {}) {
  const base: Record<string, string> = {
    client_id: "fct_client_abc",
    redirect_uri: "https://claude.ai/api/mcp/auth_callback",
    response_type: "code",
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256",
    state: "xyz",
    resource: RESOURCE,
  };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    if (value !== null) params.set(key, value);
  }
  return params;
}

describe("checkAuthorizeRequest", () => {
  it("accepts a well-formed request", () => {
    const check = checkAuthorizeRequest(query(), CLIENT, RESOURCE);
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.params.clientId).toBe("fct_client_abc");
      expect(check.params.state).toBe("xyz");
      expect(check.params.scope).toBe("mcp:read");
    }
  });

  it("defaults the scope when the client omits it", () => {
    const check = checkAuthorizeRequest(
      query({ scope: null }),
      CLIENT,
      RESOURCE,
    );
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.params.scope).toBe("mcp:read");
  });

  it("allows a missing state — it is the client's own defence to skip", () => {
    const check = checkAuthorizeRequest(
      query({ state: null }),
      CLIENT,
      RESOURCE,
    );
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.params.state).toBeNull();
  });

  describe("failures that must NOT redirect", () => {
    // RFC 6749 §4.1.2.1. Redirecting on these would make the endpoint an open
    // redirector, which is the whole reason for the fatal/reportable split.
    it("is fatal when client_id is missing", () => {
      const check = checkAuthorizeRequest(
        query({ client_id: null }),
        CLIENT,
        RESOURCE,
      );
      expect(check).toMatchObject({ ok: false, fatal: true });
    });

    it("is fatal when the client is unknown", () => {
      const check = checkAuthorizeRequest(query(), null, RESOURCE);
      expect(check).toMatchObject({ ok: false, fatal: true });
    });

    it("is fatal when redirect_uri is missing", () => {
      const check = checkAuthorizeRequest(
        query({ redirect_uri: null }),
        CLIENT,
        RESOURCE,
      );
      expect(check).toMatchObject({ ok: false, fatal: true });
    });

    it("is fatal when redirect_uri is not registered", () => {
      const check = checkAuthorizeRequest(
        query({ redirect_uri: "https://evil.example/callback" }),
        CLIENT,
        RESOURCE,
      );
      expect(check).toMatchObject({ ok: false, fatal: true });
    });

    it("refuses a redirect_uri that merely starts with a registered one", () => {
      // The prefix-matching bug, which is how codes get delivered elsewhere.
      const check = checkAuthorizeRequest(
        query({
          redirect_uri: "https://claude.ai/api/mcp/auth_callback.evil.example",
        }),
        CLIENT,
        RESOURCE,
      );
      expect(check).toMatchObject({ ok: false, fatal: true });
    });
  });

  describe("failures reported to the client", () => {
    it("refuses a non-code response_type", () => {
      const check = checkAuthorizeRequest(
        query({ response_type: "token" }),
        CLIENT,
        RESOURCE,
      );
      expect(check).toMatchObject({
        ok: false,
        fatal: false,
        error: "unsupported_response_type",
      });
    });

    it("requires PKCE", () => {
      const check = checkAuthorizeRequest(
        query({ code_challenge: null }),
        CLIENT,
        RESOURCE,
      );
      expect(check).toMatchObject({
        ok: false,
        fatal: false,
        error: "invalid_request",
      });
    });

    it("refuses the plain challenge method, which OAuth 2.1 removes", () => {
      const check = checkAuthorizeRequest(
        query({ code_challenge_method: "plain" }),
        CLIENT,
        RESOURCE,
      );
      expect(check).toMatchObject({
        ok: false,
        fatal: false,
        error: "invalid_request",
      });
    });

    it("refuses a missing challenge method rather than assuming S256", () => {
      const check = checkAuthorizeRequest(
        query({ code_challenge_method: null }),
        CLIENT,
        RESOURCE,
      );
      expect(check).toMatchObject({ ok: false, fatal: false });
    });

    it("refuses an unknown scope", () => {
      const check = checkAuthorizeRequest(
        query({ scope: "mcp:read mcp:write" }),
        CLIENT,
        RESOURCE,
      );
      expect(check).toMatchObject({
        ok: false,
        fatal: false,
        error: "invalid_scope",
      });
    });

    it("refuses a resource belonging to another server", () => {
      const check = checkAuthorizeRequest(
        query({ resource: "https://other.example/api/mcp" }),
        CLIENT,
        RESOURCE,
      );
      expect(check).toMatchObject({
        ok: false,
        fatal: false,
        error: "invalid_target",
      });
    });
  });
});

describe("resourceMatches", () => {
  it("ignores a trailing slash and host case", () => {
    expect(resourceMatches("https://factura.uno/api/mcp/", RESOURCE)).toBe(
      true,
    );
    expect(resourceMatches("https://FACTURA.UNO/api/mcp", RESOURCE)).toBe(true);
  });

  it("still distinguishes what actually identifies a resource", () => {
    expect(resourceMatches("http://factura.uno/api/mcp", RESOURCE)).toBe(false);
    expect(resourceMatches("https://factura.uno:8443/api/mcp", RESOURCE)).toBe(
      false,
    );
    expect(resourceMatches("https://factura.uno/api/other", RESOURCE)).toBe(
      false,
    );
    expect(resourceMatches("https://evil.example/api/mcp", RESOURCE)).toBe(
      false,
    );
  });

  it("rejects an unparseable value", () => {
    expect(resourceMatches("not a url", RESOURCE)).toBe(false);
    expect(resourceMatches("", RESOURCE)).toBe(false);
  });
});

describe("isAcceptableRedirectUri", () => {
  it("accepts https anywhere", () => {
    expect(
      isAcceptableRedirectUri("https://claude.ai/api/mcp/auth_callback"),
    ).toBe(true);
  });

  it("accepts http only on loopback, where nothing crosses a network", () => {
    expect(isAcceptableRedirectUri("http://localhost:8080/cb")).toBe(true);
    expect(isAcceptableRedirectUri("http://127.0.0.1:53535/cb")).toBe(true);
    expect(isAcceptableRedirectUri("http://[::1]:9000/cb")).toBe(true);
    expect(isAcceptableRedirectUri("http://factura.uno/cb")).toBe(false);
    expect(isAcceptableRedirectUri("http://192.168.1.5/cb")).toBe(false);
  });

  it("accepts a private scheme for native apps", () => {
    expect(
      isAcceptableRedirectUri("cursor://anysphere.cursor-mcp/oauth/cb"),
    ).toBe(true);
    expect(isAcceptableRedirectUri("vscode://mcp/callback")).toBe(true);
  });

  it("refuses schemes that would execute or read local data", () => {
    expect(isAcceptableRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isAcceptableRedirectUri("data:text/html,<script>")).toBe(false);
    expect(isAcceptableRedirectUri("file:///etc/passwd")).toBe(false);
  });

  it("refuses a fragment, which is never sent to a server", () => {
    expect(isAcceptableRedirectUri("https://claude.ai/cb#frag")).toBe(false);
  });

  it("refuses anything that is not a URL", () => {
    expect(isAcceptableRedirectUri("/relative/path")).toBe(false);
    expect(isAcceptableRedirectUri("")).toBe(false);
  });
});

describe("redirectBack", () => {
  it("adds the parameters and echoes state", () => {
    const url = redirectBack("https://claude.ai/cb", "xyz", { code: "abc" });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("code")).toBe("abc");
    expect(parsed.searchParams.get("state")).toBe("xyz");
  });

  it("omits state when the client never sent one", () => {
    const url = redirectBack("https://claude.ai/cb", null, { code: "abc" });
    expect(new URL(url).searchParams.has("state")).toBe(false);
  });

  it("preserves query already on the registered redirect URI", () => {
    const url = redirectBack("https://claude.ai/cb?tenant=7", "s", {
      code: "abc",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("tenant")).toBe("7");
    expect(parsed.searchParams.get("code")).toBe("abc");
  });
});

import { describe, expect, it } from "vitest";
import {
  authRedirectTarget,
  loginHref,
  loginTarget,
  logoutTarget,
  safeNext,
} from "./nextPath";

const splitOrigins = {
  siteOrigin: "https://factura.uno",
  appOrigin: "https://app.factura.uno",
};

const localSplitOrigins = {
  siteOrigin: "http://localhost:4000",
  appOrigin: "http://localhost:4001",
};

describe("safeNext", () => {
  it("accepts a path on this origin, query and all", () => {
    expect(safeNext("/app")).toBe("/app");
    expect(safeNext("/oauth/authorize?client_id=abc&state=xyz")).toBe(
      "/oauth/authorize?client_id=abc&state=xyz",
    );
  });

  it("accepts an HTTPS deep link on the configured app origin", () => {
    expect(
      safeNext(
        "https://app.factura.uno/bills?property=depto#latest",
        splitOrigins,
      ),
    ).toBe("https://app.factura.uno/bills?property=depto#latest");
  });

  it("accepts the configured HTTP loopback origin in local development", () => {
    expect(
      safeNext(
        "http://localhost:4001/insights?month=2026-08",
        localSplitOrigins,
      ),
    ).toBe("http://localhost:4001/insights?month=2026-08");
  });

  it("rejects absolute URLs", () => {
    expect(safeNext("https://evil.example")).toBeNull();
    expect(safeNext("http://evil.example/app")).toBeNull();
    expect(safeNext("javascript:alert(1)")).toBeNull();
  });

  it.each([
    "https://factura.uno.evil.example/bills",
    "https://evil.example/?next=https://app.factura.uno",
    "https://user:pass@app.factura.uno/bills",
    "https://app.factura.uno:444/bills",
    "http://app.factura.uno/bills",
  ])("rejects a hostile or unexpected absolute destination: %s", (value) => {
    expect(safeNext(value, splitOrigins)).toBeNull();
  });

  it("rejects protocol-relative URLs, which look like paths", () => {
    expect(safeNext("//evil.example")).toBeNull();
    expect(safeNext("//evil.example/app")).toBeNull();
  });

  it("rejects backslash variants browsers normalize into //", () => {
    expect(safeNext("/\\evil.example")).toBeNull();
    expect(safeNext("\\\\evil.example")).toBeNull();
  });

  it("rejects values carrying control characters or whitespace", () => {
    expect(safeNext("/app\n")).toBeNull();
    expect(safeNext("/ app")).toBeNull();
    expect(safeNext("java\tscript:alert(1)")).toBeNull();
    expect(safeNext("/app\u0000")).toBeNull();
  });

  it("returns null for nothing at all", () => {
    expect(safeNext(null)).toBeNull();
    expect(safeNext(undefined)).toBeNull();
    expect(safeNext("")).toBeNull();
  });
});

describe("loginTarget", () => {
  it("honours a safe ?next, deep link and all", () => {
    expect(loginTarget("/app/bills?property=depto", false)).toBe(
      "/app/bills?property=depto",
    );
    expect(loginTarget("/oauth/authorize?client_id=abc", false)).toBe(
      "/oauth/authorize?client_id=abc",
    );
  });

  it("honours an allowlisted app deep link after the split", () => {
    expect(
      loginTarget(
        "https://app.factura.uno/bills?month=2026-08",
        false,
        splitOrigins,
      ),
    ).toBe("https://app.factura.uno/bills?month=2026-08");
  });

  it("falls back to /app when there is no ?next", () => {
    expect(loginTarget(null, false)).toBe("/app");
    expect(loginTarget(undefined, false)).toBe("/app");
    expect(loginTarget("", false)).toBe("/app");
  });

  it("carries the claim flag when nothing better is asked for", () => {
    expect(loginTarget(null, true)).toBe("/app?claim=1");
    expect(loginTarget(null, true, splitOrigins)).toBe(
      "https://app.factura.uno/?claim=1",
    );
  });

  it("refuses an off-origin ?next rather than honouring it", () => {
    expect(loginTarget("https://evil.example", false)).toBe("/app");
    expect(loginTarget("//evil.example", true)).toBe("/app?claim=1");
  });
});

describe("loginHref", () => {
  it("carries the page that was asked for", () => {
    expect(loginHref("/app/bills?property=depto")).toBe(
      "/login?next=%2Fapp%2Fbills%3Fproperty%3Ddepto",
    );
    expect(loginHref("/app?claim=1")).toBe("/login?next=%2Fapp%3Fclaim%3D1");
  });

  it("builds a canonical cross-origin login URL for a re-rooted app path", () => {
    expect(loginHref("/bills?property=depto", splitOrigins)).toBe(
      "https://factura.uno/login?next=https%3A%2F%2Fapp.factura.uno%2Fbills%3Fproperty%3Ddepto",
    );
  });

  it("supports the two configured local development origins", () => {
    expect(loginHref("/insights", localSplitOrigins)).toBe(
      "http://localhost:4000/login?next=http%3A%2F%2Flocalhost%3A4001%2Finsights",
    );
  });

  it("leaves off a ?next that only names the default destination", () => {
    expect(loginHref("/app")).toBe("/login");
  });

  it("drops anything safeNext refuses", () => {
    expect(loginHref("//evil.example")).toBe("/login");
    expect(loginHref(null)).toBe("/login");
  });
});

describe("logoutTarget", () => {
  it("returns to an allowlisted app deep link", () => {
    expect(
      logoutTarget("https://app.factura.uno/bills?month=2026-08", splitOrigins),
    ).toBe("https://app.factura.uno/bills?month=2026-08");
  });

  it("supports the configured local app origin", () => {
    expect(
      logoutTarget("http://localhost:4001/profile", localSplitOrigins),
    ).toBe("http://localhost:4001/profile");
  });

  it("falls back to the marketing site after hostile input", () => {
    expect(logoutTarget("https://evil.example", splitOrigins)).toBe(
      "https://factura.uno",
    );
  });

  it("keeps the monolith-compatible fallback relative", () => {
    expect(logoutTarget(null)).toBe("/");
  });
});

describe("authRedirectTarget", () => {
  it("returns a LAN sign-in to the same dev server origin", () => {
    const lanOrigin = "http://192.168.1.33:4000";
    expect(authRedirectTarget("/cms", undefined, lanOrigin)).toBe(
      `${lanOrigin}/cms`,
    );
    expect(authRedirectTarget(`${lanOrigin}/cms`, undefined, lanOrigin)).toBe(
      `${lanOrigin}/cms`,
    );
    expect(
      authRedirectTarget("https://evil.example/cms", undefined, lanOrigin),
    ).toBe("http://localhost:4000/");
  });
  it("lets Auth.js complete a login on the app origin", () => {
    expect(
      authRedirectTarget(
        "https://app.factura.uno/profile?tab=sessions",
        splitOrigins,
      ),
    ).toBe("https://app.factura.uno/profile?tab=sessions");
  });

  it("allows canonical site and relative CMS returns", () => {
    expect(
      authRedirectTarget("https://factura.uno/cms/guias", splitOrigins),
    ).toBe("https://factura.uno/cms/guias");
    expect(authRedirectTarget("/cms/media", splitOrigins)).toBe(
      "https://factura.uno/cms/media",
    );
  });

  it.each([
    "https://evil.example/steal",
    "https://app.factura.uno.evil.example/steal",
    "https://user@app.factura.uno/profile",
    "//evil.example/steal",
    "/\\evil.example/steal",
  ])("falls back to the site for a hostile callback: %s", (value) => {
    expect(authRedirectTarget(value, splitOrigins)).toBe(
      "https://factura.uno/",
    );
  });
});

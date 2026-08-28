import { describe, expect, it } from "vitest";
import { sessionCookieConfig } from "./authCookie";

describe("sessionCookieConfig", () => {
  it("matches Auth.js local HTTP behavior without sharing across ports", () => {
    expect(
      sessionCookieConfig({
        NODE_ENV: "development",
        AUTH_URL: "http://localhost:4000",
      }),
    ).toEqual({
      name: "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: false,
      },
    });
  });

  it("defines the production parent-domain session contract", () => {
    expect(
      sessionCookieConfig({
        NODE_ENV: "production",
        AUTH_URL: "https://factura.uno",
        NEXT_PUBLIC_SITE_URL: "https://factura.uno",
        NEXT_PUBLIC_APP_URL: "https://app.factura.uno",
        SESSION_COOKIE_DOMAIN: ".factura.uno",
      }),
    ).toEqual({
      name: "__Secure-authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
        domain: ".factura.uno",
      },
    });
  });

  it("rejects a shared domain over insecure HTTP", () => {
    expect(() =>
      sessionCookieConfig({
        NODE_ENV: "development",
        AUTH_URL: "http://localhost:4000",
        SESSION_COOKIE_DOMAIN: ".localhost",
      }),
    ).toThrow(/HTTPS/);
  });

  it.each(["factura.uno", ".factura.uno/path", ".factura.uno:443"])(
    "rejects an invalid cookie domain: %s",
    (domain) => {
      expect(() =>
        sessionCookieConfig({
          NODE_ENV: "production",
          AUTH_URL: "https://factura.uno",
          SESSION_COOKIE_DOMAIN: domain,
        }),
      ).toThrow(/parent domain/);
    },
  );
});

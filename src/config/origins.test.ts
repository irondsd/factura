import { describe, expect, it } from "vitest";
import { parseOrigin, resolvePublicOrigins } from "./origins";

describe("parseOrigin", () => {
  it("normalizes valid HTTPS and local development origins", () => {
    expect(parseOrigin("NEXT_PUBLIC_SITE_URL", "https://factura.uno")).toBe(
      "https://factura.uno",
    );
    expect(parseOrigin("NEXT_PUBLIC_APP_URL", "http://localhost:4001")).toBe(
      "http://localhost:4001",
    );
  });

  it.each([
    "https://user:pass@factura.uno",
    "https://factura.uno/app",
    "https://factura.uno?preview=1",
    "https://factura.uno/#app",
    "http://factura.uno",
    "javascript:alert(1)",
    " https://factura.uno",
  ])("rejects a value that is not an exact safe origin: %s", (value) => {
    expect(() => parseOrigin("NEXT_PUBLIC_APP_URL", value)).toThrow();
  });
});

describe("resolvePublicOrigins", () => {
  it("keeps the monolith layout by default", () => {
    expect(resolvePublicOrigins({ NODE_ENV: "development" })).toEqual({
      siteOrigin: "http://localhost:4000",
      appOrigin: "http://localhost:4000",
    });
  });

  it("supports separate local origins", () => {
    expect(
      resolvePublicOrigins({
        NODE_ENV: "development",
        NEXT_PUBLIC_SITE_URL: "http://localhost:4000",
        NEXT_PUBLIC_APP_URL: "http://localhost:4001",
      }),
    ).toEqual({
      siteOrigin: "http://localhost:4000",
      appOrigin: "http://localhost:4001",
    });
  });
  it("uses the two production origins for server and browser consumers", () => {
    expect(
      resolvePublicOrigins({
        NODE_ENV: "production",
        NEXT_PUBLIC_SITE_URL: "https://factura.uno",
        NEXT_PUBLIC_APP_URL: "https://app.factura.uno",
      }),
    ).toEqual({
      siteOrigin: "https://factura.uno",
      appOrigin: "https://app.factura.uno",
    });
  });
});

import { describe, expect, it } from "vitest";
import { probarOptions, withProbarCors } from "./probarCors";

const origins = {
  siteOrigin: "https://factura.uno",
  appOrigin: "https://app.factura.uno",
};

describe("withProbarCors", () => {
  it("adds credentialed CORS headers for the exact marketing origin", async () => {
    const handler = withProbarCors(
      () => Response.json({ ok: true }),
      "site",
      origins,
    );
    const response = await handler(
      new Request("https://app.factura.uno/api/probar/submit", {
        method: "POST",
        headers: { Origin: "https://factura.uno" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://factura.uno",
    );
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
    expect(response.headers.get("vary")).toBe("Origin");
  });

  it("rejects an unexpected browser origin before running the handler", async () => {
    let called = false;
    const handler = withProbarCors(
      () => {
        called = true;
        return Response.json({ ok: true });
      },
      "site",
      origins,
    );
    const response = await handler(
      new Request("https://app.factura.uno/api/probar/hint", {
        method: "POST",
        headers: { Origin: "https://evil.example" },
      }),
    );

    expect(response.status).toBe(403);
    expect(called).toBe(false);
  });

  it("allows origin-less server requests without emitting CORS headers", async () => {
    const handler = withProbarCors(
      () => Response.json({ ok: true }),
      "site",
      origins,
    );
    const response = await handler(
      new Request("https://app.factura.uno/api/probar/report", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
  });

  it("allows the app origin, not the site origin, on claim", async () => {
    const handler = withProbarCors(
      () => Response.json({ ok: true }),
      "app",
      origins,
    );
    const allowed = await handler(
      new Request("https://app.factura.uno/api/probar/claim", {
        method: "POST",
        headers: { Origin: "https://app.factura.uno" },
      }),
    );
    const rejected = await handler(
      new Request("https://app.factura.uno/api/probar/claim", {
        method: "POST",
        headers: { Origin: "https://factura.uno" },
      }),
    );
    expect(allowed.status).toBe(200);
    expect(rejected.status).toBe(403);
  });
});

describe("probarOptions", () => {
  it("answers an allowed preflight with only the declared method and header", async () => {
    const response = await probarOptions(
      "site",
      origins,
    )(
      new Request("https://app.factura.uno/api/probar/parse", {
        method: "OPTIONS",
        headers: { Origin: "https://factura.uno" },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "POST, OPTIONS",
    );
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "Content-Type",
    );
  });
});

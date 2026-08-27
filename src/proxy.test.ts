import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { LOCALE_COOKIE } from "@/i18n/config";
import { proxy } from "@/proxy";

// The four decisions the proxy makes, and the one it started making to keep the
// Spanish-only sections from being generated per request.

const url = (path: string) => new URL(`https://factura.uno${path}`);

const request = (path: string, cookies: Record<string, string> = {}) => {
  const req = new NextRequest(url(path));
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
};

/** Where `NextResponse.rewrite` puts the destination. */
const rewriteTarget = (res: Response) =>
  res.headers.get("x-middleware-rewrite");

describe("Spanish is unprefixed", () => {
  it("redirects /es/* to the bare path", () => {
    const res = proxy(request("/es/guias/expensas"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      "https://factura.uno/guias/expensas",
    );
  });

  it("serves a bare path from the Spanish tree without changing the URL", () => {
    const res = proxy(request("/guias/expensas"));
    expect(rewriteTarget(res)).toBe("https://factura.uno/es/guias/expensas");
    expect(res.cookies.get(LOCALE_COOKIE)?.value).toBe("es");
  });
});

describe("English pages", () => {
  it("passes /en/* through to the English page", () => {
    const res = proxy(request("/en/faq"));
    expect(res.headers.get("location")).toBeNull();
    expect(rewriteTarget(res)).toBeNull();
    expect(res.cookies.get(LOCALE_COOKIE)?.value).toBe("en");
  });

  it("leaves a signed-in visitor's stored preference alone", () => {
    // Their choice in the app wins over whatever they happen to be browsing.
    const res = proxy(
      request("/en/faq", { "authjs.session-token": "session" }),
    );
    expect(res.cookies.get(LOCALE_COOKIE)).toBeUndefined();
  });
});

describe("the Spanish-only sections under /en", () => {
  // The point of these: `ContentChrome` 404s such a request, and on a route
  // with `dynamicParams = true` that 404 would be generated and stored. The
  // redirect has to happen before the request reaches the route at all.
  it.each([
    ["/en/guias/expensas-en-un-alquiler", "/guias/expensas-en-un-alquiler"],
    ["/en/guias", "/guias"],
    ["/en/estadisticas/precio-m2-caba", "/estadisticas/precio-m2-caba"],
    ["/en/investigaciones", "/investigaciones"],
    ["/en/noticias", "/noticias"],
    ["/en/normativa", "/normativa"],
  ])("redirects %s to %s", (from, to) => {
    const res = proxy(request(from));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`https://factura.uno${to}`);
  });

  it("redirects temporarily, so a translated section can reclaim the URL", () => {
    // 308 would be cached in browsers past the point of taking it back.
    expect(proxy(request("/en/guias")).status).not.toBe(308);
  });

  it("does not touch an English page that merely starts with the same letters", () => {
    // `/en/normativa` is Spanish-only; a hypothetical `/en/normal` is not, and
    // the prefix test must not swallow it.
    const res = proxy(request("/en/normal"));
    expect(res.headers.get("location")).toBeNull();
  });
});

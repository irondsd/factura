import { describe, expect, it } from "vitest";
import type { NextConfig } from "next";
import {
  getRedirectUrl,
  getRewrittenUrl,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";
import { SESSION_COOKIE_NAMES } from "@/server/authCookie";
import { LOCALE_COOKIE } from "./config";
import {
  localeHeaders,
  localeRedirects,
  localeRewrites,
  SIGNED_IN_COOKIES,
} from "./localeRules";

// The four decisions the old proxy made, run through Next's own evaluator for
// `next.config` rules — the same matching (`path-to-regexp`, `has`/`missing`)
// the server and Vercel's router apply. Two differences: this evaluator matches
// a trailing slash strictly and extracts params case-sensitively (it throws on
// `/EN/faq`), where the server and Vercel accept an optional slash and any
// case. So `/es/`, `/faq/`, `/en/` and `/EN/faq` are checked against a real
// build instead.

const nextConfig: NextConfig = {
  headers: async () => localeHeaders(),
  redirects: async () => localeRedirects(),
  rewrites: async () => ({
    beforeFiles: localeRewrites(),
    afterFiles: [],
    fallback: [],
  }),
};

const route = (path: string, cookies: Record<string, string> = {}) =>
  unstable_getResponseFromNextConfig({
    url: `https://factura.uno${path}`,
    nextConfig,
    cookies,
  });

/** The NEXT_LOCALE value the response sets, or null when it sets none. */
const localeSet = (res: Response) => {
  const header = res.headers.get("set-cookie");
  if (!header) return null;
  const match = new RegExp(`^${LOCALE_COOKIE}=(\\w+);`).exec(header);
  return match ? match[1] : `unexpected: ${header}`;
};

describe("Spanish is unprefixed", () => {
  it.each([
    ["/es", "/"],
    ["/es/guias/expensas", "/guias/expensas"],
    ["/es/faq?utm=x", "/faq?utm=x"],
  ])("redirects %s to %s", async (from, to) => {
    const res = await route(from);
    expect(res.status).toBe(308);
    expect(getRedirectUrl(res)).toBe(`https://factura.uno${to}`);
    expect(localeSet(res)).toBeNull();
  });

  it.each([
    ["/", "/es"],
    ["/guias/expensas", "/es/guias/expensas"],
    ["/esx", "/es/esx"],
    ["/energia", "/es/energia"],
  ])("serves %s from %s without changing the URL", async (from, to) => {
    const res = await route(from);
    expect(getRewrittenUrl(res)).toBe(`https://factura.uno${to}`);
    expect(localeSet(res)).toBe("es");
  });

  it("keeps the query string through the rewrite", async () => {
    const res = await route("/guias/expensas?ref=a");
    expect(getRewrittenUrl(res)).toBe(
      "https://factura.uno/es/guias/expensas?ref=a",
    );
  });
});

describe("English pages", () => {
  it.each(["/en", "/en/faq", "/en/normal", "/en/guiasx"])(
    "passes %s through to the English page",
    async (path) => {
      const res = await route(path);
      expect(getRedirectUrl(res)).toBeNull();
      // Rewritten onto itself, which serves the page it names.
      expect(getRewrittenUrl(res)).toBe(`https://factura.uno${path}`);
      expect(localeSet(res)).toBe("en");
    },
  );
});

describe("the locale cookie", () => {
  it("is not re-sent when it already names the page's language", async () => {
    expect(localeSet(await route("/en/faq", { NEXT_LOCALE: "en" }))).toBeNull();
    expect(localeSet(await route("/faq", { NEXT_LOCALE: "es" }))).toBeNull();
  });

  it("is corrected when it names the other language, or nonsense", async () => {
    expect(localeSet(await route("/faq", { NEXT_LOCALE: "en" }))).toBe("es");
    expect(localeSet(await route("/en/faq", { NEXT_LOCALE: "es" }))).toBe("en");
    expect(localeSet(await route("/faq", { NEXT_LOCALE: "fr" }))).toBe("es");
  });

  it.each(SIGNED_IN_COOKIES)(
    "leaves a signed-in visitor's stored preference alone (%s)",
    async (session) => {
      // Their choice in the app wins over whatever they happen to be browsing.
      expect(localeSet(await route("/en/faq", { [session]: "x" }))).toBeNull();
      expect(
        localeSet(await route("/faq", { [session]: "x", NEXT_LOCALE: "en" })),
      ).toBeNull();
    },
  );

  it("watches the same session cookies Auth.js writes", () => {
    expect([...SIGNED_IN_COOKIES].sort()).toEqual(
      [...SESSION_COOKIE_NAMES].sort(),
    );
  });

  it("is a one-year, site-wide, lax cookie", async () => {
    expect((await route("/en")).headers.get("set-cookie")).toBe(
      "NEXT_LOCALE=en; Path=/; Max-Age=31536000; SameSite=Lax",
    );
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
    ["/en/proveedores", "/proveedores"],
    ["/en/ubicacion/caba", "/ubicacion/caba"],
    ["/en/contratos", "/contratos"],
    ["/en/recibos/alquiler", "/recibos/alquiler"],
    ["/en/guias/x?y=1", "/guias/x?y=1"],
  ])("redirects %s to %s", async (from, to) => {
    const res = await route(from);
    expect(res.status).toBe(307);
    expect(getRedirectUrl(res)).toBe(`https://factura.uno${to}`);
    // The Spanish page it lands on sets the cookie; the redirect does not.
    expect(localeSet(res)).toBeNull();
  });

  it("redirects temporarily, so a translated section can reclaim the URL", async () => {
    // 308 would be cached in browsers past the point of taking it back.
    expect((await route("/en/guias")).status).not.toBe(308);
  });

  it("does not touch an English page that merely starts with the same letters", async () => {
    // `/en/normativa` is Spanish-only; `/en/normal` is not, and the prefix test
    // must not swallow it.
    expect(getRedirectUrl(await route("/en/normal"))).toBeNull();
  });
});

describe("non-landing routes", () => {
  it.each([
    "/login",
    "/logout",
    "/app/bills",
    "/cms",
    "/cms/guias",
    "/api/auth/session",
    "/ingest/flags",
    "/embed/x",
    "/oauth/authorize",
    "/delete-account",
    "/share-target",
    "/media/0b6c/x.jpg",
    "/favicon.ico",
    "/sitemap.xml",
    "/og/guias/x/card.png",
    "/_next/static/chunks/a.js",
  ])("leaves %s alone", async (path) => {
    const res = await route(path);
    expect(getRedirectUrl(res)).toBeNull();
    expect(getRewrittenUrl(res)).toBeNull();
    expect(localeSet(res)).toBeNull();
  });
});

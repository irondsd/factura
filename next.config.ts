import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Turns on `src/app/global-not-found.tsx` — the only way to give an
    // unmatched URL a branded 404 here. See the comment in that file: with two
    // root layouts and a top-level `[lang]` segment there is no root layout for
    // a plain root `not-found.tsx` to render inside.
    globalNotFound: true,
  },
  async headers() {
    return [
      {
        // The share-target worker is the one file that must never be served
        // stale: a cached copy would keep handling shares with old logic long
        // after a deploy. `Service-Worker-Allowed` lets it claim the whole
        // origin even though it only ever answers /share-target.
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // The research section is plural for consistency with /guias and
      // /estadisticas. Keep the former singular URLs working for readers and
      // search engines that already know them.
      {
        source: "/investigacion",
        destination: "/investigaciones",
        permanent: true,
      },
      {
        source: "/investigacion/:path*",
        destination: "/investigaciones/:path*",
        permanent: true,
      },
      // /estadisticas/inflacion was the statistics section's first page, shipped
      // as one long document covering the country and all six regions. It was
      // split into a hub plus a page per region, and renamed to something that
      // says which inflation it is — so the old URL has to keep working for
      // anything already linking to or ranking for it.
      //
      // Here rather than in `proxy.ts` because config redirects are checked
      // *before* the proxy runs (see the routing order in the `rewrites` doc),
      // so this fires on the bare path before the proxy rewrites it into the
      // /es tree. Permanent (308): the move is not coming back, and a temporary
      // redirect would leave the ranking on a URL that no longer exists.
      {
        source: "/estadisticas/inflacion",
        destination: "/estadisticas/inflacion-de-vivienda",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      // OAuth discovery. The specs put these at /.well-known/*, but a source
      // directory named `.well-known` is hidden on every filesystem this repo
      // gets checked out on, so the handlers live at ordinary paths and the
      // well-known URLs are mapped onto them.
      //
      // Each document is served at two shapes because clients disagree about
      // which to try: the bare path, and RFC 9728's path-insertion form
      // (/.well-known/oauth-protected-resource/api/mcp). There is only one MCP
      // resource here, so both answer with the same document.
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/oauth/metadata/authorization-server",
      },
      {
        source: "/.well-known/oauth-authorization-server/:path*",
        destination: "/api/oauth/metadata/authorization-server",
      },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/oauth/metadata/protected-resource",
      },
      {
        source: "/.well-known/oauth-protected-resource/:path*",
        destination: "/api/oauth/metadata/protected-resource",
      },
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://us-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  skipTrailingSlashRedirect: true,
};

export default nextConfig;

import type { NextConfig } from "next";
import { publicOrigins } from "./src/config/origins";

/** The one host remote images may come from: the CMS media bucket's public
 * origin (cms.md §9.11).
 *
 * Narrow on purpose — exact protocol, hostname, port and path prefix. A
 * wildcard Cloudflare hostname would make every R2 bucket in the account a
 * valid source for this site's optimizer, which is a way of paying to resize
 * other people's images. `images.domains` is deprecated and cannot express the
 * path constraint at all.
 *
 * Built from the same environment variable the uploader and the renderer read,
 * so the three cannot disagree. Absent in a deployment without media
 * configured: an empty list means no remote source is allowed, which is the
 * right answer there. */
function mediaRemotePatterns(): NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
> {
  const origin = process.env.CMS_MEDIA_PUBLIC_ORIGIN;
  if (!origin) return [];
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return [];
  }
  return [
    {
      protocol: url.protocol.replace(":", "") as "http" | "https",
      hostname: url.hostname,
      ...(url.port ? { port: url.port } : {}),
      pathname: `${url.pathname.replace(/\/+$/, "")}/cms-media/**`,
    },
  ];
}

/** Files the media routes need at runtime that Next's tracer cannot discover.
 *
 * sharp loads libvips through `dlopen`, not through `require`, so the file
 * tracer — which follows JavaScript — copies libvips' `index.js` and
 * `package.json` into the serverless bundle and leaves the actual shared
 * library behind. Locally that is invisible, because the whole `node_modules`
 * tree is on disk; on Vercel each function is built *from the trace*, so the
 * binding loads and then dies with:
 *
 *   ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file
 *
 * Only the routes that actually process bytes need it. `/cms/media` and
 * `/cms/media/[id]` are where the browser's Server Actions land, and
 * `/api/cms/mcp` is where an agent's `complete_media_upload` does. Every other
 * route — including all the public ones — stays free of a ~10 MB codec.
 *
 * Keys are route globs; `**` is what matches `/cms/media/[id]`, whose brackets
 * would otherwise be read as a character class. */
const SHARP_RUNTIME_FILES = [
  "./node_modules/sharp/**/*",
  "./node_modules/@img/**/*",
];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/cms/media": SHARP_RUNTIME_FILES,
    "/cms/media/**": SHARP_RUNTIME_FILES,
    "/api/cms/mcp": SHARP_RUNTIME_FILES,
  },
  images: {
    remotePatterns: mediaRemotePatterns(),
    // Required from Next 16: without an allowlist, anyone could ask the
    // optimizer for arbitrary qualities and make it do unbounded work. One
    // value until a design review asks for another.
    qualities: [75],
    // Master keys are immutable — a replaced image is a new id and a new URL —
    // so an optimized variant can be cached for as long as the CDN will hold
    // it. This is the payoff for never overwriting bytes at a key.
    minimumCacheTTL: 31_536_000,
    // Uploads are capped at 20 MB, so the optimizer never needs to pull more
    // than that. Lower than the 50 MB default because the limit is really about
    // how much a request may allocate.
    maximumResponseBody: 21_000_000,
    // Development only, and never in production. The optimizer refuses hosts
    // that resolve to a private IP — an SSRF guard worth keeping — but the
    // local media bucket *is* MinIO on localhost, so without this every image
    // in `bun run dev` is a 400 and the whole library is unverifiable locally.
    // Production serves from a public custom domain and keeps the guard.
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
  },
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
    const productRedirects =
      publicOrigins.appOrigin === publicOrigins.siteOrigin
        ? []
        : [
            {
              source: "/app",
              destination: `${publicOrigins.appOrigin}/`,
              permanent: true,
            },
            {
              source: "/app/:path*",
              destination: `${publicOrigins.appOrigin}/:path*`,
              permanent: true,
            },
            {
              source: "/delete-account",
              destination: `${publicOrigins.appOrigin}/delete-account`,
              permanent: true,
            },
          ];

    return [
      ...productRedirects,
      // The research section is plural, for consistency with /guias and
      // /estadisticas and now all the way down to its `cms_page.section` id.
      // These two rules are the last trace of the singular name it shipped
      // with: keep the old URLs working for readers and search engines that
      // already know them. Nothing else in the codebase spells it that way.
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

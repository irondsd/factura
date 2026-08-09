import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Turns on `src/app/global-not-found.tsx` — the only way to give an
    // unmatched URL a branded 404 here. See the comment in that file: with two
    // root layouts and a top-level `[lang]` segment there is no root layout for
    // a plain root `not-found.tsx` to render inside.
    globalNotFound: true,
  },
  // Let `.md`/`.mdx` be treated as source the loader compiles. Guides live in
  // `src/content/guias` and are pulled in via dynamic import (not file routing),
  // but `pageExtensions` is still required for `@next/mdx` to wire the loader.
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
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

// Plugins are passed as string names (not imported functions): Next 16 compiles
// MDX through Turbopack, which runs the loader in Rust and can't receive JS
// function references. `remark-gfm` adds tables/strikethrough/autolinks;
// `rehype-slug` gives headings stable ids for deep-linking.
const withMDX = createMDX({
  options: {
    remarkPlugins: ["remark-gfm"],
    rehypePlugins: ["rehype-slug"],
  },
});

export default withMDX(nextConfig);

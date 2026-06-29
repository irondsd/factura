import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let `.md`/`.mdx` be treated as source the loader compiles. Guides live in
  // `src/content/guias` and are pulled in via dynamic import (not file routing),
  // but `pageExtensions` is still required for `@next/mdx` to wire the loader.
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
  async rewrites() {
    return [
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

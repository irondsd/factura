import type { MetadataRoute } from "next";
import { siteUrl } from "../config/urls";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        // /login carries noindex in its markup, so crawlers must be allowed to
        // fetch it and read that directive. /api stays blocked: it answers
        // JSON, not HTML, so there is no
        // `noindex` to be read there and nothing to gain from the fetch.
        // No trailing slash — a prefix without one blocks both forms
        // (trailingSlash is off).
        disallow: ["/api"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}

import type { MetadataRoute } from "next";
import { siteUrl } from "../config/urls";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        // No trailing slashes: routes are /login, /app, etc. (trailingSlash is
        // off), and a prefix without the slash blocks both forms. The whole
        // signed-in app lives under /app.
        disallow: ["/api", "/login", "/app"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}

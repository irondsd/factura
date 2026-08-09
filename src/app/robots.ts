import type { MetadataRoute } from "next";
import { siteUrl } from "../config/urls";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        // Only /api. The signed-in app and /login used to be disallowed too,
        // which was working against itself: those pages now say `noindex` in
        // their markup, and a crawler that is not allowed to fetch them can
        // never read that. A disallowed URL still gets indexed URL-only when
        // something links to it — the block hides the very directive that would
        // keep it out. Letting them be crawled is what makes the noindex count;
        // there are a dozen of them, so the crawl budget is noise.
        //
        // /api stays blocked: it answers JSON, not HTML, so there is no
        // `noindex` to be read there and nothing to gain from the fetch.
        // No trailing slash — a prefix without one blocks both forms
        // (trailingSlash is off).
        disallow: ["/api"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}

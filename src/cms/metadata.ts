import type { Metadata } from "next";
import { siteName } from "@/config/meta";

// Metadata for every CMS route. One helper rather than a per-route object so
// "no CMS URL is ever indexable" is a property of the module, not a rule each
// new page has to remember — and so the day the CMS moves to its own
// deployment there is one place to change.

/** Robots directives for the whole CMS subtree. Both `index` and `follow` are
 * off, and `googleBot` repeats them because Google honours the specific
 * directive over the generic one when both are present.
 *
 * robots.txt is not the mechanism here: a disallow stops the crawl, and a
 * blocked crawl is precisely what stops a crawler from ever reading a
 * `noindex`. Saying it in the markup is the half that actually works for a URL
 * someone pastes into a chat. */
const NOINDEX = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: { index: false, follow: false },
} as const;

/** Base metadata for the CMS root layout. Carries no canonical and no OG card:
 * these pages are not shareable surfaces, and inheriting the site's canonical
 * would point every CMS screen at the homepage. */
export function cmsRootMetadata(): Metadata {
  return {
    title: { default: `CMS — ${siteName}`, template: `%s · CMS — ${siteName}` },
    description: "Consola interna de publicación.",
    robots: NOINDEX,
  };
}

/** Title for one CMS screen. `robots` comes from the root layout above, so a
 * page only ever declares the one thing that is its own. */
export function cmsPageMetadata(title: string): Metadata {
  return { title };
}

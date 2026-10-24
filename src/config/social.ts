import type { Locale } from "@/i18n/config";
import { githubUrl } from "./urls";

// The brand's public profiles, in the order the footer lists them. Also the
// Organization `sameAs` in the site's structured data, so a profile added here
// is announced to search engines too.
//
// `mark` is the typographic badge the footer draws instead of a logo — the
// site ships no icon set (see NAV_GLYPH in SiteNav), and brand SVGs would read
// as a different product.

export type SocialProfile = {
  /** Display name — a brand name, so the same in every locale. */
  label: string;
  /** Short badge text, one or two latin characters. */
  mark: string;
  url: string;
};

export const socialProfiles: readonly SocialProfile[] = [
  { label: "X", mark: "X", url: "https://x.com/facturaunoapp" },
  {
    label: "LinkedIn",
    mark: "in",
    url: "https://www.linkedin.com/company/facturauno/",
  },
  {
    label: "Facebook",
    mark: "f",
    url: "https://www.facebook.com/factura.uno/",
  },
  { label: "GitHub", mark: "GH", url: githubUrl },
];

// Where the footer's "Review us on Trustpilot" link sends a reader — the
// business's review page on the Trustpilot domain for their language.
export const trustpilotReviewUrl: Record<Locale, string> = {
  es: "https://es.trustpilot.com/review/factura.uno",
  en: "https://www.trustpilot.com/review/factura.uno",
};

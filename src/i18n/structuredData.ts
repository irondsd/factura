import "server-only";
import { githubUrl, siteUrl } from "@/config/urls";
import type { Locale } from "./config";
import { guidesIndexUrl, guideUrl, localeUrl } from "./metadata";

// schema.org structured data (JSON-LD) for the public landing. Builders return
// plain objects rendered through <JsonLd>. Stable @ids let the graphs reference
// one shared Organization node across pages. `description`/`inLanguage` come from
// the per-locale dictionary so the /es and /en pages emit language-matched data.

const ORG_NAME = "Factura";
const ORG_ID = `${siteUrl}/#organization`;

/** Organization + WebSite: brand-level identity that's true on every marketing
 * page. Rendered once from the (site) layout so all landing routes carry it. */
export function siteLd(locale: Locale) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORG_ID,
        name: ORG_NAME,
        url: siteUrl,
        logo: `${siteUrl}/icon.png`,
        sameAs: [githubUrl],
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        name: ORG_NAME,
        url: siteUrl,
        inLanguage: locale,
        publisher: { "@id": ORG_ID },
      },
    ],
  };
}

/** SoftwareApplication: describes Factura as the product. Belongs ONLY on the
 * landing page — the one page that's about the app itself. */
export function softwareApplicationLd({
  locale,
  description,
}: {
  locale: Locale;
  description: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${siteUrl}/#app`,
    name: ORG_NAME,
    url: localeUrl("/", locale),
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    description,
    inLanguage: locale,
    image: `${siteUrl}/opengraph-image.png`,
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: { "@id": ORG_ID },
  };
}

/** FAQPage: lets the FAQ earn expandable rich results. Built from the same
 * dictionary entries the page renders so markup and visible Q&A never drift.
 * Answers keep their inline HTML (links/code) — Google permits it. */
export function faqPageLd(items: { q: string; a: string }[], locale: Locale) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: locale,
    mainEntity: items.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}

// ── Guides (Spanish-only) ─────────────────────────────────────────────────

/** BreadcrumbList from an ordered list of {name, url} crumbs (Home → … → page). */
export function breadcrumbLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** BlogPosting for a single guide. Always Spanish (`inLanguage: "es"`), authored
 * and published by the existing Organization node. */
export function guideLd({
  slug,
  title,
  description,
  published,
  updated,
}: {
  slug: string;
  title: string;
  description: string;
  published: string;
  updated: string;
}) {
  const url = guideUrl(slug);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    headline: title,
    description,
    inLanguage: "es",
    datePublished: published,
    dateModified: updated,
    mainEntityOfPage: url,
    image: `${siteUrl}/opengraph-image.png`,
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
  };
}

/** Blog node for the /guias index, listing each guide as a post. */
export function guideListLd(
  guides: { slug: string; title: string; description: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${guidesIndexUrl}#blog`,
    url: guidesIndexUrl,
    inLanguage: "es",
    publisher: { "@id": ORG_ID },
    blogPost: guides.map((g) => ({
      "@type": "BlogPosting",
      headline: g.title,
      description: g.description,
      url: guideUrl(g.slug),
    })),
  };
}

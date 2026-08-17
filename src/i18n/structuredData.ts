import "server-only";
import { githubUrl, siteUrl } from "@/config/urls";
import type { Locale } from "./config";
import {
  guideCardUrl,
  guideCategoryUrl,
  guidesIndexUrl,
  guideUrl,
  localeUrl,
  normativaUrl,
  sectionCardUrl,
  sectionIndexUrl,
  sectionUrl,
} from "./metadata";

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

/** DefinedTermSet for the glossary: the one page whose content maps exactly onto
 * a schema.org type. Each entry keeps the anchor it has on the page as its `@id`,
 * so a term cited from elsewhere resolves to the paragraph that defines it.
 *
 * Descriptions arrive as the same small HTML strings the page renders, so the
 * tags come out here — structured data is for the text, not for the markup. */
export function glossaryLd({
  locale,
  name,
  description,
  terms,
}: {
  locale: Locale;
  name: string;
  description: string;
  terms: { id: string; term: string; def: string }[];
}) {
  const url = localeUrl("/glosario", locale);
  const setId = `${url}#glossary`;
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    "@id": setId,
    name,
    description,
    url,
    inLanguage: locale,
    publisher: { "@id": ORG_ID },
    hasDefinedTerm: terms.map((t) => ({
      "@type": "DefinedTerm",
      "@id": `${url}#${t.id}`,
      name: t.term,
      description: t.def
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
      inDefinedTermSet: { "@id": setId },
    })),
  };
}

/** ContactPage: marks the contact page as the one that says how to reach the
 * organization, and hangs the published addresses off the shared Organization
 * node rather than inventing a second identity for it. */
export function contactPageLd({
  locale,
  name,
  description,
  emails,
}: {
  locale: Locale;
  name: string;
  description: string;
  emails: { email: string; label: string }[];
}) {
  const url = localeUrl("/contacto", locale);
  return {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    "@id": `${url}#contact`,
    url,
    name,
    description,
    inLanguage: locale,
    mainEntity: {
      "@id": ORG_ID,
      "@type": "Organization",
      contactPoint: emails.map((e) => ({
        "@type": "ContactPoint",
        email: e.email,
        contactType: e.label,
        availableLanguage: ["es", "en"],
      })),
    },
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
 * and published by the existing Organization node.
 *
 * `canonical` (a slug) follows the meta tag: a guide that canonicalizes to
 * another one describes *that* URL here too, right down to sharing its `@id`.
 * Two URLs claiming one article is exactly what a canonical means, and markup
 * that kept pointing at the non-canonical copy would contradict it. */
export function guideLd({
  slug,
  title,
  description,
  keywords,
  published,
  updated,
  canonical,
  vendor,
  section,
  words,
  minutes,
}: {
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  published: string;
  updated: string;
  canonical?: string;
  vendor?: string;
  /** Label of the guide's primary category, for `articleSection`. */
  section?: string;
  /** Prose length and reading time, from `guideStats`. */
  words: number;
  minutes: number;
}) {
  const url = guideUrl(canonical ?? slug);
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
    // The guide's own card, the same one `og:image` names.
    image: guideCardUrl(slug, updated),
    keywords: keywords.join(", "),
    ...(section ? { articleSection: section } : {}),
    // What the article is *about*, as opposed to what it mentions. Only set
    // when the guide is about one company's bill, which is the case the
    // distinction is worth drawing for.
    ...(vendor ? { about: { "@type": "Organization", name: vendor } } : {}),
    wordCount: words,
    // ISO 8601 duration. Same number the page prints in its dateline, which is
    // the point: the markup shouldn't claim a different article than the one on
    // screen.
    timeRequired: `PT${minutes}M`,
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

// ── Registry sections: /estadisticas, /investigacion (Spanish-only) ────────

/** An `Article` describing the page plus the `Dataset` it publishes.
 *
 * Two nodes, deliberately. The prose (the introduction, the methodology, the
 * reading of each chart) is an article and is what a normal search result shows.
 * The numbers underneath are a dataset, and `Dataset` is the markup Google
 * Dataset Search and the LLM crawlers look for — a statistics page that only
 * claimed to be an article would be invisible to exactly the surfaces it's
 * written for. The article `about`s the dataset so the two are linked rather
 * than competing.
 *
 * A research page emits the same pair. Its dataset is derived rather than
 * republished — the join of two official series is still a table of numbers
 * with a coverage and a set of measured variables, and `creator` still names
 * the agencies whose figures went in, because the observations are theirs. */
export function sectionPageLd({
  id,
  slug,
  title,
  description,
  keywords,
  published,
  updated,
  sources,
  dataset,
  words,
  minutes,
}: {
  id: string;
  slug: string[];
  title: string;
  description: string;
  keywords: string[];
  published: string;
  updated: string;
  sources: { label: string; href: string }[];
  dataset: {
    name: string;
    description: string;
    temporalCoverage: string;
    spatialCoverage: string;
    variableMeasured: string[];
  };
  words: number;
  minutes: number;
}) {
  const url = sectionUrl(id, slug);
  const datasetId = `${url}#dataset`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${url}#article`,
        headline: title,
        description,
        inLanguage: "es",
        datePublished: published,
        dateModified: updated,
        mainEntityOfPage: url,
        image: sectionCardUrl(id, slug, updated),
        keywords: keywords.join(", "),
        wordCount: words,
        timeRequired: `PT${minutes}M`,
        about: { "@id": datasetId },
        author: { "@id": ORG_ID },
        publisher: { "@id": ORG_ID },
      },
      {
        "@type": "Dataset",
        "@id": datasetId,
        name: dataset.name,
        description: dataset.description,
        url,
        inLanguage: "es",
        // No `license`: the source's terms are the source's to state, and
        // asserting a specific licence on someone else's official statistics
        // would be making one up. `isAccessibleForFree` is about this page.
        isAccessibleForFree: true,
        temporalCoverage: dataset.temporalCoverage,
        spatialCoverage: dataset.spatialCoverage,
        variableMeasured: dataset.variableMeasured,
        dateModified: updated,
        // Factura republishes these numbers; it doesn't produce them. `creator`
        // is the statistical office, `publisher` is this site — conflating the
        // two would claim authorship of official statistics.
        creator: sources.map((s) => ({
          "@type": "Organization",
          name: s.label,
          url: s.href,
        })),
        publisher: { "@id": ORG_ID },
      },
    ],
  };
}

/** CollectionPage for a section index, listing each page as a member. */
export function sectionIndexLd({
  id,
  title,
  description,
  pages,
}: {
  id: string;
  title: string;
  description: string;
  pages: { slug: string[]; title: string }[];
}) {
  const url = sectionIndexUrl(id);
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}#collection`,
    url,
    name: title,
    description,
    inLanguage: "es",
    publisher: { "@id": ORG_ID },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: pages.length,
      itemListElement: pages.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: p.title,
        url: sectionUrl(id, p.slug),
      })),
    },
  };
}

/** CollectionPage for /normativa, carrying one `Legislation` node per norm.
 *
 * `Legislation` is the schema.org type built for exactly this (it came from the
 * EU's ELI vocabulary), and it's the only one that can say the two things this
 * page is actually about: `legislationIdentifier` — the number a reader
 * searches for — and `legislationJurisdiction`. `sameAs` points at the official
 * text rather than `url`, because the norm's own page is the government's, not
 * ours; `url` stays on our anchor, which is what a search result should open.
 *
 * Every `@id` is the on-page anchor, so a citation of `#ley-24240` resolves to
 * the same card a reader lands on — the same contract `glossaryLd` keeps. */
export function normativaLd({
  title,
  description,
  normas,
}: {
  title: string;
  description: string;
  normas: {
    id: string;
    numero: string;
    titulo: string;
    resumen: string;
    jurisdiccion: "nacional" | "caba";
    fuente: { href: string };
  }[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${normativaUrl}#collection`,
    url: normativaUrl,
    name: title,
    description,
    inLanguage: "es",
    publisher: { "@id": ORG_ID },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: normas.length,
      itemListElement: normas.map((n, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "Legislation",
          "@id": `${normativaUrl}#${n.id}`,
          url: `${normativaUrl}#${n.id}`,
          name: `${n.numero} — ${n.titulo}`,
          legislationIdentifier: n.numero,
          description: n.resumen,
          inLanguage: "es",
          legislationJurisdiction:
            n.jurisdiccion === "caba"
              ? "Ciudad Autónoma de Buenos Aires, Argentina"
              : "Argentina",
          sameAs: n.fuente.href,
        },
      })),
    },
  };
}

/** CollectionPage for a category hub. Not a `Blog` — that node belongs to the
 * /guias index, and two Blog nodes for the same set of posts would compete.
 * The ordered ItemList tells Google these are the members of the collection. */
export function guideCategoryLd({
  id,
  title,
  description,
  guides,
}: {
  id: string;
  title: string;
  description: string;
  guides: { slug: string; title: string }[];
}) {
  const url = guideCategoryUrl(id);
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}#collection`,
    url,
    name: title,
    description,
    inLanguage: "es",
    isPartOf: { "@id": `${guidesIndexUrl}#blog` },
    publisher: { "@id": ORG_ID },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: guides.length,
      itemListElement: guides.map((g, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: g.title,
        url: guideUrl(g.slug),
      })),
    },
  };
}

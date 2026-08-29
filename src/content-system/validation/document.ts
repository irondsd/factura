import { z } from "zod";
import {
  dataSourceSchema,
  datasetMetadataSchema,
  contentMetadataSchema,
} from "../metadata/sections";
import type { ContentDocument, Diagnostic, ValidationResult } from "../types";
import { validationResult } from "../types";
import { extractBodyReferences } from "../media/references";
import { AUTHOR_ROLE_FIELDS, type AuthorRoleField } from "../authors/types";
import { missingKeywordWords } from "./text";
import { sectionProfile } from "../sectionProfiles";

// Layer 2 of cms.md: document validation. Everything that can be decided
// about one page — its metadata, its dates, its headings, its links, its
// components' placement — given an index of the other pages for the few rules
// that need to resolve a slug.
//
// Pure: no filesystem, no database, no compilation. That is what lets the same
// function serve the CMS Validation tab, the MCP's `validate_content`, and the
// publish gate — instead of the three of them slowly disagreeing.
//
// Messages are carried over from `scripts/validate-guides.ts` close to verbatim
// (cms.md Phase 4: "Preserve existing validator messages where practical"), so
// a migration diff is readable and an author who knows the old output still
// recognises the new. They are prefixed `meta.` where the old script used that
// prefix, even though the CMS calls them fields, because that is the wording
// the authoring guide uses.

/** Path segments under /guias that are real routes, not guides. */
const RESERVED_SLUGS = new Set(["categoria"]);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Metadata fields the checks below report themselves, in the wording
 * `scripts/validate-guides.ts` used. Zod's generic issue for these is skipped so
 * nothing is reported twice. */
const EXPLICITLY_REPORTED = new Set(["keywords", "categories", "locations"]);

// Fractional seconds are optional: hand-authored MDX writes
// "2026-07-12T09:00:00-03:00", and a value that has been through a `timestamptz`
// column comes back as "2026-07-12T12:00:00.000Z". Both name the same instant
// and both carry an explicit offset, which is the only thing this rule is
// actually about.
const DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

const DATETIME_FORMAT =
  'full ISO 8601 with offset, e.g. "2026-06-29T09:00:00-03:00"';

export const DOCUMENT_CODES = {
  slugShape: "doc.slug-shape",
  slugReserved: "doc.slug-reserved",
  metadataShape: "doc.metadata-shape",
  titleTooLong: "doc.title-too-long",
  titleTagNotShorter: "doc.title-tag-not-shorter",
  ogTitleLong: "doc.og-title-long",
  ogDescriptionLong: "doc.og-description-long",
  canonicalSelf: "doc.canonical-self",
  canonicalUnknown: "doc.canonical-unknown",
  keywordCount: "doc.keyword-count",
  keywordMissing: "doc.keyword-missing-from-copy",
  categoryUnknown: "doc.category-unknown",
  categoryCount: "doc.category-count",
  locationsMissing: "doc.locations-missing",
  locationDuplicate: "doc.location-duplicate",
  locationUnknown: "doc.location-unknown",
  locationCount: "doc.location-count",
  faqMarkup: "doc.faq-markup",
  faqCount: "doc.faq-count",
  faqNotPlaced: "doc.faq-not-placed",
  faqPlacedWithoutData: "doc.faq-placed-without-data",
  sourcesMissing: "doc.sources-missing",
  sourcesNotPlaced: "doc.sources-not-placed",
  sourcesPlacedWithoutData: "doc.sources-placed-without-data",
  dateFormat: "doc.date-format",
  dateOrder: "doc.date-order",
  descriptionLength: "doc.description-length",
  ctaLength: "doc.cta-length",
  bodyH1: "doc.body-h1",
  bodyFrontmatter: "doc.body-frontmatter",
  bodyMetaExport: "doc.body-meta-export",
  linkBroken: "doc.link-broken",
  linkSelf: "doc.link-self",
  linkUnpublished: "doc.link-unpublished",
  noHeadings: "doc.no-headings",
  noClosingCta: "doc.no-closing-cta",
  closingCtaBare: "doc.closing-cta-bare",
  closingCtaNoTitle: "doc.closing-cta-no-title",
  closingCtaNoCopy: "doc.closing-cta-no-copy",
  noRelatedGuides: "doc.no-related-guides",
  noInterlinks: "doc.no-interlinks",
  mediaUnknown: "doc.media-unknown",
  mediaNotReady: "doc.media-not-ready",
  mediaNoAlt: "doc.media-no-alt",
  mediaExternal: "doc.media-external",
  authorUnknown: "doc.author-unknown",
  authorSelfCheck: "doc.author-self-check",
} as const;

/** What a document needs to know about the rest of the collection. Built once
 * by `buildContentIndex` and passed in, so the validator itself stays pure and
 * a caller can validate against a hypothetical collection. */
export type ContentIndex = {
  /** Every slug in the section, whatever its status. */
  slugs: ReadonlySet<string>;
  /** The publicly listed subset. A link into anything else is a link to a page
   * no listing shows. */
  publishedSlugs: ReadonlySet<string>;
};

export const EMPTY_INDEX: ContentIndex = {
  slugs: new Set(),
  publishedSlugs: new Set(),
};

/** Optional capabilities a caller can supply. */
export type DocumentValidationContext = {
  /** What the media library knows about the ids this document references,
   * resolved by the caller *before* validation because these rules are pure and
   * the library lives in a database.
   *
   * Absent means the check is skipped, and the skip is deliberate: a validator
   * with no way to ask cannot invent an answer, and refusing every reference
   * would be worse than checking none. `src/cms/server/validation.ts` supplies
   * it. */
  media?: ReadonlyMap<string, { status: string; decorative: boolean }>;
  /** Active category keys for this document's section. Resolved by the CMS
   * adapter; omitted by pure callers that only want structural checks. */
  categories?: ReadonlySet<string>;
  /** Active keys from the global location registry. */
  locations?: ReadonlySet<string>;
  /** Every id in `cms_author`. Supplied by the CMS adapter for the same reason
   * `media` is — the list is a table and this validator has no database.
   *
   * Absent skips the existence check, and the self-verification warning below
   * still runs: comparing two ids needs no lookup. */
  authors?: ReadonlySet<string>;
};

const error = (code: string, message: string, field?: string): Diagnostic => ({
  code,
  severity: "error",
  message,
  ...(field ? { field } : {}),
});

const warn = (code: string, message: string, field?: string): Diagnostic => ({
  code,
  severity: "warning",
  message,
  ...(field ? { field } : {}),
});

function isValidDateTime(value: string): boolean {
  const m = DATETIME_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d, h, mi, sec] = m.map(Number);
  const utc = new Date(Date.UTC(y, mo - 1, d));
  return (
    utc.getUTCFullYear() === y &&
    utc.getUTCMonth() === mo - 1 &&
    utc.getUTCDate() === d &&
    h < 24 &&
    mi < 60 &&
    sec < 60
  );
}

/** Validate one document. `index` resolves the cross-page references a single
 * document still has to be right about — its canonical target and its internal
 * links. */
export function validateDocument(
  document: ContentDocument,
  index: ContentIndex = EMPTY_INDEX,
  context: DocumentValidationContext = {},
): ValidationResult {
  switch (sectionProfile(document.section).validation) {
    case "news":
      return validateNewsDocument(document, context);
    case "data":
      return validateDataSectionDocument(document, context);
    case "guide":
      break;
  }
  const out: Diagnostic[] = [];
  const { slug, body } = document;

  // ── slug ──────────────────────────────────────────────────────────────────
  if (!SLUG_RE.test(slug)) {
    out.push(
      error(
        DOCUMENT_CODES.slugShape,
        `slug "${slug}" must be lowercase, hyphen-separated, no accents/spaces`,
        "slug",
      ),
    );
  }
  if (RESERVED_SLUGS.has(slug)) {
    out.push(
      error(
        DOCUMENT_CODES.slugReserved,
        `slug "${slug}" is a reserved /guias route — rename it`,
        "slug",
      ),
    );
  }

  // ── metadata shape ────────────────────────────────────────────────────────
  // The Zod schema is the same one the form, the mutations and the importer
  // use, so "valid metadata" has one definition. It is *stricter* than the old
  // script on one point: an unknown key was a warning there and is an error
  // here, because a database column cannot hold a key nothing reads.
  const parsed = contentMetadataSchema.safeParse(document.metadata);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      // `keywords` and `categories` are reported below in the old script's
      // wording, which names the offending id and lists the valid ones. Letting
      // Zod's generic message through as well would report each one twice.
      if (EXPLICITLY_REPORTED.has(String(issue.path[0]))) continue;

      // An unknown key keeps the old script's wording so a migration diff reads
      // the same. Its *severity* is the one deliberate change: a warning there,
      // an error here, because a column cannot hold a key nothing reads and the
      // importer must not quietly drop it.
      if (issue.code === "unrecognized_keys") {
        for (const key of issue.keys) {
          out.push(
            error(
              DOCUMENT_CODES.metadataShape,
              `meta has unexpected key "${key}"`,
              key,
            ),
          );
        }
        continue;
      }

      const path = issue.path.join(".");
      out.push(
        error(
          DOCUMENT_CODES.metadataShape,
          `meta.${path || "<root>"} ${issue.message}`,
          path || undefined,
        ),
      );
    }
  }
  const metadata = parsed.success ? parsed.data : undefined;
  // Read straight off the raw object for the checks below, so a document whose
  // metadata failed the schema for *one* reason still gets every other finding
  // rather than a single error and silence.
  const raw = (document.metadata ?? {}) as Record<string, unknown>;

  // ── title / titleTag ──────────────────────────────────────────────────────
  const rendered = document.titleTag ?? document.title;
  if (rendered && rendered.length > 60) {
    out.push(
      error(
        DOCUMENT_CODES.titleTooLong,
        document.titleTag
          ? `meta.titleTag is ${rendered.length} chars — must be ≤60`
          : `meta.title is ${rendered.length} chars and would be cut off in search results — shorten it, or add a meta.titleTag ≤60 and keep this as the headline`,
        document.titleTag ? "titleTag" : "title",
      ),
    );
  }
  if (
    document.titleTag &&
    document.title &&
    document.titleTag.length >= document.title.length
  ) {
    out.push(
      warn(
        DOCUMENT_CODES.titleTagNotShorter,
        "meta.titleTag isn't shorter than meta.title — drop it and let the title stand",
        "titleTag",
      ),
    );
  }

  const ogTitle = metadata?.ogTitle;
  if (ogTitle && ogTitle.length > 70) {
    out.push(
      warn(
        DOCUMENT_CODES.ogTitleLong,
        `meta.ogTitle is ${ogTitle.length} chars (aim ≤70)`,
        "ogTitle",
      ),
    );
  }
  const ogDescription = metadata?.ogDescription;
  if (ogDescription && ogDescription.length > 200) {
    out.push(
      warn(
        DOCUMENT_CODES.ogDescriptionLong,
        `meta.ogDescription is ${ogDescription.length} chars (aim ≤200)`,
        "ogDescription",
      ),
    );
  }

  // ── canonical ─────────────────────────────────────────────────────────────
  const canonical = document.canonicalSlug;
  if (canonical !== null && canonical !== undefined) {
    if (canonical === slug) {
      out.push(
        error(
          DOCUMENT_CODES.canonicalSelf,
          "meta.canonical points at this guide — omit it (a guide is its own canonical by default)",
          "canonicalSlug",
        ),
      );
    } else if (index.slugs.size > 0 && !index.slugs.has(canonical)) {
      out.push(
        error(
          DOCUMENT_CODES.canonicalUnknown,
          `meta.canonical is "${canonical}", which is not a guide slug`,
          "canonicalSlug",
        ),
      );
    }
  }

  // ── keywords ──────────────────────────────────────────────────────────────
  const rawKeywords = raw.keywords;
  if (
    !Array.isArray(rawKeywords) ||
    rawKeywords.length === 0 ||
    !rawKeywords.every((k) => typeof k === "string")
  ) {
    out.push(
      error(
        DOCUMENT_CODES.metadataShape,
        "meta.keywords must be a non-empty array of strings",
        "keywords",
      ),
    );
  }
  const keywords: string[] = Array.isArray(rawKeywords)
    ? rawKeywords.filter((k): k is string => typeof k === "string")
    : [];
  if (keywords.length > 0 && (keywords.length < 3 || keywords.length > 6)) {
    out.push(
      warn(
        DOCUMENT_CODES.keywordCount,
        `meta.keywords has ${keywords.length} (aim for 3–6)`,
        "keywords",
      ),
    );
  }
  if (keywords[0] && rendered && document.description) {
    const missing = missingKeywordWords(
      keywords[0],
      rendered,
      document.description,
    );
    if (missing.length > 0) {
      out.push(
        warn(
          DOCUMENT_CODES.keywordMissing,
          `primary keyword "${keywords[0]}" — ${missing.map((w) => `"${w}"`).join(", ")} appears in neither the title nor the description`,
          "keywords",
        ),
      );
    }
  }

  out.push(...validateCategories(raw.categories, context));
  out.push(...validateLocations(raw.locations, context));

  // ── faq ───────────────────────────────────────────────────────────────────
  const rawFaq = raw.faq;
  const faq: { q: string; a: string }[] = Array.isArray(rawFaq)
    ? (rawFaq.filter(
        (item) =>
          item !== null &&
          typeof item === "object" &&
          "a" in item &&
          "q" in item,
      ) as { q: string; a: string }[])
    : [];
  const placesFaq = /<Faq\b/.test(body);
  if (rawFaq !== undefined && faq.length > 0) {
    faq.forEach((item, i) => {
      // Answers are plain text on purpose: one list feeds the visible block and
      // the FAQPage JSON-LD, so the two strings have to be identical, and a
      // markdown link would render as literal brackets in the <dd>.
      if (/\[[^\]]*\]\([^)]*\)|<[a-zA-Z]/.test(item.a)) {
        out.push(
          error(
            DOCUMENT_CODES.faqMarkup,
            `meta.faq[${i}].a contains markup — answers are plain text; put links in the prose`,
            `faq.${i}.a`,
          ),
        );
      }
    });
    if (faq.length < 3) {
      out.push(
        warn(
          DOCUMENT_CODES.faqCount,
          `meta.faq has ${faq.length} (aim for 4–6 real search questions)`,
          "faq",
        ),
      );
    }
    if (!placesFaq) {
      out.push(
        error(
          DOCUMENT_CODES.faqNotPlaced,
          "meta.faq is set but the body never places <Faq /> — the markup would describe questions the page doesn't show",
          "faq",
        ),
      );
    }
  } else if (placesFaq) {
    // `faq.length === 0` rather than `rawFaq === undefined`: an empty list and
    // no list at all put the same nothing under the tag.
    out.push(
      error(
        DOCUMENT_CODES.faqPlacedWithoutData,
        "body places <Faq /> but meta.faq is missing",
        "faq",
      ),
    );
  }

  // ── dates ─────────────────────────────────────────────────────────────────
  // `publishedAt` is null until a page is first published, which is a normal
  // state for a draft rather than a missing date.
  const published = document.publishedAt;
  const updated = document.contentUpdatedAt;
  if (published !== null && !isValidDateTime(published)) {
    out.push(
      error(
        DOCUMENT_CODES.dateFormat,
        `meta.published must be a ${DATETIME_FORMAT}`,
        "publishedAt",
      ),
    );
  }
  if (!isValidDateTime(updated)) {
    out.push(
      error(
        DOCUMENT_CODES.dateFormat,
        `meta.updated must be a ${DATETIME_FORMAT}`,
        "contentUpdatedAt",
      ),
    );
  }
  if (
    published !== null &&
    isValidDateTime(published) &&
    isValidDateTime(updated) &&
    Date.parse(updated) < Date.parse(published)
  ) {
    out.push(
      error(
        DOCUMENT_CODES.dateOrder,
        `meta.updated (${updated}) is before meta.published (${published})`,
        "contentUpdatedAt",
      ),
    );
  }

  // ── length advisories ─────────────────────────────────────────────────────
  const description = document.description;
  if (description && (description.length < 120 || description.length > 170)) {
    out.push(
      warn(
        DOCUMENT_CODES.descriptionLength,
        `meta.description is ${description.length} chars (aim ~150–160)`,
        "description",
      ),
    );
  }
  if (document.cta && document.cta.length > 54) {
    out.push(
      warn(
        DOCUMENT_CODES.ctaLength,
        `meta.cta is ${document.cta.length} chars — over ~54 it wraps to a second line beside the button`,
        "cta",
      ),
    );
  }

  // ── credits ───────────────────────────────────────────────────────────────
  out.push(...validateCredits(document.metadata, context));

  // ── sources ───────────────────────────────────────────────────────────────
  // Optional on a guide: only the placement rules apply, so a guide with
  // nothing to cite says nothing about it.
  out.push(...validateSources(body, raw, { expected: false }));

  // ── media ─────────────────────────────────────────────────────────────────
  out.push(...validateMedia(document, metadata, context));

  // ── body ──────────────────────────────────────────────────────────────────
  out.push(...validateBody(document, index));

  return validationResult(out);
}

/** News is editorial like a guide, with its own section-scoped taxonomy and the
 * same optional provenance block. It still gets the lifecycle, heading and FAQ
 * guards. */
function validateNewsDocument(
  document: ContentDocument,
  context: DocumentValidationContext,
): ValidationResult {
  const out: Diagnostic[] = [];
  if (!SLUG_RE.test(document.slug)) {
    out.push(
      error(
        DOCUMENT_CODES.slugShape,
        `slug "${document.slug}" must be lowercase, hyphen-separated, no accents/spaces`,
        "slug",
      ),
    );
  }
  if (document.slug === "categoria") {
    out.push(
      error(
        DOCUMENT_CODES.slugReserved,
        'slug "categoria" is reserved for category pages',
        "slug",
      ),
    );
  }
  const parsed = contentMetadataSchema.safeParse(document.metadata);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      out.push(
        error(
          DOCUMENT_CODES.metadataShape,
          `meta.${issue.path.join(".") || "<root>"} ${issue.message}`,
          issue.path.join(".") || undefined,
        ),
      );
    }
  }
  out.push(
    ...validateCategories(
      (document.metadata as Record<string, unknown> | undefined)?.categories,
      context,
    ),
  );
  out.push(
    ...validateLocations(
      (document.metadata as Record<string, unknown> | undefined)?.locations,
      context,
    ),
  );
  out.push(...validateCredits(document.metadata, context));
  out.push(
    ...validateSources(
      document.body,
      (document.metadata ?? {}) as Record<string, unknown>,
      { expected: false },
    ),
  );
  out.push(
    ...validateMedia(
      document,
      parsed.success ? parsed.data : undefined,
      context,
    ),
  );
  if (document.publishedAt && !isValidDateTime(document.publishedAt)) {
    out.push(
      error(
        DOCUMENT_CODES.dateFormat,
        `meta.published must be a ${DATETIME_FORMAT}`,
        "publishedAt",
      ),
    );
  }
  if (!isValidDateTime(document.contentUpdatedAt)) {
    out.push(
      error(
        DOCUMENT_CODES.dateFormat,
        `meta.updated must be a ${DATETIME_FORMAT}`,
        "contentUpdatedAt",
      ),
    );
  }
  if (/^#\s/m.test(document.body)) {
    out.push(
      error(
        DOCUMENT_CODES.bodyH1,
        "body contains an H1; the page title renders the only H1",
      ),
    );
  }
  const faq = parsed.success ? parsed.data.faq : undefined;
  if (faq?.length && !/<Faq\b/.test(document.body)) {
    out.push(
      error(
        DOCUMENT_CODES.faqNotPlaced,
        "meta.faq is set but the body never places <Faq />",
        "faq",
      ),
    );
  }
  if (/<Faq\b/.test(document.body) && !faq?.length) {
    out.push(
      error(
        DOCUMENT_CODES.faqPlacedWithoutData,
        "body places <Faq /> but meta.faq is missing",
        "faq",
      ),
    );
  }
  return validationResult(out);
}

/** The `<Fuentes />` rules, shared by every section.
 *
 * Provenance renders where the tag is placed and nowhere else, so the tag is
 * what decides whether it is *demanded*: a page without it cannot show a list
 * however carefully it is filled in, and refusing to publish over one nothing
 * would display was asking for paperwork. Hence an error when the tag is placed
 * over an empty list, and a warning for the mirror case.
 *
 * `expected` is the one thing that differs by section. A statistics page
 * without provenance is an opinion piece with charts, so its silence is worth
 * an advisory. A guide mostly explains a thing rather than measures it, and
 * most of the forty have nothing to cite — an advisory on every one of them
 * would be noise that teaches an editor to skim warnings. */
function validateSources(
  body: string,
  raw: Record<string, unknown>,
  { expected }: { expected: boolean },
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const places = /<Fuentes\b/.test(body);
  const parsed = z.array(dataSourceSchema).safeParse(raw.sources);
  const names = parsed.success && parsed.data.length > 0;
  // A `sources` that is present but malformed is the shape checker's business:
  // it has already said what is wrong with it, and "there are none" on top of
  // that would send the editor looking for a second problem.
  const unreadable = raw.sources !== undefined && !parsed.success;
  if (!unreadable && !names) {
    if (places) {
      out.push(
        error(
          DOCUMENT_CODES.sourcesPlacedWithoutData,
          "body places <Fuentes /> but meta.sources names no source",
          "sources",
        ),
      );
    } else if (expected) {
      out.push(
        warn(
          DOCUMENT_CODES.sourcesMissing,
          "meta.sources names no source — a data page should say where its numbers come from, and place <Fuentes /> where they belong",
          "sources",
        ),
      );
    }
  }
  if (names && !places) {
    out.push(
      warn(
        DOCUMENT_CODES.sourcesNotPlaced,
        "meta.sources is set but the body never places <Fuentes /> — the sources are not shown to readers",
        "sources",
      ),
    );
  }
  return out;
}

/** The author-credit rules.
 *
 * Two of them, and they fail at different levels:
 *
 *   - an id no author has — only reachable by hand-editing the row or by an
 *     agent guessing instead of calling `list_authors`. An error: the byline
 *     would silently vanish from the markup, which is worse than a refused
 *     save.
 *   - the same person written down as both the writer and the fact checker.
 *     A warning rather than an error, because it is an editorial judgement and
 *     not a broken document — a page can genuinely ship that way while the
 *     second person is away, and refusing to publish over it would be the CMS
 *     overruling the desk. */
function validateCredits(
  metadata: unknown,
  context: DocumentValidationContext,
): Diagnostic[] {
  const record =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>)
      : {};

  const out: Diagnostic[] = [];
  const ids: Partial<Record<AuthorRoleField, string>> = {};

  for (const field of AUTHOR_ROLE_FIELDS) {
    const value = record[field];
    if (typeof value !== "string" || !value) continue;
    ids[field] = value;
    if (context.authors && !context.authors.has(value)) {
      out.push({
        code: DOCUMENT_CODES.authorUnknown,
        severity: "error",
        message: `No hay ningún autor con el id ${value}. Elige uno de la lista de autores.`,
        field,
      });
    }
  }

  if (ids.authorId && ids.authorId === ids.factCheckerId) {
    out.push({
      code: DOCUMENT_CODES.authorSelfCheck,
      severity: "warning",
      message:
        "La misma persona figura como autora y como verificadora. La verificación la hace alguien distinto de quien escribió.",
      field: "factCheckerId",
    });
  }

  return out;
}

/** The media rules (cms.md).
 *
 * Three things can go wrong, and they fail differently:
 *
 *   - an id nothing knows about — a hand-edited body, or a typo;
 *   - an id whose asset is in the trash or already purged — the page would
 *     render a gap, and after the grace period the bytes are gone;
 *   - an image with no alt text that was never declared decorative.
 *
 * All three are errors rather than warnings, because each one reaches a reader.
 * The remedy differs, so the messages say which is which rather than sharing a
 * generic "bad image" code. */
function validateMedia(
  document: ContentDocument,
  metadata: Record<string, unknown> | undefined,
  context: DocumentValidationContext,
): Diagnostic[] {
  const known = context.media;
  if (!known) return [];

  const out: Diagnostic[] = [];
  const check = (
    id: string,
    where: { field?: string; line?: number; column?: number },
  ) => {
    const asset = known.get(id);
    if (!asset) {
      out.push({
        code: DOCUMENT_CODES.mediaUnknown,
        severity: "error",
        message: `No hay ninguna imagen con el id ${id} en la biblioteca de medios.`,
        ...where,
      });
      return null;
    }
    if (asset.status !== "ready") {
      out.push({
        code: DOCUMENT_CODES.mediaNotReady,
        severity: "error",
        message:
          asset.status === "trashed" || asset.status === "purging"
            ? `La imagen ${id} está en la papelera. Restáurala desde /cms/media o elige otra.`
            : `La imagen ${id} ya no existe. Elige otra.`,
        ...where,
      });
      return null;
    }
    return asset;
  };

  const previewId = metadata?.previewMediaId;
  if (typeof previewId === "string" && previewId) {
    check(previewId, { field: "previewMediaId" });
  }

  const { media, external } = extractBodyReferences(document.body);
  for (const reference of media) {
    const where = {
      ...(reference.line !== undefined ? { line: reference.line } : {}),
      ...(reference.column !== undefined ? { column: reference.column } : {}),
    };
    const asset = check(reference.mediaId, where);
    if (!asset) continue;

    // Alt applies to an embedded image, not to a link that happens to point at
    // one: a link's text is what a reader hears.
    if (
      reference.kind === "image" &&
      !reference.alt?.trim() &&
      !asset.decorative
    ) {
      out.push({
        code: DOCUMENT_CODES.mediaNoAlt,
        severity: "error",
        message:
          "Esta imagen no tiene texto alternativo. Descríbela, o márcala como decorativa en la biblioteca si no aporta información.",
        ...where,
      });
    }
  }

  // A remote image in a body is refused outright: it can change without notice,
  // it can carry a tracking pixel, and it breaks when the other site
  // reorganizes. Import it into the library first.
  for (const image of external) {
    out.push({
      code: DOCUMENT_CODES.mediaExternal,
      severity: "error",
      message: `No enlaces imágenes externas (${image.url}). Súbela a la biblioteca de medios y usa su enlace.`,
      ...(image.line !== undefined ? { line: image.line } : {}),
    });
  }

  return out;
}

/** Statistics/research add dataset provenance to the shared category,
 * lifecycle, date, heading and FAQ placement safeguards. */
function validateDataSectionDocument(
  document: ContentDocument,
  context: DocumentValidationContext,
): ValidationResult {
  const out: Diagnostic[] = [];
  if (!document.slug.split("/").every((segment) => SLUG_RE.test(segment))) {
    out.push(
      error(
        DOCUMENT_CODES.slugShape,
        `slug "${document.slug}" must contain lowercase, hyphen-separated path segments`,
        "slug",
      ),
    );
  }
  if (document.slug.split("/")[0] === "categoria") {
    out.push(
      error(
        DOCUMENT_CODES.slugReserved,
        `slug "${document.slug}" starts with the reserved category route`,
        "slug",
      ),
    );
  }
  const parsed = contentMetadataSchema.safeParse(document.metadata);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      out.push(
        error(
          DOCUMENT_CODES.metadataShape,
          `meta.${issue.path.join(".") || "<root>"} ${issue.message}`,
          issue.path.join(".") || undefined,
        ),
      );
    }
  }
  const metadata = parsed.success ? parsed.data : null;
  // Sources and dataset are checked independently of the schema pass above, and
  // of each other: a partial dataset must not make a valid Fuentes list look
  // absent (or vice versa) in the editor.
  const raw =
    document.metadata && typeof document.metadata === "object"
      ? (document.metadata as Record<string, unknown>)
      : {};
  out.push(...validateCategories(raw.categories, context));
  out.push(...validateLocations(raw.locations, context));
  out.push(...validateCredits(document.metadata, context));
  out.push(...validateMedia(document, metadata ?? undefined, context));

  // Provenance is expected of a data page, but it is `<Fuentes />` that decides
  // whether it is *demanded*. The sources render there and nowhere else, so a
  // page without the tag cannot show them however carefully they are filled in,
  // and refusing to publish over a list nothing would display was asking for
  // paperwork. Missing provenance is worth saying out loud either way — as an
  // advisory when the page does not place the tag, as an error when it does —
  // and the mirror case, sources typed but never placed, is worth saying too.
  out.push(...validateSources(document.body, raw, { expected: true }));
  const dataset = datasetMetadataSchema.safeParse(raw.dataset);
  if (!dataset.success && raw.dataset === undefined) {
    out.push(
      error(
        DOCUMENT_CODES.metadataShape,
        "meta.dataset is required for statistics and research pages",
        "dataset",
      ),
    );
  }
  if (document.publishedAt && !isValidDateTime(document.publishedAt))
    out.push(
      error(
        DOCUMENT_CODES.dateFormat,
        `meta.published must be a ${DATETIME_FORMAT}`,
        "publishedAt",
      ),
    );
  if (!isValidDateTime(document.contentUpdatedAt))
    out.push(
      error(
        DOCUMENT_CODES.dateFormat,
        `meta.updated must be a ${DATETIME_FORMAT}`,
        "contentUpdatedAt",
      ),
    );
  if (/^#\s/m.test(document.body))
    out.push(
      error(
        DOCUMENT_CODES.bodyH1,
        "body contains an H1; the page title renders the only H1",
      ),
    );
  if (metadata?.faq?.length && !/<Faq\b/.test(document.body))
    out.push(
      error(
        DOCUMENT_CODES.faqNotPlaced,
        "meta.faq is set but the body never places <Faq />",
        "faq",
      ),
    );
  if (/<Faq\b/.test(document.body) && !metadata?.faq?.length)
    out.push(
      error(
        DOCUMENT_CODES.faqPlacedWithoutData,
        "body places <Faq /> but meta.faq is missing",
        "faq",
      ),
    );
  return validationResult(out);
}

/** One taxonomy rule for every section. It runs only at preview/publish level
 * because the validation pipeline never calls the document layer for drafts. */
function validateCategories(
  value: unknown,
  context: DocumentValidationContext,
): Diagnostic[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((category) => typeof category === "string")
  ) {
    return [
      error(
        DOCUMENT_CODES.metadataShape,
        "meta.categories must contain 1–3 category keys",
        "categories",
      ),
    ];
  }

  const categories = value as string[];
  const out: Diagnostic[] = [];
  if (new Set(categories).size !== categories.length) {
    out.push(
      error(
        DOCUMENT_CODES.categoryUnknown,
        "meta.categories has duplicate keys",
        "categories",
      ),
    );
  }
  if (categories.length > 3) {
    out.push(
      error(
        DOCUMENT_CODES.categoryCount,
        `meta.categories has ${categories.length}; use 1–3 and put the primary first`,
        "categories",
      ),
    );
  }
  if (context.categories) {
    for (const category of categories) {
      if (!context.categories.has(category)) {
        out.push(
          error(
            DOCUMENT_CODES.categoryUnknown,
            `meta.categories has unknown or retired key "${category}" for this section`,
            "categories",
          ),
        );
      }
    }
  }
  return out;
}

/** Global, flat, unordered location membership. The document layer runs only
 * for preview/publish, so drafts may retain an empty list while public copies
 * must name at least one active key. */
function validateLocations(
  value: unknown,
  context: DocumentValidationContext,
): Diagnostic[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((location) => typeof location === "string")
  ) {
    return [
      error(
        DOCUMENT_CODES.locationsMissing,
        "meta.locations must contain at least one location key",
        "locations",
      ),
    ];
  }

  const locations = value as string[];
  const out: Diagnostic[] = [];
  if (new Set(locations).size !== locations.length) {
    out.push(
      error(
        DOCUMENT_CODES.locationDuplicate,
        "meta.locations has duplicate keys",
        "locations",
      ),
    );
  }
  if (locations.length > 3) {
    out.push(
      warn(
        DOCUMENT_CODES.locationCount,
        `meta.locations has ${locations.length}; more than three is unusually broad`,
        "locations",
      ),
    );
  }
  if (context.locations) {
    for (const location of locations) {
      if (!context.locations.has(location)) {
        out.push(
          error(
            DOCUMENT_CODES.locationUnknown,
            `meta.locations has unknown or retired key "${location}"`,
            "locations",
          ),
        );
      }
    }
  }
  return out;
}

function validateBody(
  document: ContentDocument,
  index: ContentIndex,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const { body, slug } = document;

  if (body.trimStart().startsWith("---")) {
    out.push(
      error(
        DOCUMENT_CODES.bodyFrontmatter,
        "body starts with `---` frontmatter; metadata belongs in the page's fields",
      ),
    );
  }
  // The database body must never carry a meta block: cms.md puts metadata in
  // columns and JSONB, and a stray export would also be rejected by the
  // grammar layer. Named separately so the message says which mistake it is.
  if (/export\s+const\s+meta\s*=/.test(body)) {
    out.push(
      error(
        DOCUMENT_CODES.bodyMetaExport,
        "body contains an `export const meta` block; metadata belongs in the page's fields, not the body",
      ),
    );
  }
  if (/^#[ \t]/m.test(body)) {
    out.push(
      error(
        DOCUMENT_CODES.bodyH1,
        "body contains an H1 (`# …`); start sections at `##` (the page adds the H1)",
      ),
    );
  }

  // ── internal links ────────────────────────────────────────────────────────
  const interlinks = new Set<string>();
  for (const match of body.matchAll(/\]\((\/guias\/[^)\s#]+)/g)) {
    const target = match[1].replace(/\/$/, "");
    const targetSlug = target.slice("/guias/".length);
    if (targetSlug === "") continue; // the index page
    if (index.slugs.size > 0 && !index.slugs.has(targetSlug)) {
      out.push(
        error(
          DOCUMENT_CODES.linkBroken,
          `broken internal link → ${target} (no such guide)`,
        ),
      );
    } else if (targetSlug === slug) {
      out.push(warn(DOCUMENT_CODES.linkSelf, "links to itself"));
    } else {
      interlinks.add(targetSlug);
      // The old script's "links to a noindex guide" check, restated in
      // lifecycle terms: a link into anything not published is a link to a page
      // no listing shows and search engines are told to skip.
      if (
        index.publishedSlugs.size > 0 &&
        index.slugs.has(targetSlug) &&
        !index.publishedSlugs.has(targetSlug)
      ) {
        out.push(
          warn(
            DOCUMENT_CODES.linkUnpublished,
            `links to /guias/${targetSlug}, which is not published`,
          ),
        );
      }
    }
  }

  // ── advisories ────────────────────────────────────────────────────────────
  if (!/^##[ \t]/m.test(body)) {
    out.push(warn(DOCUMENT_CODES.noHeadings, "no `##` section headings found"));
  }

  const closing = /<ClosingCta\b([^>]*)>([\s\S]*?)<\/ClosingCta>/.exec(body);
  if (!closing) {
    if (!/<(CtaRow|DemoCta|SignupCta|CtaButton)\b/.test(body)) {
      out.push(
        warn(
          DOCUMENT_CODES.noClosingCta,
          "no CTA component — guides should end with a <ClosingCta>",
        ),
      );
    } else {
      out.push(
        warn(
          DOCUMENT_CODES.closingCtaBare,
          'closing CTA is a bare button row — use <ClosingCta title="…"> so the buttons come with a reason',
        ),
      );
    }
  } else if (!/\btitle\s*=/.test(closing[1])) {
    out.push(
      warn(
        DOCUMENT_CODES.closingCtaNoTitle,
        '<ClosingCta> without a title="…" — it falls back to generic copy',
      ),
    );
  } else if (closing[2].trim() === "") {
    out.push(
      warn(
        DOCUMENT_CODES.closingCtaNoCopy,
        "<ClosingCta> has no body copy — write the two guide-specific sentences",
      ),
    );
  }

  if (!/<RelatedGuides\b/.test(body)) {
    out.push(
      warn(
        DOCUMENT_CODES.noRelatedGuides,
        "no <RelatedGuides /> — add it just above the closing CTA",
      ),
    );
  }
  if (interlinks.size === 0) {
    out.push(
      warn(
        DOCUMENT_CODES.noInterlinks,
        "no links to other guides (interlink for SEO)",
      ),
    );
  }

  return out;
}

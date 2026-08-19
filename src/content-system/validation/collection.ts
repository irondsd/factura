import type { ContentDocument, Diagnostic } from "../types";
import type { ContentIndex } from "./document";
import { fold } from "./text";

// Layer 3 of cms.md §5: collection validation — the rules no single page can
// check about itself.
//
// Two pages sharing a <title> or a description are two pages competing for one
// search result with the same words, which is how a growing section starts
// cannibalizing itself. That is invisible to a per-document pass by
// construction, which is why it lives here and why `bun run validate:content`
// runs every section in one invocation rather than shelling out per section.

export const COLLECTION_CODES = {
  duplicateSlug: "collection.duplicate-slug",
  duplicateTitle: "collection.duplicate-title",
  duplicateDescription: "collection.duplicate-description",
  canonicalUnpublished: "collection.canonical-unpublished",
  canonicalChain: "collection.canonical-chain",
} as const;

/** One finding, attributed to the document it belongs to. Collection findings
 * are inherently about more than one page, so each is reported against every
 * page involved — the same way the old script pushed the collision onto both
 * reports.
 *
 * Attributed by section *and* slug, because a collection can span sections —
 * `bun scripts/import-sections.ts` validates statistics and research together,
 * and the whole reason it does is to catch a guide and a data page competing
 * for the same query. Slug alone would then route a finding to whichever page
 * happened to match first. */
export type CollectionDiagnostic = Diagnostic & {
  section: string;
  slug: string;
};

/** Build the index the document validator needs. The one place "which pages
 * exist and which are public" is derived, so a caller cannot accidentally
 * validate against a set that includes drafts. */
export function buildContentIndex(
  documents: readonly Pick<ContentDocument, "slug" | "status">[],
): ContentIndex {
  return {
    slugs: new Set(documents.map((d) => d.slug)),
    publishedSlugs: new Set(
      documents.filter((d) => d.status === "published").map((d) => d.slug),
    ),
  };
}

/** Normalize a headline or description the way a search engine effectively
 * does before comparing two of them: case- and accent-insensitive, with runs of
 * whitespace collapsed. */
const key = (value: string): string => fold(value).replace(/\s+/g, " ").trim();

export type CollectionValidationResult = {
  ok: boolean;
  diagnostics: CollectionDiagnostic[];
};

export function validateCollection(
  documents: readonly ContentDocument[],
): CollectionValidationResult {
  const out: CollectionDiagnostic[] = [];

  // ── duplicate slugs ───────────────────────────────────────────────────────
  // The database has a unique index on (section, slug), so this cannot happen
  // there — but the importer validates *before* writing, and the filesystem
  // adapter reads a directory where two sections could collide.
  const bySlug = new Map<string, ContentDocument[]>();
  for (const document of documents) {
    const id = `${document.section}/${document.slug}`;
    bySlug.set(id, [...(bySlug.get(id) ?? []), document]);
  }
  for (const [id, group] of bySlug) {
    if (group.length < 2) continue;
    for (const document of group) {
      out.push({
        section: document.section,
        slug: document.slug,
        code: COLLECTION_CODES.duplicateSlug,
        severity: "error",
        message: `${group.length} pages share the path /${id}`,
      });
    }
  }

  // ── colliding titles and descriptions ─────────────────────────────────────
  collide(documents, out, "title");
  collide(documents, out, "description");

  // ── canonicals ────────────────────────────────────────────────────────────
  const published = new Set(
    documents.filter((d) => d.status === "published").map((d) => d.slug),
  );
  const canonicalOf = new Map(
    documents
      .filter((d) => d.canonicalSlug)
      .map((d) => [d.slug, d.canonicalSlug as string]),
  );

  for (const document of documents) {
    const target = document.canonicalSlug;
    if (!target) continue;

    // Consolidating ranking onto a page that is not public sends the signal to
    // a URL search engines are told to skip, which loses both pages.
    //
    // Only when the target actually exists: a canonical pointing at nothing is
    // already reported by the document layer, and saying it is "not published"
    // as well is two messages for one mistake.
    const targetExists = documents.some((d) => d.slug === target);
    if (
      targetExists &&
      document.status === "published" &&
      !published.has(target)
    ) {
      out.push({
        section: document.section,
        slug: document.slug,
        code: COLLECTION_CODES.canonicalUnpublished,
        severity: "error",
        message: `meta.canonical points at "${target}", which is not published — a published page cannot canonicalize to one search engines are told to skip`,
        field: "canonicalSlug",
      });
    }

    // A → B → C. Search engines do not follow a canonical chain reliably, so
    // the middle page's signal is simply lost.
    const next = canonicalOf.get(target);
    if (next && next !== target) {
      out.push({
        section: document.section,
        slug: document.slug,
        code: COLLECTION_CODES.canonicalChain,
        severity: "error",
        message: `meta.canonical points at "${target}", which itself canonicalizes to "${next}" — point this page directly at "${next}"`,
        field: "canonicalSlug",
      });
    }
  }

  return { ok: !out.some((d) => d.severity === "error"), diagnostics: out };
}

function collide(
  documents: readonly ContentDocument[],
  out: CollectionDiagnostic[],
  field: "title" | "description",
): void {
  const seen = new Map<string, ContentDocument[]>();
  for (const document of documents) {
    const value = document[field];
    if (!value) continue;
    const k = key(value);
    seen.set(k, [...(seen.get(k) ?? []), document]);
  }
  for (const group of seen.values()) {
    if (group.length < 2) continue;
    for (const document of group) {
      const others = group
        .filter((o) => o !== document)
        .map((o) => `${o.section}/${o.slug}`);
      out.push({
        section: document.section,
        slug: document.slug,
        code:
          field === "title"
            ? COLLECTION_CODES.duplicateTitle
            : COLLECTION_CODES.duplicateDescription,
        severity: "error",
        message: `meta.${field} is identical to ${others.join(", ")} — make each one distinct, or canonicalize one page to the other`,
        field,
      });
    }
  }
}

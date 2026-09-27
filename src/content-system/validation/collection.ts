import type { ContentDocument, Diagnostic } from "../types";
import { type ContentIndex, pathKey } from "./document";
import { fold } from "./text";

// Layer 3 of cms.md: collection validation — the rules no single page can
// check about itself.
//
// Two pages sharing a <title> or a description are two pages competing for one
// search result with the same words, which is how a growing section starts
// cannibalizing itself. That is invisible to a per-document pass by
// construction, which is why the CMS publication gate validates the whole
// collection rather than checking the edited document in isolation.

export const COLLECTION_CODES = {
  duplicateSlug: "collection.duplicate-slug",
  duplicateTitle: "collection.duplicate-title",
  duplicateDescription: "collection.duplicate-description",
  canonicalChain: "collection.canonical-chain",
} as const;

/** The fields the rules below compare — every one of them, and nothing else.
 *
 * A subset rather than a whole `ContentDocument` because the CMS runs these
 * rules against every other page in a section on each publish-level check, and
 * reading every body in the section to compare titles is what drained the
 * database's transfer allowance. A whole document still satisfies it, so the
 * importer and the tests pass documents as they are. */
export type CollectionEntry = Pick<
  ContentDocument,
  | "id"
  | "section"
  | "slug"
  | "status"
  | "title"
  | "description"
  | "canonicalSlug"
>;

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
 * validate against a set that includes drafts.
 *
 * `sections` names what the index covers; by default, every section a
 * document is in. A caller holding every page passes every section, so a
 * section with no pages yet still counts as known — and a link into it as
 * broken. */
export function buildContentIndex(
  documents: readonly Pick<ContentDocument, "section" | "slug" | "status">[],
  sections: Iterable<string> = documents.map((d) => d.section),
): ContentIndex {
  return {
    sections: new Set(sections),
    paths: new Set(documents.map((d) => pathKey(d.section, d.slug))),
    publishedPaths: new Set(
      documents
        .filter((d) => d.status === "published")
        .map((d) => pathKey(d.section, d.slug)),
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
  documents: readonly CollectionEntry[],
): CollectionValidationResult {
  const out: CollectionDiagnostic[] = [];

  // ── duplicate slugs ───────────────────────────────────────────────────────
  // The database has a unique index on (section, slug), so this cannot happen
  // there — but the importer validates *before* writing, and the filesystem
  // adapter reads a directory where two sections could collide.
  const bySlug = new Map<string, CollectionEntry[]>();
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

  // ── canonical chains ──────────────────────────────────────────────────────
  // A → B → C. Search engines do not follow a canonical chain reliably, so the
  // middle page's signal is simply lost. Whether the target is *published* is
  // the document layer's question (`doc.canonical-unpublished`): it has the
  // index of every page, while this collection may hold only the public ones.
  const canonicalOf = new Map(
    documents
      .filter((d) => d.canonicalSlug)
      .map((d) => [`${d.section}/${d.slug}`, d.canonicalSlug as string]),
  );

  for (const document of documents) {
    const target = document.canonicalSlug;
    if (!target) continue;
    const next = canonicalOf.get(`${document.section}/${target}`);
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
  documents: readonly CollectionEntry[],
  out: CollectionDiagnostic[],
  field: "title" | "description",
): void {
  const seen = new Map<string, CollectionEntry[]>();
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

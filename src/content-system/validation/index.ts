import type {
  ContentDocument,
  ContentSection,
  Diagnostic,
  ValidationResult,
} from "../types";
import { validationResult } from "../types";
import {
  buildContentIndex,
  type CollectionDiagnostic,
  validateCollection,
} from "./collection";
import {
  type ContentIndex,
  type DocumentValidationContext,
  EMPTY_INDEX,
  validateDocument,
} from "./document";
import { validateGrammar } from "./grammar";

// The entry points cms.md §5.2 specifies, and the level policy from §5.3 that
// decides which layers a given write has to survive.
//
// Layering, from cheapest and strictest to most expensive:
//
//   grammar    — can this be safely compiled at all? Always runs.
//   document   — is this a complete, correct page on its own?
//   collection — is it correct *among* the other pages?
//   render     — does the real component registry actually render it?
//
// `render` is not run here: it needs to compile and execute the body, which is
// `compileContent`'s job in `../render/renderContent`, and only the publish
// path pays that cost. `validateForPublish` in `src/cms/server/validation.ts`
// is what strings the two together.

export { buildContentIndex, validateCollection } from "./collection";
export {
  type ContentIndex,
  type DocumentValidationContext,
  EMPTY_INDEX,
  validateDocument,
} from "./document";
export { validateGrammar } from "./grammar";
export { fold, missingKeywordWords } from "./text";

/** Which layers run at each level. cms.md §5.3:
 *
 * - `draft`   — a draft may be incomplete, so only the grammar has to hold.
 *               Forbidden syntax is still refused; unfinished prose is not.
 * - `preview` — a preview URL is shareable, so it must be a real page.
 * - `publish` — everything, because the saved copy *is* the live page. */
export const LEVEL_LAYERS = {
  draft: { grammar: true, document: false, collection: false },
  preview: { grammar: true, document: true, collection: false },
  publish: { grammar: true, document: true, collection: true },
} as const;

export type ContentValidationLevel = keyof typeof LEVEL_LAYERS;

export type ValidateDocumentOptions = {
  index?: ContentIndex;
  context?: DocumentValidationContext;
  /** The rest of the collection, needed only at `publish`. */
  collection?: readonly ContentDocument[];
};

/** Validate one document to a given level. The single call the CMS service,
 * the MCP and the CLI all make. */
export function validateContentDocument(
  document: ContentDocument,
  level: ContentValidationLevel,
  options: ValidateDocumentOptions = {},
): ValidationResult {
  const layers = LEVEL_LAYERS[level];
  const diagnostics: Diagnostic[] = [];

  const grammar = validateGrammar(document.body, document.section);
  diagnostics.push(...grammar.diagnostics);
  // A body that does not parse makes every later layer report noise about a
  // tree that was never there. Stop at the first layer that failed.
  if (!grammar.ok) return validationResult(diagnostics);

  if (layers.document) {
    diagnostics.push(
      ...validateDocument(
        document,
        options.index ?? EMPTY_INDEX,
        options.context ?? {},
      ).diagnostics,
    );
  }

  if (layers.collection && options.collection) {
    // Validate this document *within* the collection, then keep only the
    // findings that are about it — the others belong to their own pages.
    const others = options.collection.filter((d) => d.id !== document.id);
    const collection = validateCollection([...others, document]);
    diagnostics.push(
      ...collection.diagnostics
        .filter(
          (d) => d.section === document.section && d.slug === document.slug,
        )
        .map(withoutSource),
    );
  }

  return validationResult(diagnostics);
}

/** Validate a whole collection: every document at publish level, plus the
 * cross-document rules. What the CLI runs and what the importer's parity check
 * compares. */
export function validateContentCollection(
  documents: readonly ContentDocument[],
  context: DocumentValidationContext = {},
): Map<string, Diagnostic[]> {
  const index = buildContentIndex(documents);
  const byKey = new Map<string, Diagnostic[]>();
  const keyOf = (d: Pick<ContentDocument, "section" | "slug">) =>
    `${d.section}/${d.slug}`;

  for (const document of documents) {
    const grammar = validateGrammar(document.body, document.section);
    const diagnostics = [...grammar.diagnostics];
    if (grammar.ok) {
      diagnostics.push(
        ...validateDocument(document, index, context).diagnostics,
      );
    }
    byKey.set(keyOf(document), diagnostics);
  }

  for (const finding of validateCollection(documents).diagnostics) {
    // By section *and* slug: this function is called with a mixed-section
    // collection by `scripts/import-sections.ts`, where matching on slug alone
    // would file a finding against the wrong section's page.
    byKey
      .get(`${finding.section}/${finding.slug}`)
      ?.push(withoutSource(finding));
  }

  return byKey;
}

/** Collection findings carry the section and slug they belong to so a caller
 * can route them; once routed, both are redundant on the diagnostic itself. */
function withoutSource(finding: CollectionDiagnostic): Diagnostic {
  const { code, severity, message, line, column, field } = finding;
  return {
    code,
    severity,
    message,
    ...(line !== undefined ? { line } : {}),
    ...(column !== undefined ? { column } : {}),
    ...(field !== undefined ? { field } : {}),
  };
}

/** Every section this validator knows how to check. Section 12 adds the other
 * two; today only guides have rules of their own. */
export const VALIDATED_SECTIONS: readonly ContentSection[] = [
  "guias",
  "estadisticas",
  "investigaciones",
];

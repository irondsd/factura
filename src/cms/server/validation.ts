import "server-only";
import { assertContentRenders } from "@/content-system/render/renderContent";
import {
  buildContentIndex,
  type CollectionEntry,
  type ContentValidationLevel,
  validateContentDocument,
} from "@/content-system/validation";
import {
  CONTENT_SECTIONS,
  type ContentDocument,
  type ValidationResult,
} from "@/content-system/types";
import { validationResult } from "@/content-system/types";
import {
  mediaIdsIn,
  metadataMediaReferences,
} from "@/content-system/media/references";
import { cmsMediaStore } from "../media/server/store";
import { cmsCategoryStore } from "../categories/server/store";
import { cmsAuthorStore } from "../authors/server/store";
import { cmsLocationStore } from "../locations/server/store";
import type { ContentValidator } from "./contentService";
import { CmsPageStore, cmsPageStore as defaultStore } from "./store";

// Wires the pure validators to the CMS service. Phase 2 left the service's
// validator as a required constructor argument precisely so this could not be
// forgotten: there is no default, so a service is either built with this or it
// does not compile.
//
// This module supplies the two things the pure layer cannot get for itself —
// the rest of the collection, which lives in the database, and layer 4 (render
// validation), which has to actually compile the body.

export const RENDER_CODE = "render.failed";

/** Build the validator the CMS service uses.
 *
 * Only the `publish` level pays for the collection read and the compile. A
 * draft save runs the grammar alone, which is what makes saving unfinished work
 * fast and cms.md correct. */
export function createCmsValidator(
  store: CmsPageStore = defaultStore,
): ContentValidator {
  return async ({ document, level }) => {
    const validationLevel = level as ContentValidationLevel;

    // The collection is only needed at publish level: the section's published
    // pages, which are what a publication could collide with.
    const [collection, index] = await Promise.all([
      validationLevel === "publish"
        ? collectionFor(store, document)
        : Promise.resolve(undefined),
      indexFor(store, document),
    ]);

    const [media, categories, authors, locations] = await Promise.all([
      mediaStatusesFor(document),
      validationLevel === "draft"
        ? Promise.resolve(undefined)
        : cmsCategoryStore
            .list(document.section)
            .then((items) => new Set(items.map((item) => item.key))),
      // Two rows, and only fetched above draft level for the same reason the
      // categories are: a draft may name someone who has not been added yet,
      // and saving unfinished work must stay cheap.
      validationLevel === "draft"
        ? Promise.resolve(undefined)
        : cmsAuthorStore
            .list()
            .then((items) => new Set(items.map((item) => item.id))),
      validationLevel === "draft"
        ? Promise.resolve(undefined)
        : cmsLocationStore
            .list()
            .then((items) => new Set(items.map((item) => item.key))),
    ]);

    const result = validateContentDocument(document, validationLevel, {
      index,
      collection,
      // The media rules are pure, so the library is resolved before they run.
      // One query for whatever this document references — a page with no images
      // makes none at all.
      context: { media, categories, locations, authors },
    });

    // Layer 4: render validation (cms.md). Compile the body against the
    // real component registry *and render it*, because "the grammar is fine"
    // and "React can render this" are different claims — a container nested
    // somewhere the renderer chokes on passes the first and fails the second.
    // This used to stop at the compile, which proved only the first of the two.
    // Only at publish level: it is the one gate where a failure would otherwise
    // be a broken live page.
    if (result.ok && validationLevel === "publish") {
      try {
        await assertContentRenders(document.body, document.section);
      } catch (cause) {
        return validationResult([
          ...result.diagnostics,
          {
            code: RENDER_CODE,
            severity: "error",
            message: `The page could not be rendered: ${cause instanceof Error ? cause.message : String(cause)}`,
          },
        ]);
      }
    }

    return result;
  };
}

/** What the media library knows about the images this document references.
 *
 * Read here rather than inside the validator because the validator is pure and
 * has no database — and because resolving it once, up front, keeps the rules
 * from turning into a query per image. An empty map for a document with no
 * media references, which is most of them. */
async function mediaStatusesFor(
  document: ContentDocument,
): Promise<ReadonlyMap<string, { status: string; decorative: boolean }>> {
  const ids = new Set([
    ...mediaIdsIn(document.body),
    ...metadataMediaReferences(document.metadata).map((ref) => ref.mediaId),
  ]);
  if (ids.size === 0) return new Map();

  const assets = await cmsMediaStore.findManyByIds([...ids]);
  return new Map(
    assets.map((asset) => [
      asset.id,
      { status: asset.status, decorative: asset.decorative },
    ]),
  );
}

/** The section's published pages, plus the document itself as the caller has
 * it — so an unsaved edit is validated against the collection it would join,
 * not against its own stored version.
 *
 * Published pages only (`CmsPageStore.publishedOutline`): the duplicate-title
 * and canonical-chain rules are about pages competing in search results, and a
 * draft — or another page's unpublished working copy — is not there yet. It is
 * measured when it is published itself. The outline, not the documents: these
 * rules compare titles, descriptions and canonicals, and reading every body in
 * the section to compare them cost about 1.5 MB of database transfer per
 * check. */
async function collectionFor(
  store: CmsPageStore,
  document: ContentDocument,
): Promise<CollectionEntry[]> {
  const published = await store.publishedOutline(document.section);
  return [...published.filter((entry) => entry.id !== document.id), document];
}

/** Every page in every section, by address and status — what links and
 * canonicals resolve against. Across sections because links cross them, and
 * every section is named as covered, so a link into one with no pages yet is
 * still reported broken. The document's own entry is replaced by the caller's
 * version of it, so a status or address it is about to have is the one used. */
async function indexFor(store: CmsPageStore, document: ContentDocument) {
  const pages = await store.pageIndex();
  return buildContentIndex(
    [
      ...pages.filter((entry) => entry.id !== document.id),
      {
        section: document.section,
        slug: document.slug,
        status: document.status,
      },
    ],
    CONTENT_SECTIONS,
  );
}

export type { ValidationResult };

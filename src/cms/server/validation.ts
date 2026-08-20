import "server-only";
import { compileContent } from "@/content-system/render/renderContent";
import {
  buildContentIndex,
  type ContentValidationLevel,
  validateContentDocument,
} from "@/content-system/validation";
import type { ContentDocument, ValidationResult } from "@/content-system/types";
import { validationResult } from "@/content-system/types";
import { mediaIdsIn } from "@/content-system/media/references";
import { cmsMediaStore } from "../media/server/store";
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
 * fast and cms.md §5.3 correct. */
export function createCmsValidator(
  store: CmsPageStore = defaultStore,
): ContentValidator {
  return async ({ document, level }) => {
    const validationLevel = level as ContentValidationLevel;

    // The collection is only needed at publish level, and it is the expensive
    // part — every other page in the section.
    const collection =
      validationLevel === "publish"
        ? await collectionFor(store, document)
        : undefined;

    const index = collection
      ? buildContentIndex(collection)
      : await indexFor(store, document);

    const result = validateContentDocument(document, validationLevel, {
      index,
      collection,
      // The media rules are pure, so the library is resolved before they run.
      // One query for whatever this document references — a page with no images
      // makes none at all.
      context: { media: await mediaStatusesFor(document) },
    });

    // Layer 4: render validation (cms.md §5.1). Compile the body against the
    // real component registry, because "the grammar is fine" and "React can
    // render this" are different claims — a container nested somewhere the
    // renderer chokes on passes the first and fails the second. Only at publish
    // level: it is the one gate where a failure would otherwise be a broken
    // live page.
    if (result.ok && validationLevel === "publish") {
      try {
        await compileContent(document.body, document.section);
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
  const ids = new Set(mediaIdsIn(document.body));
  const preview = (document.metadata as Record<string, unknown> | undefined)
    ?.previewMediaId;
  if (typeof preview === "string" && preview) ids.add(preview.toLowerCase());
  if (ids.size === 0) return new Map();

  const assets = await cmsMediaStore.findManyByIds([...ids]);
  return new Map(
    assets.map((asset) => [
      asset.id,
      { status: asset.status, decorative: asset.decorative },
    ]),
  );
}

/** Every other page in this document's section, plus the document itself as the
 * caller has it — so an unsaved edit is validated against the collection it
 * would join, not against its own stored version. */
async function collectionFor(
  store: CmsPageStore,
  document: ContentDocument,
): Promise<ContentDocument[]> {
  const summaries = await store.list({ section: document.section });
  const others = await Promise.all(
    summaries
      .filter((s) => s.id !== document.id)
      .map((s) => store.findById(s.id)),
  );
  return [...others.filter((d): d is ContentDocument => d !== null), document];
}

/** The cheap index: slugs and statuses only, for the link and canonical checks
 * at preview level, where the full collection is not needed. */
async function indexFor(store: CmsPageStore, document: ContentDocument) {
  const summaries = await store.list({ section: document.section });
  return buildContentIndex(
    summaries.map((s) =>
      s.id === document.id
        ? { slug: document.slug, status: document.status }
        : { slug: s.slug, status: s.status },
    ),
  );
}

export type { ValidationResult };

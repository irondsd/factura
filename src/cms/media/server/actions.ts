"use server";

import { revalidatePath } from "next/cache";
import { requireCmsMember } from "../../auth/requireCmsMember";
import type { CmsActionResult } from "../../server/actions";
import {
  CmsConflictError,
  CmsForbiddenError,
  CmsMediaInUseError,
  CmsMediaUnavailableError,
  CmsNotFoundError,
  CmsValidationError,
} from "../../server/errors";
import type {
  MediaAsset,
  MediaAssetWithUsage,
  MediaCollection,
  MediaListFilter,
} from "../types";
import type { MediaPatch } from "./store";
import { cmsMediaService as service, type ReservedUpload } from "./service";
import { reconcileMediaUsage } from "./usage";
import { reconcileBucket, type BucketReconciliation } from "./purge";

// The browser's way into the media service. Thin, like `src/cms/server/actions`:
// resolve the actor, call the service, translate its exceptions into something a
// form can render. Every rule lives below them, which is what keeps the MCP
// adapter a second caller rather than a second implementation.
//
// There is no upload route handler. The bytes never pass through the
// application: the browser asks for a reservation, PUTs directly to object
// storage with the presigned URL it gets back, and then asks for finalization.
// That is what keeps a 20 MB image from meeting a hosting provider's request
// body limit.

export type MediaActionResult<T> =
  | CmsActionResult<T>
  | {
      ok: false;
      kind: "media_in_use" | "media_unavailable";
      message: string;
      usage?: { section: string; slug: string; title: string }[];
    };

function toResult(error: unknown): MediaActionResult<never> {
  if (error instanceof CmsMediaInUseError) {
    return {
      ok: false,
      kind: "media_in_use",
      message: error.message,
      usage: error.usage,
    };
  }
  if (error instanceof CmsMediaUnavailableError) {
    return { ok: false, kind: "media_unavailable", message: error.message };
  }
  if (error instanceof CmsValidationError) {
    return {
      ok: false,
      kind: "invalid",
      message: error.diagnostics[0]?.message ?? error.message,
      diagnostics: error.diagnostics,
    };
  }
  if (error instanceof CmsConflictError) {
    return {
      ok: false,
      kind: "conflict",
      message: error.message,
      actualLockVersion: error.actualLockVersion,
    };
  }
  if (error instanceof CmsForbiddenError) {
    return { ok: false, kind: "forbidden", message: error.message };
  }
  if (error instanceof CmsNotFoundError) {
    return { ok: false, kind: "not_found", message: error.message };
  }
  throw error;
}

const refresh = (id?: string) => {
  revalidatePath("/cms/media");
  if (id) revalidatePath(`/cms/media/${id}`);
};

export async function listMediaAction(
  filter: MediaListFilter,
): Promise<MediaAssetWithUsage[]> {
  await requireCmsMember("/cms/media");
  return service.list(filter);
}

/** One asset, for a control that holds an id and has to show a person something
 * recognizable instead of a uuid. */
export async function getMediaAction(id: string) {
  await requireCmsMember("/cms/media");
  try {
    const detail = await service.get(id);
    return detail.asset;
  } catch (error) {
    if (error instanceof CmsNotFoundError) return null;
    throw error;
  }
}

/** The sidebar's numbers. A separate call from the grid so the counts stay
 * consistent with each other — one pass over the table — rather than being
 * inferred from whichever slice the grid happens to be showing. */
export async function mediaCountsAction() {
  await requireCmsMember("/cms/media");
  return service.counts();
}

export async function reserveUploadAction(input: {
  filename: string;
  contentType: string;
  byteSize: number;
  collectionId?: string | null;
}): Promise<MediaActionResult<ReservedUpload>> {
  const actor = await requireCmsMember("/cms/media");
  try {
    return { ok: true, data: await service.reserveUpload(actor, input) };
  } catch (error) {
    return toResult(error);
  }
}

export async function completeUploadAction(input: {
  mediaId: string;
}): Promise<MediaActionResult<MediaAsset>> {
  const actor = await requireCmsMember("/cms/media");
  try {
    const asset = await service.completeUpload(actor, input);
    refresh();
    return { ok: true, data: asset };
  } catch (error) {
    return toResult(error);
  }
}

export async function updateMediaAction(input: {
  id: string;
  expectedLockVersion: number;
  patch: MediaPatch;
}): Promise<MediaActionResult<MediaAsset>> {
  const actor = await requireCmsMember("/cms/media");
  try {
    const asset = await service.update(actor, input);
    refresh(input.id);
    return { ok: true, data: asset };
  } catch (error) {
    return toResult(error);
  }
}

/** Move an unused asset to the trash. Reversible for the whole grace period —
 * this is the only removal an editor reaches by accident, and it takes nothing
 * away. */
export async function trashMediaAction(input: {
  id: string;
}): Promise<MediaActionResult<MediaAsset>> {
  const actor = await requireCmsMember("/cms/media");
  try {
    const asset = await service.trash(actor, input);
    refresh(input.id);
    return { ok: true, data: asset };
  } catch (error) {
    return toResult(error);
  }
}

export async function restoreMediaAction(input: {
  id: string;
}): Promise<MediaActionResult<MediaAsset>> {
  const actor = await requireCmsMember("/cms/media");
  try {
    const asset = await service.restore(actor, input);
    refresh(input.id);
    return { ok: true, data: asset };
  } catch (error) {
    return toResult(error);
  }
}

/** «Eliminar definitivamente». Runs the same guarded sequence as the scheduled
 * sweep, including the final usage re-check. */
export async function purgeMediaAction(input: {
  id: string;
}): Promise<MediaActionResult<{ id: string }>> {
  const actor = await requireCmsMember("/cms/media");
  try {
    await service.purgeNow(actor, input);
    refresh(input.id);
    return { ok: true, data: { id: input.id } };
  } catch (error) {
    return toResult(error);
  }
}

export async function createCollectionAction(input: {
  name: string;
}): Promise<MediaActionResult<MediaCollection>> {
  const actor = await requireCmsMember("/cms/media");
  try {
    const collection = await service.createCollection(actor, input);
    refresh();
    return { ok: true, data: collection };
  } catch (error) {
    return toResult(error);
  }
}

export async function renameCollectionAction(input: {
  id: string;
  name: string;
}): Promise<MediaActionResult<MediaCollection>> {
  const actor = await requireCmsMember("/cms/media");
  try {
    const collection = await service.renameCollection(actor, input);
    refresh();
    return { ok: true, data: collection };
  } catch (error) {
    return toResult(error);
  }
}

export async function deleteCollectionAction(input: {
  id: string;
}): Promise<MediaActionResult<{ id: string }>> {
  const actor = await requireCmsMember("/cms/media");
  try {
    await service.deleteCollection(actor, input.id);
    refresh();
    return { ok: true, data: { id: input.id } };
  } catch (error) {
    return toResult(error);
  }
}

/** Re-derive every usage row from every page, and diff the bucket against the
 * catalog. Two audits behind one button, because they answer the same question
 * from opposite ends: does the library still describe reality? */
export async function reconcileAction(): Promise<
  MediaActionResult<{
    usage: {
      pagesScanned: number;
      referencesFound: number;
      unresolved: number;
    };
    bucket: BucketReconciliation;
  }>
> {
  await requireCmsMember("/cms/media");
  try {
    const usage = await reconcileMediaUsage();
    const bucket = await reconcileBucket();
    refresh();
    return {
      ok: true,
      data: {
        usage: {
          pagesScanned: usage.pagesScanned,
          referencesFound: usage.referencesFound,
          unresolved: usage.unresolved.length,
        },
        bucket,
      },
    };
  } catch (error) {
    return toResult(error);
  }
}

"use server";

import { revalidatePath } from "next/cache";
import type {
  ContentSection,
  ContentStatus,
  Diagnostic,
} from "@/content-system/types";
import { requireCmsMember } from "../auth/requireCmsMember";
import { cmsSectionPath } from "../sections";
import type {
  CreateContentInput,
  UpdateContentInput,
  VersionComparison,
} from "./contentService";
import {
  CmsConflictError,
  CmsForbiddenError,
  CmsNoWorkingCopyError,
  CmsNotDeletableError,
  CmsNotFoundError,
  CmsRevisionNotFoundError,
  CmsSlugTakenError,
  CmsValidationError,
} from "./errors";
import { cmsContentService as service } from "./service";

// The browser's way into the CMS service. Thin on purpose (§2.1): these
// resolve the actor, call the service, and translate its exceptions into
// something a form can render. Every rule lives below them, which is what makes
// the MCP in Phase 8 a second caller rather than a second implementation.

/** What every action returns. A discriminated result rather than a thrown
 * error, because a conflict and a validation failure are both things the editor
 * has to *show*, not crash on. */
export type CmsActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      kind:
        | "conflict"
        | "invalid"
        | "forbidden"
        | "not_found"
        | "slug_taken"
        | "not_deletable"
        | "no_working_copy";
      message: string;
      diagnostics?: Diagnostic[];
      /** On a conflict: the version actually in the database. */
      actualLockVersion?: number | null;
    };

function toResult(error: unknown): CmsActionResult<never> {
  if (error instanceof CmsConflictError) {
    return {
      ok: false,
      kind: "conflict",
      message: error.message,
      actualLockVersion: error.actualLockVersion,
    };
  }
  if (error instanceof CmsValidationError) {
    return {
      ok: false,
      kind: "invalid",
      message: error.message,
      diagnostics: error.diagnostics,
    };
  }
  if (error instanceof CmsSlugTakenError) {
    return { ok: false, kind: "slug_taken", message: error.message };
  }
  if (error instanceof CmsNotDeletableError) {
    return { ok: false, kind: "not_deletable", message: error.message };
  }
  if (error instanceof CmsNoWorkingCopyError) {
    return { ok: false, kind: "no_working_copy", message: error.message };
  }
  if (error instanceof CmsRevisionNotFoundError) {
    return { ok: false, kind: "not_found", message: error.message };
  }
  if (error instanceof CmsForbiddenError) {
    return { ok: false, kind: "forbidden", message: error.message };
  }
  if (error instanceof CmsNotFoundError) {
    return { ok: false, kind: "not_found", message: error.message };
  }
  throw error;
}

/** Refresh the CMS's own views after a write.
 *
 * Only the CMS's. The public cache is expired by the content service, not from
 * here: whether a write is publicly visible at all is a rule, the MCP performs
 * the same writes through a Route Handler, and §2.2 puts rules below both
 * transports rather than in each of them. See `./invalidation`. */
function refreshCms(section: ContentSection, id?: string): void {
  revalidatePath(cmsSectionPath(section));
  if (id) revalidatePath(`${cmsSectionPath(section)}/${id}`);
}

export async function createContentAction(
  input: CreateContentInput,
): Promise<CmsActionResult<{ id: string }>> {
  const actor = await requireCmsMember();
  try {
    const page = await service.create(actor, input);
    refreshCms(input.section);
    return { ok: true, data: { id: page.id } };
  } catch (error) {
    return toResult(error);
  }
}

/** Save the working copy. Never publishes and never touches the live page —
 * see `CmsContentService.update`. */
export async function saveContentAction(
  section: ContentSection,
  input: UpdateContentInput,
): Promise<
  CmsActionResult<{
    lockVersion: number;
    contentUpdatedAt: string;
    wipRevisionId: string;
    wipUpdatedAt: string;
  }>
> {
  const actor = await requireCmsMember();
  try {
    const saved = await service.update(actor, input);
    refreshCms(section, saved.document.id);
    return {
      ok: true,
      data: {
        lockVersion: saved.document.lockVersion,
        contentUpdatedAt: saved.document.contentUpdatedAt,
        wipRevisionId: saved.wipRevisionId,
        wipUpdatedAt: saved.wipUpdatedAt,
      },
    };
  } catch (error) {
    return toResult(error);
  }
}

/** Publish the working copy (cms.md §14.5.4). Separate from
 * `setContentStatusAction` because it answers with more than a status: whether
 * a publication was actually filed, and which number it got. */
export async function publishContentAction(
  section: ContentSection,
  input: { id: string; expectedLockVersion: number },
): Promise<
  CmsActionResult<{
    status: ContentStatus;
    lockVersion: number;
    publicationNumber: number | null;
    noChange: boolean;
  }>
> {
  const actor = await requireCmsMember();
  try {
    const result = await service.publish(actor, input);
    refreshCms(section, input.id);
    return {
      ok: true,
      data: {
        status: result.status,
        lockVersion: result.lockVersion,
        publicationNumber: result.publicationNumber,
        noChange: result.noChange,
      },
    };
  } catch (error) {
    return toResult(error);
  }
}

/** Freeze the working copy into the shareable public preview, or refresh a
 * preview that has fallen behind it. */
export async function promotePreviewAction(
  section: ContentSection,
  input: { id: string; expectedLockVersion: number },
): Promise<CmsActionResult<{ status: ContentStatus; lockVersion: number }>> {
  const actor = await requireCmsMember();
  try {
    const page = await service.promotePreview(actor, input);
    refreshCms(section, page.id);
    return {
      ok: true,
      data: { status: page.status, lockVersion: page.lockVersion },
    };
  } catch (error) {
    return toResult(error);
  }
}

/** Throw the working copy away. Changes nothing public — the page keeps
 * serving whatever it was serving. */
export async function discardWipAction(
  section: ContentSection,
  input: { id: string; expectedLockVersion: number },
): Promise<CmsActionResult<{ lockVersion: number }>> {
  const actor = await requireCmsMember();
  try {
    const page = await service.discardWip(actor, input);
    refreshCms(section, page.id);
    return { ok: true, data: { lockVersion: page.lockVersion } };
  } catch (error) {
    return toResult(error);
  }
}

/** Copy a retained version into the working copy. Never publishes. */
export async function restoreVersionAction(
  section: ContentSection,
  input: { id: string; revisionId: string; expectedLockVersion: number },
): Promise<CmsActionResult<{ lockVersion: number }>> {
  const actor = await requireCmsMember();
  try {
    const restored = await service.restoreVersion(actor, input);
    refreshCms(section, input.id);
    return { ok: true, data: { lockVersion: restored.document.lockVersion } };
  } catch (error) {
    return toResult(error);
  }
}

/** The comparison the «Historial» tab renders. Read-only: it records nothing
 * and writes nothing. */
export async function compareVersionAction(input: {
  id: string;
  revisionId?: string;
}): Promise<CmsActionResult<VersionComparison>> {
  const actor = await requireCmsMember();
  try {
    return { ok: true, data: await service.compareVersion(actor, input) };
  } catch (error) {
    return toResult(error);
  }
}

export async function setContentStatusAction(
  section: ContentSection,
  input: { id: string; status: ContentStatus; expectedLockVersion: number },
): Promise<CmsActionResult<{ status: ContentStatus; lockVersion: number }>> {
  const actor = await requireCmsMember();
  try {
    const page = await service.setStatus(actor, input);
    refreshCms(section, page.id);
    return {
      ok: true,
      data: { status: page.status, lockVersion: page.lockVersion },
    };
  } catch (error) {
    return toResult(error);
  }
}

/** Delete a page for good. The service refuses anything that is not an
 * unpublished, childless draft at the version the editor is holding, so this
 * stays the same thin adapter as the rest — including the revalidation, which
 * matters here because the section list must stop listing a page that no longer
 * exists. */
export async function deleteContentAction(
  section: ContentSection,
  input: { id: string; expectedLockVersion: number },
): Promise<CmsActionResult<{ id: string }>> {
  const actor = await requireCmsMember();
  try {
    await service.delete(actor, input);
    refreshCms(section, input.id);
    return { ok: true, data: { id: input.id } };
  } catch (error) {
    return toResult(error);
  }
}

/** Validate without saving — what the Validation tab calls. Runs against the
 * *saved* page plus the editor's unsaved changes, so it answers "would this
 * save be accepted?" rather than "was the last one". */
export async function validateContentAction(input: {
  id: string;
  patch?: UpdateContentInput["patch"];
  level?: "draft" | "preview" | "publish";
}): Promise<CmsActionResult<{ diagnostics: Diagnostic[] }>> {
  const actor = await requireCmsMember();
  try {
    const result = await service.validateOnly(actor, input);
    return { ok: true, data: { diagnostics: result.diagnostics } };
  } catch (error) {
    return toResult(error);
  }
}

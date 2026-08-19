"use server";

import { revalidatePath } from "next/cache";
import type {
  ContentSection,
  ContentStatus,
  Diagnostic,
} from "@/content-system/types";
import { requireCmsMember } from "../auth/requireCmsMember";
import { cmsSectionPath } from "../sections";
import type { CreateContentInput, UpdateContentInput } from "./contentService";
import {
  CmsConflictError,
  CmsForbiddenError,
  CmsNotDeletableError,
  CmsNotFoundError,
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
        | "not_deletable";
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
  if (error instanceof CmsForbiddenError) {
    return { ok: false, kind: "forbidden", message: error.message };
  }
  if (error instanceof CmsNotFoundError) {
    return { ok: false, kind: "not_found", message: error.message };
  }
  throw error;
}

/** Refresh the CMS's own views after a write. Public pages are *not*
 * revalidated: iteration 1 deliberately leaves them on the one-hour TTL
 * (§3.3), and the editor says so. */
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

export async function saveContentAction(
  section: ContentSection,
  input: UpdateContentInput,
): Promise<CmsActionResult<{ lockVersion: number; contentUpdatedAt: string }>> {
  const actor = await requireCmsMember();
  try {
    const page = await service.update(actor, input);
    refreshCms(section, page.id);
    return {
      ok: true,
      data: {
        lockVersion: page.lockVersion,
        contentUpdatedAt: page.contentUpdatedAt,
      },
    };
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

"use server";

import { revalidatePath } from "next/cache";
import type {
  ContentCategory,
  ContentCategoryWithUsage,
} from "@/content-system/categories/types";
import type { ContentSection, Diagnostic } from "@/content-system/types";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { cmsSectionPath } from "@/cms/sections";
import {
  CmsCategoryConflictError,
  CmsCategoryInUseError,
  CmsCategorySlugTakenError,
  CmsForbiddenError,
  CmsNotFoundError,
  CmsValidationError,
} from "@/cms/server/errors";
import {
  cmsCategoryService as service,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from "./service";

export type CategoryActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      kind:
        | "conflict"
        | "invalid"
        | "forbidden"
        | "not_found"
        | "slug_taken"
        | "in_use";
      message: string;
      diagnostics?: Diagnostic[];
      usage?: { id: string; section: string; slug: string; title: string }[];
      actualLockVersion?: number | null;
    };

function failure(error: unknown): CategoryActionResult<never> {
  if (error instanceof CmsCategoryConflictError) {
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
  if (error instanceof CmsCategorySlugTakenError) {
    return { ok: false, kind: "slug_taken", message: error.message };
  }
  if (error instanceof CmsCategoryInUseError) {
    return {
      ok: false,
      kind: "in_use",
      message: error.message,
      usage: error.usage,
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

const refresh = (section: ContentSection) =>
  revalidatePath(cmsSectionPath(section));

export async function listCategoriesAction(
  section: ContentSection,
): Promise<ContentCategoryWithUsage[]> {
  const actor = await requireCmsMember(cmsSectionPath(section));
  return service.list(actor, section);
}

export async function createCategoryAction(
  input: CreateCategoryInput,
): Promise<CategoryActionResult<ContentCategory>> {
  const actor = await requireCmsMember(cmsSectionPath(input.section));
  try {
    const category = await service.create(actor, input);
    refresh(input.section);
    return { ok: true, data: category };
  } catch (error) {
    return failure(error);
  }
}

export async function updateCategoryAction(
  section: ContentSection,
  input: UpdateCategoryInput,
): Promise<CategoryActionResult<ContentCategory>> {
  const actor = await requireCmsMember(cmsSectionPath(section));
  try {
    const category = await service.update(actor, input);
    refresh(section);
    return { ok: true, data: category };
  } catch (error) {
    return failure(error);
  }
}

export async function renameCategoryAction(
  section: ContentSection,
  input: { id: string; expectedLockVersion: number; slug: string },
): Promise<CategoryActionResult<ContentCategory & { redirects: string[] }>> {
  const actor = await requireCmsMember(cmsSectionPath(section));
  try {
    const category = await service.rename(actor, input);
    refresh(section);
    return { ok: true, data: category };
  } catch (error) {
    return failure(error);
  }
}

export async function retireCategoryAction(
  section: ContentSection,
  input: { id: string; expectedLockVersion: number },
): Promise<CategoryActionResult<{ id: string }>> {
  const actor = await requireCmsMember(cmsSectionPath(section));
  try {
    await service.retire(actor, input);
    refresh(section);
    return { ok: true, data: { id: input.id } };
  } catch (error) {
    return failure(error);
  }
}

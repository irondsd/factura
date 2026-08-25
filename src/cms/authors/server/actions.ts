"use server";

import { revalidatePath } from "next/cache";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import type { Diagnostic } from "@/content-system/types";
import type { ContentAuthor } from "@/content-system/authors/types";
import {
  CmsAuthorNameTakenError,
  CmsAuthorSlugTakenError,
  CmsForbiddenError,
  CmsNotFoundError,
  CmsValidationError,
} from "@/cms/server/errors";
import {
  cmsAuthorService as service,
  type AuthorInput,
  type ContentAuthorWithUsage,
  type UpdateAuthorInput,
} from "./service";

// The browser's entry points, mirroring `../../categories/server/actions.ts`.
// Thin by design: resolve the actor, call the service, turn its typed errors
// into a result the manager can render. No rule is decided here.

export type AuthorActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      kind: "invalid" | "forbidden" | "not_found" | "name_taken" | "slug_taken";
      message: string;
      diagnostics?: Diagnostic[];
    };

function failure(error: unknown): AuthorActionResult<never> {
  if (error instanceof CmsValidationError) {
    return {
      ok: false,
      kind: "invalid",
      message: error.message,
      diagnostics: error.diagnostics,
    };
  }
  if (error instanceof CmsAuthorNameTakenError) {
    return { ok: false, kind: "name_taken", message: error.message };
  }
  if (error instanceof CmsAuthorSlugTakenError) {
    return { ok: false, kind: "slug_taken", message: error.message };
  }
  if (error instanceof CmsForbiddenError) {
    return { ok: false, kind: "forbidden", message: error.message };
  }
  if (error instanceof CmsNotFoundError) {
    return { ok: false, kind: "not_found", message: error.message };
  }
  throw error;
}

// Authors are managed from the CMS home, so that is the screen whose server
// render goes stale when one changes.
const refresh = () => revalidatePath("/cms");

export async function listAuthorsAction(): Promise<ContentAuthorWithUsage[]> {
  // The membership check is the whole point of the call — the service takes no
  // actor for reads, so this is what stops a non-member from reading the list.
  await requireCmsMember("/cms");
  return service.list();
}

export async function createAuthorAction(
  input: AuthorInput,
): Promise<AuthorActionResult<ContentAuthor>> {
  const actor = await requireCmsMember("/cms");
  try {
    const author = await service.create(actor, input);
    refresh();
    return { ok: true, data: author };
  } catch (error) {
    return failure(error);
  }
}

export async function updateAuthorAction(
  input: UpdateAuthorInput,
): Promise<AuthorActionResult<ContentAuthor>> {
  const actor = await requireCmsMember("/cms");
  try {
    const author = await service.update(actor, input);
    refresh();
    return { ok: true, data: author };
  } catch (error) {
    return failure(error);
  }
}

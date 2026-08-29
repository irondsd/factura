"use server";
import { revalidatePath } from "next/cache";
import type { ContentLocation, ContentLocationWithUsage } from "@/content-system/locations/types";
import type { Diagnostic } from "@/content-system/types";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { CmsForbiddenError, CmsLocationConflictError, CmsLocationInUseError, CmsLocationSlugTakenError, CmsNotFoundError, CmsValidationError } from "@/cms/server/errors";
import { cmsLocationService as service, type CreateLocationInput, type UpdateLocationInput } from "./service";

export type LocationActionResult<T> = { ok: true; data: T } | { ok: false; kind: "conflict" | "invalid" | "forbidden" | "not_found" | "slug_taken" | "in_use"; message: string; diagnostics?: Diagnostic[]; usage?: { id: string; section: string; slug: string; title: string; status: string }[]; actualLockVersion?: number | null };
function failure(error: unknown): LocationActionResult<never> {
  if (error instanceof CmsLocationConflictError) return { ok: false, kind: "conflict", message: error.message, actualLockVersion: error.actualLockVersion };
  if (error instanceof CmsValidationError) return { ok: false, kind: "invalid", message: error.message, diagnostics: error.diagnostics };
  if (error instanceof CmsLocationSlugTakenError) return { ok: false, kind: "slug_taken", message: error.message };
  if (error instanceof CmsLocationInUseError) return { ok: false, kind: "in_use", message: error.message, usage: error.usage };
  if (error instanceof CmsForbiddenError) return { ok: false, kind: "forbidden", message: error.message };
  if (error instanceof CmsNotFoundError) return { ok: false, kind: "not_found", message: error.message };
  throw error;
}
const refresh = () => revalidatePath("/cms");
export async function listLocationsAction(): Promise<ContentLocationWithUsage[]> { const actor = await requireCmsMember("/cms"); return service.list(actor); }
export async function createLocationAction(input: CreateLocationInput): Promise<LocationActionResult<ContentLocation>> { const actor = await requireCmsMember("/cms"); try { const data = await service.create(actor, input); refresh(); return { ok: true, data }; } catch (error) { return failure(error); } }
export async function updateLocationAction(input: UpdateLocationInput): Promise<LocationActionResult<ContentLocation>> { const actor = await requireCmsMember("/cms"); try { const data = await service.update(actor, input); refresh(); return { ok: true, data }; } catch (error) { return failure(error); } }
export async function renameLocationAction(input: { id: string; expectedLockVersion: number; slug: string }): Promise<LocationActionResult<ContentLocation & { redirects: string[] }>> { const actor = await requireCmsMember("/cms"); try { const data = await service.rename(actor, input); refresh(); return { ok: true, data }; } catch (error) { return failure(error); } }
export async function retireLocationAction(input: { id: string; expectedLockVersion: number }): Promise<LocationActionResult<{ id: string }>> { const actor = await requireCmsMember("/cms"); try { await service.retire(actor, input); refresh(); return { ok: true, data: { id: input.id } }; } catch (error) { return failure(error); } }

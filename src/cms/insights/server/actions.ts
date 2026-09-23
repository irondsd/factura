"use server";

import { revalidatePath } from "next/cache";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import type { ContentInsight } from "@/content-system/insights/types";
import {
  CmsForbiddenError,
  CmsNotFoundError,
  CmsValidationError,
} from "@/cms/server/errors";
import { cmsInsightService as service, type InsightInput } from "./service";

// The browser's entry points, mirroring `../../authors/server/actions.ts`: resolve
// the actor, call the service, turn its typed errors into a result the manager
// can render. No rule is decided here.

export type InsightActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      kind: "invalid" | "forbidden" | "not_found";
      message: string;
      field?: string;
    };

function failure(error: unknown): InsightActionResult<never> {
  if (error instanceof CmsValidationError) {
    const first = error.diagnostics[0];
    return {
      ok: false,
      kind: "invalid",
      message: first?.message ?? error.message,
      field: first?.field,
    };
  }
  if (error instanceof CmsForbiddenError) {
    return { ok: false, kind: "forbidden", message: error.message };
  }
  if (error instanceof CmsNotFoundError) {
    return {
      ok: false,
      kind: "not_found",
      message: "Ese destacado ya no existe. Recarga la página.",
    };
  }
  throw error;
}

const PATH = "/cms/insights";
const refresh = () => revalidatePath(PATH);

export async function listInsightsAction(): Promise<ContentInsight[]> {
  await requireCmsMember(PATH);
  return service.list();
}

export async function createInsightAction(
  input: InsightInput,
): Promise<InsightActionResult<ContentInsight>> {
  const actor = await requireCmsMember(PATH);
  try {
    const insight = await service.create(actor, input);
    refresh();
    return { ok: true, data: insight };
  } catch (error) {
    return failure(error);
  }
}

export async function updateInsightAction(
  id: string,
  input: InsightInput,
): Promise<InsightActionResult<ContentInsight>> {
  const actor = await requireCmsMember(PATH);
  try {
    const insight = await service.update(actor, id, input);
    refresh();
    return { ok: true, data: insight };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteInsightAction(
  id: string,
): Promise<InsightActionResult<null>> {
  const actor = await requireCmsMember(PATH);
  try {
    await service.delete(actor, id);
    refresh();
    return { ok: true, data: null };
  } catch (error) {
    return failure(error);
  }
}

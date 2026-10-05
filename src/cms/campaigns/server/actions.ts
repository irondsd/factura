"use server";

import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { CampaignDeliveryError } from "@/server/email";
import {
  CampaignValidationError,
  type CampaignErrors,
  type CampaignInput,
} from "../validation";
import type { CampaignPreview } from "./service";
import { cmsCampaignService } from "./store";

export type CampaignResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; errors?: CampaignErrors };
function failure(error: unknown): CampaignResult<never> {
  if (error instanceof CampaignValidationError)
    return { ok: false, message: error.message, errors: error.errors };
  if (error instanceof CampaignDeliveryError)
    return { ok: false, message: error.message };
  console.error("[campaign] operation failed", error);
  return {
    ok: false,
    message: "No se pudo completar la operación. Vuelve a intentarlo.",
  };
}

export async function previewCampaignAction(
  input: CampaignInput,
): Promise<CampaignResult<CampaignPreview>> {
  const actor = await requireCmsMember("/cms/campaigns");
  try {
    return { ok: true, data: await cmsCampaignService.preview(actor, input) };
  } catch (error) {
    return failure(error);
  }
}

export async function sendCampaignAction(
  input: CampaignInput,
  requestId: string,
): Promise<CampaignResult<{ count: number }>> {
  const actor = await requireCmsMember("/cms/campaigns");
  try {
    return {
      ok: true,
      data: await cmsCampaignService.send(actor, input, requestId),
    };
  } catch (error) {
    return failure(error);
  }
}

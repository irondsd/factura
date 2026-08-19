"use server";

import { revalidatePath } from "next/cache";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { canManageTokens } from "@/cms/auth/policy";
import {
  createCmsToken,
  listCmsTokens,
  revokeCmsToken,
  type CmsScope,
} from "@/cms/mcp/tokens";

async function admin() {
  const actor = await requireCmsMember("/cms/tokens");
  if (!canManageTokens(actor)) throw new Error("No autorizado.");
  return actor;
}

export async function cmsTokensAction() {
  return listCmsTokens((await admin()).userId);
}
export async function createCmsTokenAction(input: {
  name: string;
  scopes: CmsScope[];
  expiresInDays: number | null;
}) {
  const actor = await admin();
  const result = await createCmsToken({
    userId: actor.userId,
    name: input.name.trim(),
    scopes: input.scopes,
    expiresAt:
      input.expiresInDays === null
        ? null
        : new Date(Date.now() + input.expiresInDays * 86400000),
  });
  revalidatePath("/cms/tokens");
  return result;
}
export async function revokeCmsTokenAction(id: string) {
  const actor = await admin();
  const revoked = await revokeCmsToken({ id, userId: actor.userId });
  revalidatePath("/cms/tokens");
  return revoked;
}

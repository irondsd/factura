"use server";

import { revalidatePath } from "next/cache";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import {
  CmsForbiddenError,
  CmsNotFoundError,
  CmsValidationError,
} from "@/cms/server/errors";
import type { CmsTask, TaskStatus, TaskTag } from "../types";
import { cmsTaskService } from "./service";

export type TaskActionResult =
  | { ok: true; data: CmsTask }
  | { ok: false; message: string };

function failure(error: unknown): TaskActionResult {
  if (error instanceof CmsValidationError) {
    return {
      ok: false,
      message: error.diagnostics.map((item) => item.message).join(" "),
    };
  }
  if (error instanceof CmsForbiddenError || error instanceof CmsNotFoundError) {
    return { ok: false, message: error.message };
  }
  throw error;
}

function refresh() {
  revalidatePath("/cms/tasks");
  revalidatePath("/cms/tasks/archive");
  revalidatePath("/cms/tasks/[id]", "page");
}

export async function createTaskAction(input: {
  title: string;
  description?: string;
  tags?: TaskTag[];
}): Promise<TaskActionResult> {
  const actor = await requireCmsMember("/cms/tasks");
  try {
    const data = await cmsTaskService.create(actor, input);
    refresh();
    return { ok: true, data };
  } catch (error) {
    return failure(error);
  }
}

export async function updateTaskAction(input: {
  id: string;
  patch: { title?: string; description?: string; tags?: TaskTag[] };
}): Promise<TaskActionResult> {
  const actor = await requireCmsMember("/cms/tasks");
  try {
    const data = await cmsTaskService.update(actor, input);
    refresh();
    return { ok: true, data };
  } catch (error) {
    return failure(error);
  }
}

export async function moveTaskAction(input: {
  id: string;
  status: TaskStatus;
  beforeId?: string | null;
  completionNote?: string;
}): Promise<TaskActionResult> {
  const actor = await requireCmsMember("/cms/tasks");
  try {
    const data = await cmsTaskService.move(actor, input);
    refresh();
    return { ok: true, data };
  } catch (error) {
    return failure(error);
  }
}

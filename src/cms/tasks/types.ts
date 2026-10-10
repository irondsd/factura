export const TASK_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "done",
  "dismissed",
] as const;

export const TASK_TAGS = ["content", "dev", "research"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskTag = (typeof TASK_TAGS)[number];

/** The stable API representation of a shared CMS task. The reference is
 * derived from `number`, so it cannot drift from the database identity. */
export type CmsTask = {
  id: string;
  number: number;
  reference: string;
  title: string;
  description: string;
  tags: TaskTag[];
  status: TaskStatus;
  position: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CmsTaskSummary = Omit<CmsTask, "description"> & {
  descriptionPreview: string;
};

export type TaskView = "board" | "archive" | "dismissed" | "all";

export type ListTasksInput = {
  view?: TaskView;
  statuses?: TaskStatus[];
  search?: string;
  tags?: TaskTag[];
  limit?: number;
  offset?: number;
};

export type CreateTaskInput = {
  title: string;
  description?: string;
  tags?: TaskTag[];
};

export type UpdateTaskInput = {
  id: string;
  patch: {
    title?: string;
    description?: string;
    tags?: TaskTag[];
  };
};

export type MoveTaskInput = {
  id: string;
  status: TaskStatus;
  beforeId?: string | null;
  completionNote?: string;
};

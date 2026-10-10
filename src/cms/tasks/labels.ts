import type { TaskStatus, TaskTag } from "./types";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "Por hacer",
  in_progress: "En curso",
  done: "Hecho",
  dismissed: "Descartado",
};
export const TAG_LABELS: Record<TaskTag, string> = {
  content: "Contenido",
  dev: "Desarrollo",
  research: "Investigación",
};
export const BOARD_STATUSES: TaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "done",
];

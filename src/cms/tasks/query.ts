import { TASK_TAGS, type TaskTag } from "./types";

export type TaskSearchParams = Record<string, string | string[] | undefined>;

/** The board and archive filter in the browser; the URL only seeds them, so a
 * reload or a shared link opens on the same search. */
export function taskFilters(params: TaskSearchParams): {
  search: string;
  tag: TaskTag | undefined;
} {
  const search = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  const tag = TASK_TAGS.find((value) => value === params.tag);
  return { search, tag };
}

/** Where a task's detail page was opened from, for its back link. */
export type TaskOrigin = "board" | "archive" | "dismissed";

export function taskOrigin(params: TaskSearchParams): TaskOrigin {
  return params.from === "archive" || params.from === "dismissed"
    ? params.from
    : "board";
}

export function taskHref(reference: string, from: TaskOrigin = "board") {
  return from === "board"
    ? `/cms/tasks/${reference}`
    : `/cms/tasks/${reference}?from=${from}`;
}

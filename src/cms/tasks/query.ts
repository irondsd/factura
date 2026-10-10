import { TASK_TAGS } from "./types";

export type TaskSearchParams = Record<string, string | string[] | undefined>;
export function taskFilters(params: TaskSearchParams) {
  const search =
    typeof params.q === "string" ? params.q.trim().slice(0, 200) : "";
  const tag = TASK_TAGS.find((value) => value === params.tag);
  const raw = typeof params.page === "string" ? params.page : "1";
  const page = /^\d{1,6}$/.test(raw) ? Math.max(1, Number(raw)) : 1;
  return { search, tag, page };
}

export function taskListHref(
  path: string,
  filters: { search: string; tag?: string; page: number; dismissed?: boolean },
) {
  const query = new URLSearchParams();
  if (filters.search) query.set("q", filters.search);
  if (filters.tag) query.set("tag", filters.tag);
  if (filters.page > 1) query.set("page", String(filters.page));
  if (filters.dismissed) query.set("view", "dismissed");
  return query.size ? `${path}?${query}` : path;
}

import type { TaskStatus, TaskTag } from "./types";

/** Done tasks stay on the board this long, then move to the archive. */
export const ARCHIVE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_ZONE = "America/Argentina/Buenos_Aires";
const MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/** Swatch classes per tag. Spelled out whole so Tailwind sees every class. */
export const TAG_SWATCH: Record<TaskTag, { fill: string; border: string }> = {
  content: { fill: "bg-ink", border: "border-ink" },
  dev: { fill: "bg-accent", border: "border-accent" },
  research: { fill: "bg-ok", border: "border-ok" },
};

/** The rule over each board column: quiet for the backlog, louder as work
 * gets closer to finished. */
export const COLUMN_RULE: Record<TaskStatus, string> = {
  backlog: "border-t-line",
  todo: "border-t-muted",
  in_progress: "border-t-accent",
  done: "border-t-ok",
  dismissed: "border-t-line",
};

/** «7 oct», on the Buenos Aires calendar wherever the code runs. */
export function shortDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "numeric",
  }).formatToParts(new Date(iso));
  const day = parts.find((part) => part.type === "day")?.value;
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return `${day} ${MONTHS[month - 1]}`;
}

/** «hoy», «ayer», «hace 4 d», and a date once it is a month old. */
export function relativeAge(iso: string, now: string): string {
  const days = Math.floor((Date.parse(now) - Date.parse(iso)) / DAY_MS);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} d`;
  return shortDate(iso);
}

/** Off the board: dismissed, or done for longer than the archive window. The
 * same rule the store's board view applies in SQL. */
export function isArchived(
  task: { status: TaskStatus; completedAt: string | null },
  now: string,
): boolean {
  if (task.status === "dismissed") return true;
  return (
    task.status === "done" &&
    task.completedAt !== null &&
    Date.parse(task.completedAt) <= Date.parse(now) - ARCHIVE_AGE_MS
  );
}

/** The board and archive search: a title substring, or an exact reference
 * («42», «task-42», «TASK-42»). */
export function matchesTask(
  task: { title: string; number: number; tags: TaskTag[] },
  search: string,
  tag: TaskTag | undefined,
): boolean {
  if (tag && !task.tags.includes(tag)) return false;
  const query = search.trim().toLowerCase();
  if (!query) return true;
  const number = query.replace(/^task-?/, "");
  return (
    task.title.toLowerCase().includes(query) ||
    (/^\d+$/.test(number) && String(task.number) === number)
  );
}

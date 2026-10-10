// Screenshots pasted into a task description. Shared by the upload route and
// the editor, so the two agree on the limits and on what a task image's
// address looks like. Pure: no S3, no sharp.
//
// They live in the CMS media bucket — the one that is publicly readable — but
// under their own top-level prefix, never under `cms-media/`: the media
// reconciliation lists that prefix against the `cms_media` table and would
// report every task image as an orphan. Nothing tracks them in the database
// and nothing deletes them; the description is the only reference.

export const TASK_IMAGE_PREFIX = "cms-tasks";

/** On the file as pasted, before conversion. These are examples of a detail,
 * not full-page captures. */
export const MAX_TASK_IMAGE_BYTES = 2 * 1024 * 1024;

/** Wider images are scaled down to this; narrower ones keep their size. */
export const MAX_TASK_IMAGE_WIDTH = 1940;

/** What the editor offers to upload. The server decides from the bytes, not
 * from this list. */
export const TASK_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

export const isTaskImageType = (type: string): boolean =>
  (TASK_IMAGE_TYPES as readonly string[]).includes(type);

export const TASK_IMAGE_ENDPOINT = "/api/cms/tasks/images";

/** The stored key. The dimensions ride in the name so the editor can reserve
 * the image's space before it loads — there is no row to read them from. */
export function taskImageKey(id: string, width: number, height: number) {
  return `${TASK_IMAGE_PREFIX}/${id}-${width}x${height}.webp`;
}

const KEY_PATTERN = new RegExp(
  `^${TASK_IMAGE_PREFIX}/[0-9a-f-]{36}-(\\d{1,5})x(\\d{1,5})\\.webp$`,
);

/** The dimensions of a task image at `url`, or null when `url` is not one of
 * ours. Only images under our own media origin are drawn: a description must
 * never load a third-party pixel just by being opened. */
export function parseTaskImageUrl(
  url: string,
  origin: string,
): { width: number; height: number } | null {
  if (!origin || !url.startsWith(`${origin}/`)) return null;
  const match = KEY_PATTERN.exec(url.slice(origin.length + 1));
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** What the editor writes at the cursor while an image uploads. */
export const uploadPlaceholder = (token: string) =>
  `![Subiendo imagen…](subiendo-${token})`;

/** Whether `description` still has an upload in flight. Saving then would
 * store the placeholder instead of the image, so the forms wait for it. */
export const hasPendingUpload = (description: string): boolean =>
  /!\[Subiendo imagen…\]\(subiendo-[a-z0-9]+\)/.test(description);

export function formatImageBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

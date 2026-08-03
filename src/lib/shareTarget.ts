/** The page half of the Android share-target flow. The service worker parks
 * shared PDFs in the Cache API and sends the app to `/app?share=<id>`; this is
 * how the page gets them back out.
 *
 * The three constants are mirrored in public/sw.js, which is served raw and so
 * can't import them. Keep both sides in sync. */

export const SHARE_CACHE = "factura-share-target";
export const SHARE_PREFIX = "/__shared/";

/** Query param carrying the share id onto /app. */
export const SHARE_PARAM = "share";

/** Take the files a share left behind, clearing them as we go — a share is
 * consumed once. Returns `[]` when there's nothing under the id: an already
 * consumed share, or the `failed` sentinel the worker (or the route-handler
 * fallback) uses when it couldn't stash anything. */
export async function takeSharedFiles(id: string): Promise<File[]> {
  if (typeof caches === "undefined") return [];

  const cache = await caches.open(SHARE_CACHE);
  const prefix = new URL(
    `${SHARE_PREFIX}${id}/`,
    window.location.origin,
  ).toString();
  const keys = (await cache.keys())
    .filter((request) => request.url.startsWith(prefix))
    // The worker numbers the entries; restore the order the user shared in.
    .sort((a, b) => indexOfKey(a.url) - indexOfKey(b.url));

  const files: File[] = [];
  for (const key of keys) {
    const stored = await cache.match(key);
    if (!stored) continue;
    const blob = await stored.blob();
    files.push(
      new File([blob], fileNameOfKey(key.url), {
        type: blob.type || "application/pdf",
      }),
    );
  }
  await Promise.all(keys.map((key) => cache.delete(key)));

  return files;
}

/** `/__shared/<id>/<index>/<name>` → index, for ordering. */
function indexOfKey(url: string): number {
  const index = Number(url.split("/").at(-2));
  return Number.isFinite(index) ? index : 0;
}

/** `/__shared/<id>/<index>/<name>` → the original file name. */
function fileNameOfKey(url: string): string {
  const encoded = url.split("/").at(-1) ?? "";
  try {
    return decodeURIComponent(encoded) || "shared.pdf";
  } catch {
    // A name that survived encodeURIComponent can't fail to decode, but the
    // ingest pipeline keys toasts off the file name — never let it be empty.
    return "shared.pdf";
  }
}

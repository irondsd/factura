/* Factura's only service worker. It exists for exactly one job: catching the
 * PDFs Android shares into the installed app (see `share_target` in
 * src/app/manifest.ts). There is no offline caching here — every request other
 * than the share POST is left alone for the network to handle as usual.
 *
 * Why a service worker at all: the share arrives as a POST navigation from
 * outside the origin, and the session cookie is SameSite=Lax, so it isn't sent
 * with the request. A route handler would therefore see an anonymous upload.
 * Handling the POST here means it never leaves the device: the files are parked
 * in the Cache API and the app is sent to a plain GET, which does carry the
 * session — from there the normal in-app upload path takes over.
 *
 * This file is served raw from /public, so it can't import anything. The three
 * constants below are mirrored in src/lib/shareTarget.ts; keep them in sync. */

const SHARE_CACHE = "factura-share-target";
const SHARE_PREFIX = "/__shared/";
const SHARE_ACTION = "/share-target";

self.addEventListener("install", () => {
  // Nothing to precache, so there's no reason to sit in "waiting": take over
  // right away and let the very next share be intercepted.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Deliberately narrow: anything that isn't the share POST goes to the
  // network untouched, exactly as it did before this worker existed.
  if (request.method !== "POST") return;
  if (new URL(request.url).pathname !== SHARE_ACTION) return;
  event.respondWith(receiveShare(request));
});

async function receiveShare(request) {
  // An id the page can't confuse with a real share: when it finds nothing under
  // this one it tells the user the share didn't come through.
  let shareId = "failed";
  try {
    const form = await request.formData();
    const files = form
      .getAll("file")
      .filter((file) => file instanceof File && file.size > 0);
    if (files.length > 0) {
      const cache = await caches.open(SHARE_CACHE);
      // One share at a time. The page deletes what it consumes, so anything
      // still here belongs to a share the user abandoned — a new share
      // supersedes it rather than letting the cache grow forever.
      for (const stale of await cache.keys()) await cache.delete(stale);
      shareId = crypto.randomUUID();
      await Promise.all(
        files.map((file, index) =>
          cache.put(
            `${SHARE_PREFIX}${shareId}/${index}/${encodeURIComponent(file.name)}`,
            new Response(file, {
              headers: {
                "content-type": file.type || "application/pdf",
              },
            }),
          ),
        ),
      );
    }
  } catch (err) {
    // Falls through to the "failed" id: the app opens and asks for a retry,
    // which beats Android showing a bare error page.
    console.error("[sw] share target failed:", err);
  }

  // 303 turns the share POST into a GET navigation — the whole reason this is
  // handled in the worker instead of on the server.
  return Response.redirect(
    new URL(`/app?share=${shareId}`, self.location.origin),
    303,
  );
}

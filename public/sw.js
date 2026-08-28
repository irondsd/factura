/* Retirement worker for the former monolith PWA.
 *
 * Keep this URL available and uncached while installed copies of the old site
 * discover the update. Once activated it removes the private share cache and
 * unregisters itself; it never intercepts a request. The app origin owns the
 * active PWA and share-target worker now. */

const LEGACY_SHARE_CACHE = "factura-share-target";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.delete(LEGACY_SHARE_CACHE),
      self.registration.unregister(),
    ]),
  );
});

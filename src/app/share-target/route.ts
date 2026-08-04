/** Fallback for the manifest's share_target POST, for the window where the
 * service worker that normally handles it (public/sw.js) isn't controlling the
 * page yet — a first launch straight from the share sheet, or a worker the
 * browser evicted.
 *
 * It can't do anything with the file: this POST is a cross-site navigation, so
 * the SameSite=Lax session cookie isn't sent and there's no user to file the
 * bill under. Note what's missing — the body is never read, so the upload is
 * dropped on the floor rather than parked anywhere, which is the same promise
 * the worker keeps for a signed-out share. What this can do is not leave the
 * user staring at a 405: the redirect opens the app, which registers the worker
 * on the way in (and bounces to /login if the session is gone), so sharing
 * again works. */
export function POST(request: Request) {
  return Response.redirect(new URL("/app?share=failed", request.url), 303);
}

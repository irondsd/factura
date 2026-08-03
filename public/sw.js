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
 * Nothing is written for a signed-out share. The worker asks Auth.js who the
 * user is first (that fetch is same-origin, so the cookie rides along) and, if
 * the answer is nobody, refuses the share and sends them to /login without ever
 * reading the body — a bill it can't file under an account has no business
 * sitting on the device.
 *
 * This file is served raw from /public, so it can't import anything. The
 * constants below are mirrored in src/lib/shareTarget.ts; keep them in sync. */

const SHARE_CACHE = "factura-share-target";
const SHARE_PREFIX = "/__shared/";
const SHARE_ACTION = "/share-target";
const SHARE_DENIED = "denied";
// Auth.js exposes the current session here. The share POST can't carry the
// cookie, but a fetch the worker makes itself is same-origin and does.
const SESSION_ENDPOINT = "/api/auth/session";

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

/** Is there a live session on this device? `null` when the question can't be
 * answered at all (offline, endpoint down) — that's not a "yes", so nothing
 * gets written either way, but it's not grounds for shoving someone at a login
 * screen they may not need. */
async function hasSession() {
  try {
    const res = await fetch(SESSION_ENDPOINT, {
      credentials: "include",
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const session = await res.json();
    return Boolean(session && session.user);
  } catch (err) {
    console.warn("[sw] could not check the session:", err);
    return null;
  }
}

async function receiveShare(request) {
  // Settle who this is *before* touching the body. A bill is a private
  // document, so a share that arrives without a session is refused outright:
  // the file is never written to the device, and there's nothing left behind
  // for the next person to sign in on this browser. The user signs in and
  // shares again — the POST body is not worth persisting to save them a step.
  const signedIn = await hasSession();
  if (signedIn === false) {
    // Also a good moment to drop anything an earlier share abandoned: with no
    // session there is nobody those files can still belong to. Only on a
    // definite "no" — an unanswerable check is not grounds for deleting a
    // share that may yet be consumed.
    await clearShares();
    return seeOther(`/login?share=${SHARE_DENIED}`);
  }
  if (signedIn === null) return seeOther("/app?share=failed");

  // An id the page can't confuse with a real share: when it finds nothing under
  // this one it tells the user the share didn't come through.
  let shareId = "failed";
  try {
    const form = await request.formData();
    const files = form
      .getAll("file")
      .filter((file) => file instanceof File && file.size > 0);
    if (files.length > 0) {
      // One share at a time. The page deletes what it consumes, so anything
      // still here belongs to a share the user abandoned — a new share
      // supersedes it rather than letting the cache grow forever.
      await clearShares();
      const cache = await caches.open(SHARE_CACHE);
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

  return seeOther(`/app?share=${shareId}`);
}

/** Empty the share cache. Best-effort: failing to tidy up is never a reason to
 * fail the share itself. */
async function clearShares() {
  try {
    const cache = await caches.open(SHARE_CACHE);
    for (const stale of await cache.keys()) await cache.delete(stale);
  } catch (err) {
    console.warn("[sw] could not clear the share cache:", err);
  }
}

/** 303 turns the share POST into a GET navigation — the whole reason this is
 * handled in the worker instead of on the server. */
function seeOther(path) {
  return Response.redirect(new URL(path, self.location.origin), 303);
}

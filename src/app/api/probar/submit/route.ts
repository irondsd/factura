import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { and, count, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { billSubmissions } from "@/db/schema";
import {
  PUBLIC_MAX_BYTES,
  PUBLIC_MAX_PAGES,
  PUBLIC_SUBMISSIONS_PER_IP_PER_DAY,
} from "@/lib/limits";
import { type SubmitResponse, TEXT_PREVIEW_CHARS } from "@/lib/probar";
import { toLocale } from "@/i18n/config";
import { normalize } from "@/parsers/normalize";
import { RAW_TEXT_MAX } from "@/server/ownership";
import { extractPdfDocument } from "@/server/pdf";
import { probarOptions, withProbarCors } from "@/server/probarCors";
import {
  clientIp,
  hashIp,
  limitKey,
  PROBAR_SUBMIT,
  take,
} from "@/server/rateLimit";
import { isStorageConfigured, putSubmissionObject } from "@/server/storage";
import {
  evictableCookieNames,
  mintTicket,
  submissionCookieName,
  submissionCookieValue,
  SUBMISSION_COOKIE_MAX_AGE,
} from "@/server/submissions";

// Public, unauthenticated upload. pdf.js needs Node APIs and extraction is
// CPU/memory heavy, so this stays off the edge with room past the default
// serverless timeout — same as the authenticated ingest route.
export const runtime = "nodejs";
export const maxDuration = 60;

/** Below this, a PDF is a scan or a photo: readable as a document, but with no
 * text layer for any parser to work on. Matches the ingest route's threshold. */
const MIN_TEXT_CHARS = 20;

function tooMany(retryAfterSec: number) {
  return Response.json(
    { error: "Too many requests", retryAfterSec },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}

/** One file → one submission row. Upload, extract, store; parsing happens in
 * the follow-up /api/probar/parse calls so the browser can show the tier
 * cascade stepping. Nothing here writes a bill: a submission only becomes one
 * when its visitor signs in and claims it. */
async function handlePost(request: Request) {
  const burst = take(limitKey(request, "probar:submit"), PROBAR_SUBMIT);
  if (!burst.ok) return tooMany(burst.retryAfterSec);

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File))
    return Response.json({ error: "No file provided" }, { status: 400 });

  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return Response.json({ error: "Not a PDF" }, { status: 415 });
  if (file.size > PUBLIC_MAX_BYTES)
    return Response.json({ error: "File too large" }, { status: 413 });

  // Second limiter layer, checked only once the burst bucket has passed. The
  // in-process bucket is per-instance and dies on cold start; this count is what
  // actually survives instance churn. One indexed lookup per accepted upload.
  const ip = clientIp(request);
  const ipHash = ip ? hashIp(ip) : null;
  if (ipHash) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ n }] = await db
      .select({ n: count() })
      .from(billSubmissions)
      .where(
        and(
          eq(billSubmissions.ipHash, ipHash),
          gt(billSubmissions.createdAt, since),
        ),
      );
    if (n >= PUBLIC_SUBMISSIONS_PER_IP_PER_DAY) return tooMany(3600);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  let extracted;
  try {
    extracted = await extractPdfDocument(bytes, { maxPages: PUBLIC_MAX_PAGES });
  } catch {
    return Response.json({ error: "Could not read PDF" }, { status: 422 });
  }

  // Cap what we keep at the same ceiling every authenticated rawText path
  // enforces, so an enormous document can't push an outsized row into the table.
  const rawText = extracted.text.slice(0, RAW_TEXT_MAX);
  const truncated = extracted.truncated || extracted.text.length > RAW_TEXT_MAX;

  const field = (name: string): string | null => {
    const value = form.get(name);
    return typeof value === "string" ? value : null;
  };

  // The checkbox is checked by default, so anything other than an explicit
  // opt-out means keep.
  const keepFile = field("keepFile") !== "false";
  const notifyEmailRaw = field("notifyEmail");
  const notifyEmail = notifyEmailRaw?.includes("@")
    ? notifyEmailRaw.trim().slice(0, 255)
    : null;

  const noText = rawText.trim().length < MIN_TEXT_CHARS;

  // Insert before uploading, so a storage outage costs us the original but never
  // the extracted text — the same storage-optional posture as the ingest route.
  const [row] = await db
    .insert(billSubmissions)
    .values({
      // Placeholder: the real hash needs the row's generated id, so it's written
      // in the update below. Never a usable secret — sha256 of a random 24-byte
      // value has no preimage anyone can present.
      secretHash: createHash("sha256").update("unset").digest("hex"),
      fileName: file.name.slice(-200),
      fileBytes: file.size,
      pageCount: extracted.pageCount,
      keepFile,
      rawText,
      textHash: createHash("sha256").update(rawText).digest("hex"),
      outcome: noText ? "no_text" : "pending",
      notifyEmail,
      ipHash,
      userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
      locale: toLocale(field("locale")),
    })
    .returning();

  const { ticket, secretHash } = mintTicket(row.id);

  let storageKey: string | null = null;
  if (isStorageConfigured()) {
    try {
      storageKey = await putSubmissionObject(row.id, file.name, bytes);
    } catch (err) {
      console.warn(`PDF storage upload failed for ${file.name}:`, err);
    }
  }

  await db
    .update(billSubmissions)
    .set({ secretHash, storageKey })
    .where(eq(billSubmissions.id, row.id));

  // This ticket gets its OWN cookie. A drop uploads several files at once, and
  // rewriting one shared cookie from a value read at request time meant the
  // last response to land won and the other files lost their ticket — see the
  // note in @/server/submissions.
  const jar = await cookies();
  const name = submissionCookieName(row.id);
  const value = submissionCookieValue(ticket.secret, Date.now());
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax is doing real work beyond privacy: it's what makes the authenticated
    // /api/probar/claim CSRF-proof, since a cross-site POST carries neither this
    // cookie nor the Auth.js session cookie.
    sameSite: "lax" as const,
    path: "/",
    maxAge: SUBMISSION_COOKIE_MAX_AGE,
  };
  jar.set(name, value, options);

  // Trim the tail so the jar can't grow without bound. Counting the cookie just
  // set, since it isn't in `getAll()` yet. Concurrency-safe: parallel submits
  // pick the same already-old ids and neither can drop the other's new ticket.
  for (const stale of evictableCookieNames([...jar.getAll(), { name, value }]))
    // `path` must match the cookie being cleared, or the browser scopes the
    // expiry to /api/probar/submit and the original survives untouched.
    jar.delete({ name: stale, path: "/" });

  // Analytics for /probar is captured in the browser, not here. A visitor is
  // anonymous at this point, and the only identity that survives their later
  // sign-in is posthog-js's own distinct_id (which `identify` merges into the
  // account). Keying a server event by submission id would mint a fresh
  // "person" per upload and make every funnel unjoinable. `bill_submissions`
  // is the ground truth for counting uploads; PostHog is for the journey.

  const body: SubmitResponse = noText
    ? {
        submissionId: row.id,
        outcome: "no_text",
        pageCount: extracted.pageCount,
      }
    : {
        submissionId: row.id,
        outcome: "pending",
        pageCount: extracted.pageCount,
        truncated,
        charCount: rawText.length,
        textPreview: normalize(rawText).slice(0, TEXT_PREVIEW_CHARS),
      };
  return Response.json(body);
}

export const POST = withProbarCors(handlePost);
export const OPTIONS = probarOptions();

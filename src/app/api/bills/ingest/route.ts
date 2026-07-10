import { after } from "next/server";
import { db } from "@/db";
import { getPostHogClient } from "@/lib/posthog-server";
import { auth } from "@/server/auth";
import { ingestBill } from "@/server/ingest";
import { extractPdfText } from "@/server/pdf";
import { isStorageConfigured, putObject } from "@/server/storage";

// pdf.js + the aws-sdk need Node APIs, and extraction is CPU/memory heavy — keep
// this off the edge and give it room beyond the default serverless timeout.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;

/** Upload → extract → (store if configured) → ingest. The file flows through the
 * server so PDF text is extracted from one pinned pdf.js (see extractPdfText) and
 * the bill lands with a pointer to the stored original. */
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File))
    return Response.json({ error: "No file provided" }, { status: 400 });

  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return Response.json({ error: "Not a PDF" }, { status: 415 });
  if (file.size > MAX_BYTES)
    return Response.json({ error: "File too large" }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());

  let rawText: string;
  try {
    rawText = await extractPdfText(bytes);
  } catch {
    return Response.json({ error: "Could not read PDF" }, { status: 422 });
  }
  if (rawText.trim().length < 20)
    return Response.json({ outcome: "no_text" as const });

  // Store the original only when storage is configured; a failed upload still
  // lets the bill land text-only, matching the app's storage-optional behavior.
  let storageKey: string | undefined;
  if (isStorageConfigured()) {
    try {
      storageKey = await putObject(userId, file.name, bytes);
    } catch (err) {
      console.warn(`PDF storage upload failed for ${file.name}:`, err);
    }
  }

  const result = await ingestBill(db, userId, {
    fileName: file.name,
    rawText,
    storageKey,
  });

  // Analytics must never block or fail the response — the bill is already saved.
  after(async () => {
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: userId,
      event: "bill_ingested",
      properties: { outcome: result.outcome, file_name: file.name },
    });
    await posthog.shutdown();
  });

  return Response.json(result);
}

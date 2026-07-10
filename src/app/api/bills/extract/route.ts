import { auth } from "@/server/auth";
import { extractPdfText } from "@/server/pdf";

// Text-only extraction for the parser builder, so its preview sees exactly what
// ingestion will (same pinned pdf.js) — nothing is stored or ingested here.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

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
  try {
    const rawText = await extractPdfText(bytes);
    return Response.json({ rawText });
  } catch {
    return Response.json({ error: "Could not read PDF" }, { status: 422 });
  }
}

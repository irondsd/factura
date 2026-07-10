import { getDocument, type TextItem } from "pdfjs-serverless";

// Single, server-side source of truth for PDF → text. pdfjs-serverless bundles a
// current PDF.js (NFC-normalized output like "Liquidación", not the split
// "Liquidaci ó n" the older client-side extractor produced), and pinning it here
// means every stored bill and every parser preset sees the exact same extraction —
// no dependence on the uploader's browser or pdf.js version.
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const doc = await getDocument({
    // pdf.js takes ownership of this buffer and detaches it, so hand it a copy —
    // otherwise the caller's `bytes` become unusable (e.g. a later upload of the
    // same file would hit a detached ArrayBuffer).
    data: bytes.slice(),
    // Fall back to the runtime's fonts instead of fetching PDF.js's standard-font
    // data files, which don't exist in a serverless bundle.
    useSystemFonts: true,
  }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Drop marked-content markers (no `str`) — only real text items carry glyphs.
    const text = content.items
      .filter((item): item is TextItem => "str" in item)
      .map((item) => item.str)
      .join(" ");
    pages.push(text);
  }
  // Release the worker/document resources before returning.
  await doc.destroy();

  return pages.join("\n");
}

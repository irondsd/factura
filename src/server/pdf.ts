import { getDocument, type TextItem } from "pdfjs-serverless";

export type PdfExtract = {
  text: string;
  /** Pages the document declares, even when only some of them were read. */
  pageCount: number;
  /** True when `maxPages` cut the read short — the text is partial. */
  truncated: boolean;
};

// Single, server-side source of truth for PDF → text. pdfjs-serverless bundles a
// current PDF.js (NFC-normalized output like "Liquidación", not the split
// "Liquidaci ó n" the older client-side extractor produced), and pinning it here
// means every stored bill and every parser preset sees the exact same extraction —
// no dependence on the uploader's browser or pdf.js version.

/** Extract text plus page metadata, optionally capping how many pages are read.
 * The cap exists for the public drop: a 2 MB PDF can declare 50,000 pages, and
 * without a ceiling this loop awaits `getTextContent()` for every one of them —
 * the cheapest available way to exhaust an instance's memory and its whole
 * maxDuration, and far cheaper for an attacker than a catastrophic regex. */
export async function extractPdfDocument(
  bytes: Uint8Array,
  opts: { maxPages?: number } = {},
): Promise<PdfExtract> {
  const doc = await getDocument({
    // pdf.js takes ownership of this buffer and detaches it, so hand it a copy —
    // otherwise the caller's `bytes` become unusable (e.g. a later upload of the
    // same file would hit a detached ArrayBuffer).
    data: bytes.slice(),
    // Fall back to the runtime's fonts instead of fetching PDF.js's standard-font
    // data files, which don't exist in a serverless bundle.
    useSystemFonts: true,
  }).promise;

  const pageCount = doc.numPages;
  const readable = Math.min(pageCount, opts.maxPages ?? pageCount);

  const pages: string[] = [];
  for (let i = 1; i <= readable; i++) {
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

  return {
    text: pages.join("\n"),
    pageCount,
    truncated: readable < pageCount,
  };
}

/** Text only, every page. The shape the authenticated ingest/extract routes have
 * always used — an uncapped read there costs an attacker an account. */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { text } = await extractPdfDocument(bytes);
  return text;
}

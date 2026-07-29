// A minimal PDF writer, used once to generate the sample bill offered on
// /probar ("no bill handy? try a sample"). The output is committed to
// public/samples, so this code runs approximately never — which is exactly why
// it isn't a dependency. A library existing solely to produce a checked-in file
// is paid for on every install, forever, for zero runtime benefit.
//
// The repo already draws this line the same way: it hand-rolls where the surface
// is small and pinnable (the expression evaluator, the parser engine, normalize)
// and takes a dependency where the problem is genuinely hard (pdfjs-serverless
// rather than a homegrown extractor). Writing a text-only PDF is the first kind.
// What makes it safe is samplePdf.test.ts, which round-trips the committed file
// back through the real extractor and the real Edesur parser — a total
// correctness proof for the one thing this file has to do. If the sample ever
// needs to *look* like a bill (embedded fonts, columns, a logo), stop here and
// take pdf-lib instead.

/** Letter, in points. */
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 36;
const FONT_SIZE = 7;
const LEADING = 8.5;

const DEFAULT_MAX_LINE_CHARS = 120;
const DEFAULT_LINES_PER_PAGE = Math.floor((PAGE_HEIGHT - 2 * MARGIN) / LEADING);

/** Tokens that are mostly Latin Extended glyphs are 2D-barcode fonts, not text.
 * Same rule as `normalize`'s isGlyphSoup — dropping them here is provably
 * lossless, because anything this removes would be removed again before any
 * parser ever saw it. */
function isGlyphSoup(token: string): boolean {
  if (token.length < 3) return false;
  let weird = 0;
  for (const ch of token) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x0100 && cp <= 0x04ff) weird++;
  }
  return weird / token.length > 0.4;
}

const PUNCTUATION: Record<string, string> = {
  "“": '"',
  "”": '"',
  "‘": "'",
  "’": "'",
  "–": "-",
  "—": "-",
  "…": "...",
  " ": " ",
};

/** Fold a fixture into something a WinAnsi-encoded base-14 font can carry.
 *
 * Two steps: drop the barcode glyph runs, then fold smart punctuation to ASCII.
 * That second step is what removes the need for a WinAnsi encoding table at all
 * — WinAnsi differs from Latin-1 ONLY in 0x80–0x9F, which is precisely where
 * “ ” ’ – — live. With those folded, every surviving character is Latin-1 and
 * the encoding is a plain byte cast. */
export function toSamplePdfText(fixture: string): string {
  return fixture
    .split(/\s+/)
    .filter((token) => token.length > 0 && !isGlyphSoup(token))
    .join(" ")
    .replace(/[“”‘’–—… ]/g, (ch) => PUNCTUATION[ch]);
}

/** Break text into lines without ever splitting a token.
 *
 * The no-split rule is load-bearing, not cosmetic. The fixture's payment barcode
 * is 58 contiguous digits matched by a single `\d{...}` pattern; a wrapper that
 * hard-broke at a column would put a space inside it, `normalize` would preserve
 * that space, and the barcode capture would stop firing — SILENTLY, because the
 * parser's label-based fallbacks would still produce a plausible bill. So an
 * over-long token gets its own line, overflowing the page rather than the data. */
export function wrapTokens(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const token of text.split(" ")) {
    if (!token) continue;
    if (line.length === 0) {
      line = token;
    } else if (line.length + 1 + token.length <= maxChars) {
      line += ` ${token}`;
    } else {
      lines.push(line);
      line = token;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Escape the three characters that are structural inside a PDF string. */
function escapeString(text: string): string {
  return text.replace(/[\\()]/g, (ch) => `\\${ch}`);
}

/** Latin-1 bytes. Throws rather than mangling: silently substituting a character
 * would change the extracted text, which is the one thing that must survive. */
function latin1(text: string): Buffer {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp > 0xff)
      throw new Error(
        `Character U+${cp.toString(16).toUpperCase()} ("${ch}") is not encodable in WinAnsi — fold it in toSamplePdfText first`,
      );
  }
  return Buffer.from(text, "latin1");
}

function contentStream(lines: string[]): string {
  const body = lines
    .map((line, i) =>
      // `Tj` sets the first line; `'` is "next line, then show", which keeps one
      // show-text operator per line so pdf.js yields one text item per line.
      i === 0 ? `(${escapeString(line)}) Tj` : `(${escapeString(line)}) '`,
    )
    .join("\n");
  return [
    "BT",
    `/F1 ${FONT_SIZE} Tf`,
    `${LEADING} TL`,
    `${MARGIN} ${PAGE_HEIGHT - MARGIN - FONT_SIZE} Td`,
    body,
    "ET",
    "",
  ].join("\n");
}

/** Build a single-font, text-only PDF.
 *
 * One show-text operator per line means pdf.js emits one text item per line, and
 * `extractPdfText` rejoins items with " " — so after `normalize` collapses
 * whitespace, the extracted token stream is identical to the source's. That
 * equivalence is what the round-trip test asserts.
 *
 * Emits no timestamps and no /ID, so the output is byte-for-byte deterministic
 * and the committed artifact can be proven in sync with this generator. */
export function buildSamplePdf(
  text: string,
  opts: { maxLineChars?: number; linesPerPage?: number } = {},
): Uint8Array {
  const maxLineChars = opts.maxLineChars ?? DEFAULT_MAX_LINE_CHARS;
  const linesPerPage = opts.linesPerPage ?? DEFAULT_LINES_PER_PAGE;

  const allLines = wrapTokens(text, maxLineChars);
  const pages: string[][] = [];
  for (let i = 0; i < allLines.length; i += linesPerPage) {
    pages.push(allLines.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) pages.push([]);

  // Object numbering: 1 catalog, 2 page tree, 3 font, then per page a page
  // object and its content stream.
  const pageObjNum = (i: number) => 4 + i * 2;
  const contentObjNum = (i: number) => 5 + i * 2;

  const bodies: string[] = [];
  bodies.push("<< /Type /Catalog /Pages 2 0 R >>");
  bodies.push(
    `<< /Type /Pages /Kids [${pages
      .map((_, i) => `${pageObjNum(i)} 0 R`)
      .join(" ")}] /Count ${pages.length} >>`,
  );
  bodies.push(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  for (let i = 0; i < pages.length; i++) {
    bodies.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjNum(i)} 0 R >>`,
    );
    const stream = contentStream(pages[i]);
    bodies.push(
      `<< /Length ${latin1(stream).length} >>\nstream\n${stream}endstream`,
    );
  }

  const chunks: Buffer[] = [];
  let offset = 0;
  const push = (text: string) => {
    const buf = latin1(text);
    chunks.push(buf);
    offset += buf.length;
  };

  push("%PDF-1.4\n");
  const offsets: number[] = [];
  bodies.forEach((body, i) => {
    offsets.push(offset);
    push(`${i + 1} 0 obj\n${body}\nendobj\n`);
  });

  // Cross-reference table. Every entry is exactly 20 bytes, per the spec.
  const xrefOffset = offset;
  const entries = [
    "0000000000 65535 f \n",
    ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`),
  ];
  push(`xref\n0 ${bodies.length + 1}\n${entries.join("")}`);
  push(
    `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  return new Uint8Array(Buffer.concat(chunks));
}

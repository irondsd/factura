/**
 * Normalization applied in memory before detection/parsing.
 * The DB always keeps the raw text untouched; bump NORMALIZE_VERSION on any
 * change here so reparse can target bills processed with older behavior.
 */
export const NORMALIZE_VERSION = 1;

/** Tokens that are mostly Latin Extended / Greek / Cyrillic glyphs are 2D
 * barcode fonts (e.g. "ŸĺŖŖŖĺŸùüŵ"), not text. Spanish only needs Latin-1. */
function isGlyphSoup(token: string): boolean {
  if (token.length < 3) return false;
  let weird = 0;
  for (const ch of token) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x0100 && cp <= 0x04ff) weird++;
  }
  return weird / token.length > 0.4;
}

export function normalize(raw: string): string {
  // Collapse whitespace and drop 2D-barcode glyph runs FIRST — extractors
  // vary wildly in how many spaces they emit, and the rejoining rules below
  // assume single spaces.
  let text = raw
    .split(/\s+/)
    .filter((token) => !isGlyphSoup(token))
    .join(" ");

  // Rejoin diacritics split by pdf.js: "Liquidaci ó n" -> "Liquidación"
  text = text.replace(/(\p{L}) ([áéíóúñüÁÉÍÓÚÑÜ]) (?=\p{L})/gu, "$1$2");
  // "N ° " / "1 ° " -> "N° " / "1° "
  text = text.replace(/(\w) ?[°º] ?/gu, "$1° ");

  return text.trim();
}

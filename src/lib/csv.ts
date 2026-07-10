/** Minimal RFC 4180 CSV helpers. Client-side only for the download bit. */

type Cell = string | number | null | undefined;

/** Quote a cell when it contains a comma, quote, or newline; double inner quotes. */
function escapeCell(v: Cell): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize a header row + data rows to CSV text (CRLF line endings). */
export function toCsv(header: string[], rows: Cell[][]): string {
  return [header, ...rows].map((r) => r.map(escapeCell).join(",")).join("\r\n");
}

/** Trigger a browser download of text content. Prepends a UTF-8 BOM so Excel
 * reads accents (á, ñ, m³) correctly. Must run in response to a user gesture. */
export function downloadTextFile(
  filename: string,
  content: string,
  mime = "text/csv;charset=utf-8",
): void {
  const blob = new Blob(["﻿", content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Filesystem-safe slug for a filename fragment (vendor name, etc.). */
export function slugForFilename(s: string): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || "export"
  );
}

/**
 * A minimal read-only `.xlsx` reader: enough to pull a rectangular grid of
 * values out of a sheet, and nothing else.
 *
 * Why not a library: the one place this project reads spreadsheets is the
 * quarterly IDECBA refresh (`scripts/fetch-caba-inmobiliario.ts`), which runs
 * four times a year on a developer's machine and never in the app. SheetJS's
 * npm package has been abandoned at 0.18.5 in favour of a self-hosted registry,
 * and exceljs is a megabyte of write-path machinery we'd never call. An .xlsx
 * is a ZIP of XML, Node ships the inflater, and the subset we need — shared
 * strings, numbers, sparse rows — is the ~100 lines below.
 *
 * Deliberately unsupported, because the IDECBA files don't use them and a
 * silent wrong answer is worse than a crash: dates (returned as their raw
 * serial number), formulas (the cached value is returned), styles, merged
 * cells, and ZIP64 archives.
 */
import { inflateRawSync } from "node:zlib";

/** One cell. `null` is an empty cell — distinct from the string "///", which is
 * how IDECBA writes "suppressed", and which callers need to tell apart. */
export type Cell = string | number | null;

// ── ZIP ────────────────────────────────────────────────────────────────────
// Only the central directory is walked: it is the authoritative index of the
// archive, whereas scanning for local file headers can trip over a data
// descriptor that happens to look like a signature.

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;

/** Every file in the archive, by name. */
function unzip(buf: Buffer): Map<string, Buffer> {
  // The end-of-central-directory record is last, but a variable-length comment
  // can follow it, so scan backwards for the signature.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("xlsx: not a ZIP archive (no EOCD record)");

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) {
      throw new Error(`xlsx: bad central directory entry at ${p}`);
    }
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    // The local header repeats the name and extra fields, and its extra field
    // length may differ from the central one — so read it rather than assume.
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(start, start + compressedSize);

    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, inflateRawSync(raw));
    else throw new Error(`xlsx: unsupported compression ${method} for ${name}`);

    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// ── XML ────────────────────────────────────────────────────────────────────
// Regex rather than a parser: the OOXML these files contain is machine-written,
// flat, and never carries the pathological cases (CDATA, namespaced attributes
// in unexpected order) that would justify the dependency.

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXml(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (e) => ENTITIES[e]);
}

/** The shared string table. Each `<si>` is one string, but a run-formatted one
 * is split across several `<r><t>` children that have to be concatenated — miss
 * that and "Villa Gral. Mitre" comes back as "Villa ". */
function sharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((si) =>
    [...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map((t) => decodeXml(t[1]))
      .join(""),
  );
}

/** "BK7" → 62. Spreadsheet columns are bijective base-26, so there is no zero
 * digit and "AA" is 27, not 1. Exported for its test: the sale tables run past
 * column AM, and getting this wrong shifts values into the wrong quarter. */
export function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// ── Sheets ─────────────────────────────────────────────────────────────────

/** Sheet names, in the order the workbook lists them. */
export function sheetNames(file: Buffer): string[] {
  const wb = unzip(file).get("xl/workbook.xml")?.toString("utf8") ?? "";
  return [...wb.matchAll(/<sheet[^>]*\bname="([^"]*)"/g)].map((m) =>
    decodeXml(m[1]),
  );
}

/**
 * One sheet as a dense grid of rows, `sheetIndex` counting from 0 in workbook
 * order.
 *
 * Dense is the point: the XML omits empty cells entirely, so a row that starts
 * at column D carries no trace of A–C. Every cell is placed by its own `r`
 * reference and the gaps are filled with `null`, which is what keeps "column 38
 * is 2026 Q2" true on every row rather than only on the full ones. Rows are
 * padded to the width of the widest.
 */
export function readSheet(file: Buffer, sheetIndex = 0): Cell[][] {
  const files = unzip(file);
  const strings = sharedStrings(
    files.get("xl/sharedStrings.xml")?.toString("utf8"),
  );

  // Sheet files are conventionally sheet1.xml, sheet2.xml … but the mapping is
  // really workbook → rels → part name, and IDECBA's exporter does follow the
  // convention. Resolve through the rels anyway; it costs three lines.
  const wb = files.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const rels = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const rid = [...wb.matchAll(/<sheet[^>]*r:id="([^"]*)"/g)][sheetIndex]?.[1];
  const target = rid
    ? new RegExp(`Id="${rid}"[^>]*Target="([^"]*)"`).exec(rels)?.[1]
    : undefined;
  const part = target
    ? `xl/${target.replace(/^\.?\//, "")}`
    : `xl/worksheets/sheet${sheetIndex + 1}.xml`;

  const xml = files.get(part)?.toString("utf8");
  if (!xml) throw new Error(`xlsx: no sheet at index ${sheetIndex} (${part})`);

  const rows: Cell[][] = [];
  let width = 0;

  for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: Cell[] = [];
    for (const c of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = c[1];
      const body = c[2];
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /\bt="([^"]*)"/.exec(attrs)?.[1] ?? "n";

      let value: Cell = null;
      if (type === "s") {
        const i = Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1]);
        value = strings[i] ?? null;
      } else if (type === "inlineStr") {
        const parts = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)];
        value = parts.length ? parts.map((t) => decodeXml(t[1])).join("") : null;
      } else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        if (raw === undefined) value = null;
        else if (type === "str" || type === "e") value = decodeXml(raw);
        else if (type === "b") value = raw === "1" ? "TRUE" : "FALSE";
        else value = Number(raw);
      }

      const at = ref ? columnIndex(ref) : row.length;
      while (row.length < at) row.push(null);
      row[at] = value;
    }
    // Self-closing `<row .../>` (a styled but empty row) matches nothing above
    // and correctly contributes an empty row.
    width = Math.max(width, row.length);
    rows.push(row);
  }

  for (const row of rows) while (row.length < width) row.push(null);
  return rows;
}

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { mdxBody } from "@/content/mdx";
import type { ContentDocument, ContentSection, ContentStatus } from "../types";
import { extractMeta, type Meta } from "./mdxMeta";

// `documentsFromFilesystem()` (cms.md §5.2): the repository's `.mdx` files read
// as `ContentDocument`s.
//
// Two callers, both off the request path:
//
//  1. `bun run validate:content`, which must keep working through the whole
//     migration and after it — CI has no database.
//  2. Phase 7's importer and its parity report, which compare what is on disk
//     with what is in PostgreSQL.
//
// This is where the shape difference between the two worlds is resolved, and
// there are only three of them:
//
//  - `meta.noindex: true` is the `preview` lifecycle state, not a metadata
//    field (Phase 0 inventory). Absent means `published`.
//  - `meta.preview` is `metadata.previewImage`; `meta.canonical` is the
//    `canonicalSlug` column.
//  - the body's `import` lines go away, because the manifest resolves
//    components centrally (Phase 3).

const CONTENT_DIR = path.join(process.cwd(), "src/content");
const PUBLIC_DIR = path.join(process.cwd(), "public");

/** Whether a `/img/...` path names a real file. The document validator takes
 * this as a capability rather than doing it itself, because only a caller with
 * a filesystem can answer it. */
export const assetExists = (publicPath: string): boolean =>
  existsSync(path.join(PUBLIC_DIR, publicPath));

/** Strip the import lines a guide carries today. Phase 3 registered
 * `InflacionChart` in the manifest, so the body no longer needs them — and the
 * grammar validator rejects them, which is the point.
 *
 * Only *whole* import statements at the start of a line are removed. A line of
 * prose beginning with the word "import" is not an import statement, and the
 * regex requires the `from "…"` that makes it one. */
export function stripImports(body: string): string {
  return body.replace(
    /^import\s+[^;\n]*?\s+from\s*["'][^"']+["'];?[ \t]*\n/gm,
    "",
  );
}

/** The import specifiers a body declares, so a caller can check they were all
 * expected before dropping them (Phase 7: "reject any unexpected import"). */
export function declaredImports(body: string): string[] {
  return [
    ...body.matchAll(/^import\s+[^;\n]*?\s+from\s*["']([^"']+)["']/gm),
  ].map((m) => m[1]);
}

const str = (meta: Meta, key: string): string =>
  typeof meta[key] === "string" ? (meta[key] as string) : "";

const optStr = (meta: Meta, key: string): string | null =>
  typeof meta[key] === "string" && (meta[key] as string).trim() !== ""
    ? (meta[key] as string)
    : null;

/** Turn one `.mdx` source into a `ContentDocument`.
 *
 * Deliberately forgiving about *values*: a guide with a malformed date or a
 * missing title still produces a document, so the validator reports it as the
 * error it is rather than the parser throwing and hiding every other finding in
 * the file. Only an unreadable meta block is fatal. */
export function documentFromMdx(
  source: string,
  section: ContentSection,
  slug: string,
): ContentDocument {
  const { meta, error } = extractMeta(source);
  if (!meta) {
    throw new Error(`${section}/${slug}: ${error ?? "no meta block"}`);
  }

  const body = stripImports(mdxBody(source)).replace(/^\n+/, "");
  const status: ContentStatus = meta.noindex === true ? "preview" : "published";

  const known = new Set([
    "title",
    "titleTag",
    "description",
    "summary",
    "cta",
    "preview",
    "canonical",
    "noindex",
    "published",
    "updated",
  ]);
  // Everything else in the meta block is the JSONB half. Passed through as-is
  // so the Zod schema — not this function — decides what is acceptable, and an
  // unexpected key surfaces as a validation error rather than being dropped.
  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (known.has(key)) continue;
    metadata[key] = value;
  }
  if (meta.preview !== undefined) metadata.previewImage = meta.preview;

  const published = optStr(meta, "published");
  const updated = optStr(meta, "updated") ?? published ?? "";

  return {
    // Filesystem documents have no database identity. The path is stable and
    // unique, which is all any caller here needs — and it makes a parity report
    // line up with its database row by eye.
    id: `fs:${section}/${slug}`,
    section,
    slug,
    status,
    body,
    title: str(meta, "title"),
    titleTag: optStr(meta, "titleTag"),
    description: str(meta, "description"),
    summary: str(meta, "summary"),
    cta: str(meta, "cta"),
    canonicalSlug: optStr(meta, "canonical"),
    metadata: metadata as ContentDocument["metadata"],
    publishedAt: published,
    contentUpdatedAt: updated,
    createdAt: published ?? "",
    updatedAt: updated,
    createdBy: null,
    updatedBy: null,
    lockVersion: 1,
  };
}

/** Every document of a section, read off disk, sorted by slug so a report is
 * stable between runs. */
export function documentsFromFilesystem(
  section: ContentSection = "guias",
): ContentDocument[] {
  const dir = path.join(CONTENT_DIR, section);
  return readdirSync(dir)
    .filter((file) => file.endsWith(".mdx"))
    .sort()
    .map((file) => {
      const slug = file.replace(/\.mdx$/, "");
      return documentFromMdx(
        readFileSync(path.join(dir, file), "utf8"),
        section,
        slug,
      );
    });
}

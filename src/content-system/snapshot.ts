import type { ContentDocument } from "./types";

/** A deterministic, JSON-safe representation of the CMS corpus for CI. */
export function serializeSnapshot(
  documents: readonly ContentDocument[],
): string {
  return `${JSON.stringify(documents, null, 2)}\n`;
}

export function parseSnapshot(json: string): ContentDocument[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error("content snapshot must be an array of documents");
  }
  return parsed as ContentDocument[];
}

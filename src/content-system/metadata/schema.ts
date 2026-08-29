import type { z } from "zod";
import type { ContentSection } from "../types";
import { contentMetadataSchema } from "./sections";

// Compatibility entry point used by callers that already carry a section.
// Every section now has the same storage shape; the section only affects
// editorial requiredness later in document validation.

export function metadataSchemaFor(section: ContentSection): z.ZodType {
  void section;
  return contentMetadataSchema;
}

/** Parse a metadata blob for a section, returning either the parsed value or a
 * flat list of `field → message` problems.
 *
 * Flattened here rather than at each call site because both callers turn the
 * issues into the same thing — a `Diagnostic` naming the field — and Zod's
 * issue shape is not something the CMS service or the editor should have to
 * know about. */
export function parseMetadata(
  section: ContentSection,
  value: unknown,
):
  | { ok: true; data: unknown }
  | { ok: false; problems: { field: string; message: string }[] } {
  const parsed = metadataSchemaFor(section).safeParse(value);
  if (parsed.success) {
    const data = parsed.data as Record<string, unknown>;
    return {
      ok: true,
      data: {
        ...data,
        locations: Array.isArray(data.locations)
          ? [...data.locations].sort()
          : [],
      },
    };
  }
  return {
    ok: false,
    problems: parsed.error.issues.map((issue) => ({
      // `unrecognized_keys` has no path — the offending key is in the issue
      // itself, and naming it is the whole point of the message.
      field:
        issue.code === "unrecognized_keys"
          ? issue.keys.join(", ")
          : issue.path.join("."),
      message: issue.message,
    })),
  };
}

import type { z } from "zod";
import type { ContentSection } from "../types";
import { guideMetadataSchema } from "./guias";
import { sectionMetadataSchema } from "./sections";

// Which metadata schema a section's JSONB is held to.
//
// One definition, because four callers ask the question and they must not be
// able to disagree: the row → document mapper on the way out, the CMS service
// on the way in, the MCP tool arguments, and the importer. When they disagreed,
// a value the service happily wrote was one the mapper refused to read back —
// which is a row that exists and cannot be loaded.

export function metadataSchemaFor(section: ContentSection): z.ZodType {
  return section === "guias" || section === "noticias"
    ? guideMetadataSchema
    : sectionMetadataSchema;
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
  if (parsed.success) return { ok: true, data: parsed.data };
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

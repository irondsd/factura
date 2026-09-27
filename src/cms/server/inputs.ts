import { z } from "zod";
import { CONTENT_SECTIONS, CONTENT_STATUSES } from "@/content-system/types";
import { CmsValidationError } from "./errors";

// The shapes a content operation accepts, checked at runtime — once, here, for
// both ways in (cms.md: "the MCP is a second caller, never a second
// implementation").
//
// A server action's argument is whatever the browser sent. TypeScript types it
// at the call site in our own code and promises nothing about the request that
// actually arrives, so the browser actions parse with these exactly as the MCP
// tools do, and a malformed call is an ordinary validation refusal rather than
// a database error halfway through a write.
//
// The one place the two callers differ is `metadata` on a save: the browser
// form sends the whole object, the MCP sends a patch (`../metadataPatch`). That
// difference is spelled out where each builds its patch schema, below and in
// `../mcp/tools.ts`.

// Enums rather than refined strings: the MCP publishes these as JSON Schema
// (`toJSONSchema`), where an enum tells an agent the valid values and a
// transform cannot be represented at all.
export const sectionSchema = z.enum(CONTENT_SECTIONS);

export const statusSchema = z.enum(CONTENT_STATUSES);

const id = z.uuid();
const lockVersion = z.number().int().positive();

/** A write against a page at the version the caller last read. */
export const lockedPageSchema = z.object({
  id,
  expectedLockVersion: lockVersion,
});

/** Every field a save may change except `metadata`, whose form depends on the
 * caller. */
export const patchFieldsSchema = z.object({
  title: z.string().optional(),
  titleTag: z.string().nullable().optional(),
  description: z.string().optional(),
  summary: z.string().optional(),
  cta: z.string().optional(),
  canonicalSlug: z.string().nullable().optional(),
  body: z.string().optional(),
  parentId: z.uuid().nullable().optional(),
  sortOrder: z.number().int().optional(),
  crumb: z.string().nullable().optional(),
});

/** The browser's patch: `metadata` is the whole object the form rendered. Its
 * shape is the section's schema, checked by the service once the section is
 * known. */
export const browserPatchSchema = patchFieldsSchema.extend({
  metadata: z.unknown().optional(),
});

export const createContentSchema = z.object({
  section: sectionSchema,
  slug: z.string(),
  title: z.string(),
  titleTag: z.string().nullable().optional(),
  description: z.string(),
  summary: z.string(),
  cta: z.string().optional(),
  canonicalSlug: z.string().nullable().optional(),
  body: z.string(),
  metadata: z.unknown(),
  parentId: z.uuid().nullable().optional(),
  sortOrder: z.number().int().optional(),
  crumb: z.string().nullable().optional(),
});

export const updateContentSchema = lockedPageSchema.extend({
  patch: browserPatchSchema,
});

export const setStatusSchema = lockedPageSchema.extend({
  status: statusSchema,
});

export const renameSchema = lockedPageSchema.extend({ slug: z.string() });

export const restoreSchema = lockedPageSchema.extend({ revisionId: id });

export const compareSchema = z.object({ id, revisionId: id.optional() });

export const validationLevelSchema = z.enum(["draft", "preview", "publish"]);

export const validateSchema = z.object({
  id,
  patch: browserPatchSchema.optional(),
  level: validationLevelSchema.optional(),
});

export const pageIdSchema = z.object({ id });

/** Parse, or refuse the way every other rule refuses: a `CmsValidationError`
 * naming each field, which both callers already know how to report. */
export function parseInput<T extends z.ZodType>(
  schema: T,
  input: unknown,
): z.output<T> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  throw new CmsValidationError(
    parsed.error.issues.map((issue) => {
      const field = issue.path.join(".");
      return {
        code: "input.invalid",
        severity: "error" as const,
        message: field ? `${field}: ${issue.message}` : issue.message,
        ...(field ? { field } : {}),
      };
    }),
  );
}

// ── taxonomy ───────────────────────────────────────────────────────────────
// Categories and locations take the same discipline. The services still
// trim and length-check the copy; these only make sure it *is* copy.

const copyPatch = {
  label: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
};

export const createCategorySchema = z.object({
  section: sectionSchema,
  label: z.string(),
  title: z.string(),
  description: z.string(),
  sortOrder: z.number().int().optional(),
  slug: z.string().optional(),
});

export const updateCategorySchema = lockedPageSchema.extend({
  patch: z.object({ ...copyPatch, sortOrder: z.number().int().optional() }),
});

export const createLocationSchema = z.object({
  label: z.string(),
  title: z.string(),
  description: z.string(),
  slug: z.string().optional(),
});

export const updateLocationSchema = lockedPageSchema.extend({
  patch: z.object(copyPatch),
});

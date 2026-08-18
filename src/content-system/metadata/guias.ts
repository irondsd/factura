import { z } from "zod";
import { CATEGORY_IDS } from "@/content/guias/categories";
import { CHART_IDS } from "@/content/guias/data/inflacion";

// The one guide metadata schema. cms.md §3.7 requires a single definition
// shared by the CMS form, the mutations, the MCP tools, the importer, the
// validators and public rendering — anything less and the four of them
// disagree about what a guide is the first time a field changes.
//
// The rules below are the ones `scripts/validate-guides.ts` already enforces on
// the MDX files, restated as Zod so they hold for database content too. Where
// the script raises a *warning* (length advisories, keyword counts) that is a
// document-validation concern, not a schema concern, and it stays in the
// validators (Phase 4) — this schema only rejects what is structurally wrong.

/** One URL segment: lowercase, hyphen-separated, no accents or spaces. Same
 * expression as `scripts/lib/content.ts`, restated rather than imported: this
 * module is bundled into the app and `scripts/` is not. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Path segments under /guias that are real routes. A guide with one of these
 * slugs would be shadowed by the route and never render. */
export const RESERVED_GUIDE_SLUGS = ["categoria"] as const;

/** Preview images live in one directory and are named after the guide they
 * illustrate, so a stale file is obvious from `ls` alone. */
const PREVIEW_PATTERN =
  /^\/img\/guias\/previews\/[a-z0-9-]+\.(?:jpg|png|webp)$/;

/** Full ISO 8601 with an explicit offset (or Z). Google requires only the date
 * but recommends time and zone, and the article renders the timestamp visibly —
 * requiring the offset keeps the dateline and the JSON-LD identical by
 * construction. */
const DATETIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:Z|[+-]\d{2}:\d{2})$/;

/** Whether the digits describe a real instant. The regex accepts
 * `2026-02-30T25:00:00-03:00`, and `Date.parse` is no help — it rolls February
 * 30th over into March rather than rejecting it. Same component check as
 * `isValidDateTime` in `scripts/lib/content.ts`, which Phase 4 folds into one
 * implementation. */
function isRealDateTime(value: string): boolean {
  const match = DATETIME_PATTERN.exec(value);
  if (!match) return false;
  const [, y, mo, d, h, mi, sec] = match.map(Number);
  const utc = new Date(Date.UTC(y, mo - 1, d));
  return (
    utc.getUTCFullYear() === y &&
    utc.getUTCMonth() === mo - 1 &&
    utc.getUTCDate() === d &&
    h < 24 &&
    mi < 60 &&
    sec < 60
  );
}

export const guideSlug = z
  .string()
  .min(1)
  .regex(SLUG_PATTERN, "must be lowercase, hyphen-separated, without accents")
  .refine((s) => !(RESERVED_GUIDE_SLUGS as readonly string[]).includes(s), {
    message: "is a reserved /guias route and would never render",
  });

export const contentDateTime = z
  .string()
  .regex(
    DATETIME_PATTERN,
    'must be full ISO 8601 with offset, e.g. "2026-06-29T09:00:00-03:00"',
  )
  .refine(isRealDateTime, "is not a real date or time");

/** A non-empty, non-blank string. Used for every optional override, where the
 * failure worth catching is `titleTag: ""` — which silently keeps shipping the
 * title it was written to fix. */
const filled = z.string().trim().min(1);

/** The two text slots on the generated social card. Not an image: the card's
 * layout and palette are the site's, and these steer the copy printed on it.
 * `.strict()` so a typo'd key is an error rather than data that never renders. */
export const ogImageSchema = z
  .object({ eyebrow: filled.optional(), stat: filled.optional() })
  .strict();

export const faqItemSchema = z
  .object({
    q: filled,
    a: filled,
  })
  .strict();

/** The JSONB half of a guide's metadata — everything that does not get its own
 * column (cms.md §3.7). `.strict()` throughout: unknown keys are how a renamed
 * field turns into data nothing reads. */
export const guideMetadataSchema = z
  .object({
    keywords: z.array(filled).min(1),
    categories: z.array(z.enum(CATEGORY_IDS)).min(1),
    /** Answers are plain text on purpose: the same list renders the visible
     * block and the FAQPage JSON-LD, so a link in an answer would put markup in
     * the structured data. Links belong in the prose. */
    faq: z.array(faqItemSchema).min(1).optional(),
    ogTitle: filled.optional(),
    ogDescription: filled.optional(),
    ogImage: ogImageSchema.optional(),
    vendor: filled.optional(),
    previewImage: filled.regex(PREVIEW_PATTERN).optional(),
  })
  .strict()
  .refine((m) => new Set(m.categories).size === m.categories.length, {
    message: "categories has duplicate ids",
    path: ["categories"],
  });

export type GuideMetadataInput = z.input<typeof guideMetadataSchema>;

/** The columned half, for the create/update mutations. Kept beside the JSONB
 * schema so both halves of "what is a guide" are read together. */
export const guideFieldsSchema = z.object({
  title: filled,
  titleTag: filled.optional(),
  description: filled,
  summary: filled,
  cta: filled,
  canonicalSlug: guideSlug.optional(),
});

/** The chart ids `<InflacionChart chart="…" />` accepts. Exported here so the
 * Phase 3 component manifest and the MCP tool descriptions read the enum from
 * the same place the data module defines it. */
export const chartIdSchema = z.enum(CHART_IDS);

import { z } from "zod";
import { CHART_IDS } from "@/content/guias/data/inflacion";
import { unsafeUrlMessage, unsafeUrlScheme } from "../validation/url";

// The one guide metadata schema. cms.md requires a single definition
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

/** Full ISO 8601 with an explicit offset (or Z). Google requires only the date
 * but recommends time and zone, and the article renders the timestamp visibly —
 * requiring the offset keeps the dateline and the JSON-LD identical by
 * construction. */
// Fractional seconds optional — a value round-tripped through a `timestamptz`
// column comes back with milliseconds, and it is the same instant.
const DATETIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

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

/** One entry in a page's `<Fuentes />` block: where a number, a rule or a field
 * name came from, with a link a reader can follow.
 *
 * Defined here rather than beside the statistics metadata because it is no
 * longer a statistics-only idea — a guide that walks through a real bill cites
 * the distributor's own documentation the same way — and `./sections` already
 * imports from this module, so this is the end of the dependency that has no
 * cycle in it. */
/** A URL a page publishes as a link.
 *
 * `z.url()` alone is not enough: it accepts anything `new URL()` parses, and
 * `javascript:alert(1)` parses. Metadata is rendered into `<a href>` the same
 * way the body is, so it is held to the same allowlist the grammar applies to
 * markdown links — one policy, in `../validation/url`, checked in both places
 * rather than trusted to be someone else's problem. */
export const contentUrl = z.url().superRefine((value, ctx) => {
  const scheme = unsafeUrlScheme(value);
  if (scheme)
    ctx.addIssue({ code: "custom", message: unsafeUrlMessage(scheme) });
});

export const dataSourceSchema = z
  .object({ label: filled, href: contentUrl, note: filled.optional() })
  .strict();

/** The JSONB half of a guide's metadata — everything that does not get its own
 * column (cms.md). `.strict()` throughout: unknown keys are how a renamed
 * field turns into data nothing reads. */
export const guideMetadataSchema = z
  .object({
    // Empty is allowed *here* and rejected by the document validator at preview
    // and publish level. This schema answers "is this the right shape to
    // store?"; whether it is a finished page is an editorial question, and
    // cms.md says a draft may be incomplete. A `min(1)` here would make a
    // new draft unreadable the moment it was written.
    keywords: z.array(filled).default([]),
    // Category membership is section-owned database data. Shape belongs here;
    // existence and active status are resolved by the document validator.
    categories: z.array(filled).default([]),
    // Geographic membership is global and unordered. Sorting on parse makes a
    // reorder-only save a no-op while keeping old revisions readable.
    locations: z
      .array(filled)
      .default([])
      .refine((values) => new Set(values).size === values.length, {
        message: "locations has duplicate keys",
      }),
    /** Answers are plain text on purpose: the same list renders the visible
     * block and the FAQPage JSON-LD, so a link in an answer would put markup in
     * the structured data. Links belong in the prose. */
    faq: z.array(faqItemSchema).min(1).optional(),
    ogTitle: filled.optional(),
    ogDescription: filled.optional(),
    ogImage: ogImageSchema.optional(),
    vendor: filled.optional(),
    /** The page's preview image, as a media-library id (cms.md).
     *
     * A uuid rather than a path, so an article survives a change of storage
     * origin: the CDN hostname lives in configuration and is resolved at render
     * time. */
    previewMediaId: z.uuid().optional(),
    /** Who wrote the page, and who checked its numbers. Ids into `cms_author`;
     * existence is resolved by the document validator, the way category keys
     * are. Both optional — a page with no byline is published by the
     * organization, which is what the markup said before authors existed. */
    authorId: z.uuid().optional(),
    factCheckerId: z.uuid().optional(),
    /** Primary sources for what the page asserts, rendered by `<Fuentes />`.
     * Optional here in a way it is not on a data page: a statistics page
     * without provenance is an opinion piece with charts, whereas most guides
     * explain a thing rather than measure it and have nothing to cite. */
    sources: z.array(dataSourceSchema).optional(),
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
  /** Optional: a page with no line of its own gets the banner's default copy
   * (`DEFAULT_TOP_CTA`), so an empty banner is not a state that can ship. */
  cta: filled.optional(),
  canonicalSlug: guideSlug.optional(),
});

/** The chart ids `<InflacionChart chart="…" />` accepts. Exported here so the
 * Phase 3 component manifest and the MCP tool descriptions read the enum from
 * the same place the data module defines it. */
export const chartIdSchema = z.enum(CHART_IDS);

// The vocabulary the public site and the CMS both speak. This module is shared
// by design (cms.md §2.2): the public renderer reads `ContentDocument`s and the
// CMS writes them, so neither owns the shape. Nothing here may import from
// `src/cms/**`, and nothing here does I/O.

/** The content sections. `normativa` is deliberately absent — it is a
 * hand-built registry page, not authored MDX, and it is not migrating. */
export const CONTENT_SECTIONS = [
  "guias",
  "estadisticas",
  "investigaciones",
] as const;

export type ContentSection = (typeof CONTENT_SECTIONS)[number];

export function isContentSection(value: string): value is ContentSection {
  return (CONTENT_SECTIONS as readonly string[]).includes(value);
}

/** Publication state. Mirrors the `cms_page_status` database enum; the table in
 * cms.md §3.2 is the whole specification:
 *
 * | status      | CMS     | direct public URL   | listings |
 * | ----------- | ------- | ------------------- | -------- |
 * | `draft`     | visible | 404                 | excluded |
 * | `preview`   | visible | renders, `noindex`  | excluded |
 * | `published` | visible | renders normally    | included | */
export const CONTENT_STATUSES = ["draft", "preview", "published"] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export function isContentStatus(value: string): value is ContentStatus {
  return (CONTENT_STATUSES as readonly string[]).includes(value);
}

/** Structured metadata for one page, already parsed and validated. The union
 * gains `estadisticas`/`investigaciones` members in section 12; the discriminant
 * is the document's `section`, not a field inside the metadata. */
export type GuideMetadata = {
  keywords: string[];
  categories: string[];
  faq?: { q: string; a: string }[];
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: { eyebrow?: string; stat?: string };
  vendor?: string;
  /** Media-library id of the preview image. */
  previewMediaId?: string;
};

/** Metadata shared by the statistics and research sections.  Their original
 * MDX modules used the same title/description columns as guides, plus this
 * JSONB payload for dataset provenance and the section-specific article
 * furniture. */
export type DataSource = { label: string; href: string; note?: string };
export type DatasetMetadata = {
  name: string;
  description: string;
  temporalCoverage: string;
  spatialCoverage: string;
  variableMeasured: string[];
};

export type SectionMetadata = Omit<GuideMetadata, "ogImage"> & {
  ogImage?: { eyebrow?: string; stat?: string };
  ogStat?: string;
  sources?: DataSource[];
  dataset?: DatasetMetadata;
};

/** The JSONB payload for every CMS-backed content section. */
export type ContentMetadata = SectionMetadata;

/** A complete page: everything needed to render it and everything needed to
 * edit it. The CMS and the public renderer read the same object — a preview
 * that went through a different shape would not be a preview (cms.md §6). */
export type ContentDocument = {
  id: string;
  section: ContentSection;
  slug: string;
  status: ContentStatus;
  /** The restricted-MDX source. Never contains `export const meta` — metadata
   * is columns and JSONB, not part of the body (cms.md §3.7). */
  body: string;
  title: string;
  titleTag: string | null;
  description: string;
  summary: string;
  cta: string;
  /** Slug this page's canonical points at, when it is not its own. */
  canonicalSlug: string | null;
  /** The editorial tree, uniform across sections — null is a top-level page.
   * See `src/content-system/hierarchy.ts` for the invariant that keeps this and
   * `slug` in agreement. */
  parentId: string | null;
  /** Explicit order among siblings. */
  sortOrder: number;
  /** Short breadcrumb/index label; falls back to `title` when null. */
  crumb: string | null;
  metadata: ContentMetadata;
  /** Set only on a CMS read of a row whose stored metadata does not match its
   * section's schema — a hand-edited row, or a schema change without a
   * backfill. `metadata` is then empty, and this says what was wrong with what
   * was there.
   *
   * Never set on a public read: those refuse the row outright rather than
   * render it with its metadata missing. See `MetadataFailureMode`. */
  metadataError?: string;
  /** Null until the page has been published once. */
  publishedAt: string | null;
  /** The editorial "last updated", which is what the page displays. */
  contentUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  /** The version an editor must echo back to save. See `cms_page.lock_version`. */
  lockVersion: number;
};

/** The listing projection: what an index, a category hub, a related-guides
 * block or the CMS list needs, without the body. Kept deliberately small — the
 * point of a summary is not loading 43 MDX bodies to render a list of links. */
export type ContentSummary = Omit<ContentDocument, "body">;

// ── diagnostics ─────────────────────────────────────────────────────────────

export type DiagnosticSeverity = "error" | "warning";

/** One validation finding. Carries a stable machine-readable `code` alongside
 * the human message so the editor can map it to a lint marker, the MCP can
 * return it structurally, and a message can be reworded without breaking either
 * (cms.md §5, §8).
 *
 * `line`/`column` are 1-based and point into the MDX body when the finding is
 * about the body; `field` names the metadata field when it is about metadata.
 * A finding has one or the other, never both.
 *
 * `component` names the JSX element a finding is about, so a caller can act on
 * it without parsing the message — the CMS preview uses it to stub out
 * components that do not exist yet. */
export type Diagnostic = {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  line?: number;
  column?: number;
  field?: string;
  component?: string;
};

/** The result of validating something. `ok` is "no errors" — warnings never
 * block, they are shown and carried (cms.md §5.3). */
export type ValidationResult = {
  ok: boolean;
  diagnostics: Diagnostic[];
};

export const hasErrors = (diagnostics: Diagnostic[]): boolean =>
  diagnostics.some((d) => d.severity === "error");

export function validationResult(diagnostics: Diagnostic[]): ValidationResult {
  return { ok: !hasErrors(diagnostics), diagnostics };
}

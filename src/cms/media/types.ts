// Types shared across the CMS media library (cms.md §9). Pure: no database,
// no S3, no React — so the validators, the store, the service, the MCP adapter
// and the browser components all agree on one vocabulary.

import type { RevisionKind } from "../revisions";

/** The media lifecycle, mirroring `cms_media.status`.
 *
 *   pending ──finalize──▶ ready ──trash──▶ trashed ──purge──▶ purging ─▶ purged
 *                            ◀──restore──┘
 *
 * `pending` exists so the bucket can never hold a key the database has not
 * recorded; `trashed` is a grace period, not a deletion; `purging` is the
 * retry point when object storage was unavailable mid-purge. */
export type MediaStatus =
  | "pending"
  | "ready"
  | "trashed"
  | "purging"
  | "purged";

export const MEDIA_STATUSES: readonly MediaStatus[] = [
  "pending",
  "ready",
  "trashed",
  "purging",
  "purged",
];

export const isMediaStatus = (value: string): value is MediaStatus =>
  (MEDIA_STATUSES as readonly string[]).includes(value);

/** Where a page refers to an image. `preview` is structured page metadata and
 * can occur at most once; `body` is a Markdown image in the prose. */
export type MediaPlacement = "preview" | "body";

/** One image, as every caller above the store sees it. `objectKey` is
 * deliberately absent: it is internal, and nothing outside
 * `src/cms/media/server` has any business knowing it. */
export type MediaAsset = {
  id: string;
  status: MediaStatus;
  collectionId: string | null;
  originalFilename: string;
  displayName: string;
  mimeType: string | null;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  sha256: string | null;
  defaultAlt: string;
  decorative: boolean;
  attribution: string | null;
  firstUsedAt: string | null;
  lastReferencedAt: string | null;
  lockVersion: number;
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
  /** The editorial permalink — what goes into an article. */
  permalink: string;
  /** Where `next/image` fetches the source bytes. Derived from configuration,
   * never stored, never authored. */
  src: string | null;
};

/** A media row plus how many pages currently reference it. The library grid and
 * the trash gate both need the count, and it is one join. */
export type MediaAssetWithUsage = MediaAsset & {
  usageCount: number;
};

/** The minimum a renderer needs: a resolved source, intrinsic dimensions, and
 * the alt decision. Returned to layouts instead of a bare string so a preview
 * cannot be rendered without the dimensions that prevent layout shift. */
export type MediaRef = {
  id: string;
  src: string;
  width: number;
  height: number;
  defaultAlt: string;
  decorative: boolean;
  mimeType: string;
};

export type MediaCollection = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
};

/** One stored *version*'s reference to one image, for the detail view's usage
 * list (cms.md §14.5).
 *
 * A page can appear more than once — its live publication and the working copy
 * that is about to replace it may both use the same chart — which is why the
 * detail view groups by page and names the version, rather than pretending
 * there is one reference per page. */
export type MediaUsageRef = {
  pageId: string;
  revisionId: string;
  kind: RevisionKind;
  /** Non-null only for a publication. */
  publicationNumber: number | null;
  section: string;
  slug: string;
  /** The title *that version* carries, which need not be the page's current
   * one. */
  title: string;
  status: string;
  /** True only for the publication the page is currently serving. */
  isLive: boolean;
  placement: MediaPlacement;
  occurrences: number;
};

/** The library's virtual views (cms.md §9.10). Splitting "unused" in two
 * is the point of the feature: an image uploaded five minutes ago and one
 * dropped from a guide last month both have zero references, and only the
 * second is obviously safe to remove. */
export type MediaUsageFilter =
  | "all"
  /** Referenced by at least one page, in any status. */
  | "used"
  /** Zero references, and never placed anywhere. */
  | "never-used"
  /** Zero references now, but placed at some point in the past. */
  | "no-longer-used";

export type MediaListFilter = {
  /** Which lifecycle states to include. Defaults to `["ready"]` — the trash is
   * a deliberate, separate view. */
  statuses?: MediaStatus[];
  /** `null` means "Sin colección", `undefined` means "any". */
  collectionId?: string | null;
  usage?: MediaUsageFilter;
  /** Substring match on display name, filename or default alt. */
  search?: string;
  mimeTypes?: string[];
  sort?: "newest" | "oldest" | "name" | "largest";
  limit?: number;
  offset?: number;
};

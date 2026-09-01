import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  lt,
  not,
  or,
  sql,
} from "drizzle-orm";
import { db as defaultDb, type Database } from "@/db";
import {
  cmsMedia,
  cmsMediaCollections,
  cmsMediaUsage,
  cmsPageRevisions,
  cmsPages,
} from "@/db/schema";
import { isRevisionKind } from "../../revisions";
import { buildMediaPermalink } from "@/content-system/media/permalink";
import type {
  MediaAsset,
  MediaAssetWithUsage,
  MediaCollection,
  MediaListFilter,
  MediaPlacement,
  MediaStatus,
  MediaUsageRef,
} from "../types";
import { isMediaStorageConfigured, publicUrl } from "./storage";

// The only module that reads or writes `cms_media`, `cms_media_collection` and
// `cms_media_usage`.
//
// Deliberately dumb, exactly like `src/cms/server/store.ts`: no authorization,
// no lifecycle decisions, no S3. Whether a trash is *allowed* is decided in
// `./service`; this executes the SQL that carries it out.

type MediaRow = typeof cmsMedia.$inferSelect;

/** Row → the shape every caller above this module sees.
 *
 * `objectKey` never crosses this boundary. Authored content references
 * `/media/<id>/<name>`, and the storage origin is derived at render time, so
 * changing providers is a configuration edit rather than a rewrite of every
 * page. */
export function toAsset(row: MediaRow): MediaAsset {
  return {
    id: row.id,
    status: row.status as MediaStatus,
    collectionId: row.collectionId,
    originalFilename: row.originalFilename,
    displayName: row.displayName,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
    sha256: row.sha256,
    defaultAlt: row.defaultAlt,
    decorative: row.decorative,
    attribution: row.attribution,
    firstUsedAt: row.firstUsedAt?.toISOString() ?? null,
    lastReferencedAt: row.lastReferencedAt?.toISOString() ?? null,
    lockVersion: row.lockVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    trashedAt: row.trashedAt?.toISOString() ?? null,
    permalink: buildMediaPermalink({
      id: row.id,
      displayName: row.displayName,
      originalFilename: row.originalFilename,
    }),
    src:
      row.objectKey && isMediaStorageConfigured()
        ? publicUrl(row.objectKey)
        : null,
  };
}

// Correlated subqueries here are written with **fully qualified table names**
// rather than by interpolating Drizzle column objects, and that is not a style
// preference.
//
// Drizzle renders an interpolated column unqualified — `"id"` — whenever the
// outer statement has a single table, because at that level it is unambiguous.
// Inside a subquery over a *different* table it stops being unambiguous:
// PostgreSQL resolves the bare name against the innermost scope first, so
// `where media.collection_id = "id"` silently compares against `cms_media.id`
// instead of the collection's. No error, no warning, just a count that is
// always zero. Spelling the table out is the only way to say which `id` is
// meant.

/** How many distinct *pages* reference an asset. A correlated subquery rather
 * than a join, so one asset with three placements is still one row here.
 *
 * Pages rather than revisions, deliberately: an image on a published article
 * and on the working copy about to replace it is used on one page, and the
 * library's count is a count of places a reader could meet it. The revision
 * breakdown is in `usageOf`, which is where somebody asking "why can I not
 * delete this" is looking. */
const usageCountSql = sql<number>`(
  select count(distinct revision.page_id)::int
  from cms_media_usage usage
  join cms_page_revision revision on revision.id = usage.revision_id
  where usage.media_id = cms_media.id
)`;

/** How many author profiles use an asset as their portrait. Kept separate from
 * `usageCountSql`: a portrait is a real usage, but it is not a page. */
const portraitCountSql = sql<number>`(
  select count(*)::int
  from cms_author author
  where author.image_media_id = cms_media.id
)`;

/** "At least one page points at this row."
 *
 * A raw fragment rather than a builder-made subquery, because it is embedded in
 * statements that run on whichever connection the store is bound to — including
 * an open transaction — and a subquery built from the app's singleton would
 * only look like it belonged to that transaction. */
const referencedByAnyPage = () => sql`exists (
  select 1 from cms_media_usage usage where usage.media_id = cms_media.id
)`;

/** "This row is somebody's portrait."
 *
 * A second predicate rather than a row in `cms_media_usage`, because that
 * table's primary key starts with a revision id and an author is not a page
 * copy. Held to the same standard as the usage check and combined with it in
 * the same WHERE clause: the removal gates below have to be decided inside the
 * statement that removes, or an author edit landing at the same moment could
 * slip past a check made just before it. */
const usedAsPortrait = () => sql`exists (
  select 1 from cms_author author where author.image_media_id = cms_media.id
)`;

/** Everything that holds an image, for the gates that take one away. */
const stillInUse = () => sql`(${referencedByAnyPage()} or ${usedAsPortrait()})`;

export type MediaInsert = {
  originalFilename: string;
  displayName: string;
  stagingKey: string;
  collectionId: string | null;
  actorId: string;
  now: Date;
};

export type MediaFinalize = {
  id: string;
  objectKey: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
  now: Date;
};

export type MediaReplacement = MediaFinalize & {
  expectedLockVersion: number;
  stagingKey: string;
  originalFilename: string;
  actorId: string;
};

export type MediaPatch = {
  displayName?: string;
  defaultAlt?: string;
  decorative?: boolean;
  attribution?: string | null;
  collectionId?: string | null;
};

/** One page's references, as the usage writer supplies them. */
export type UsageEntry = {
  mediaId: string;
  placement: MediaPlacement;
  occurrences: number;
  locators: unknown[];
};

export class CmsMediaStore {
  constructor(private readonly db: Database = defaultDb) {}

  /** The same store bound to an open transaction, so a page save and the usage
   * rows it implies are one atomic write. */
  bind(db: Database): CmsMediaStore {
    return new CmsMediaStore(db);
  }

  // ── media rows ──────────────────────────────────────────────────────────

  /** Reserve an upload. Committed *before* the presigned URL is issued: that
   * ordering is the whole invariant — the bucket can never hold a key this
   * table has not recorded. */
  async insertPending(input: MediaInsert): Promise<MediaAsset> {
    const [row] = await this.db
      .insert(cmsMedia)
      .values({
        status: "pending",
        stagingKey: input.stagingKey,
        originalFilename: input.originalFilename,
        displayName: input.displayName,
        collectionId: input.collectionId,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    return toAsset(row);
  }

  /** pending → ready, once the bytes have been inspected and the master
   * written. Conditional on the row still being `pending`, so a duplicated
   * finalize call cannot resurrect a swept reservation. */
  async finalize(input: MediaFinalize): Promise<MediaAsset | null> {
    const [row] = await this.db
      .update(cmsMedia)
      .set({
        status: "ready",
        objectKey: input.objectKey,
        stagingKey: null,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        width: input.width,
        height: input.height,
        sha256: input.sha256,
        updatedAt: input.now,
      })
      .where(and(eq(cmsMedia.id, input.id), eq(cmsMedia.status, "pending")))
      .returning();
    return row ? toAsset(row) : null;
  }

  /** Record a replacement reservation while leaving the current master live.
   * The lock bump prevents a second tab from reserving a competing file from
   * the same version of the detail screen. */
  async reserveReplacement(input: {
    id: string;
    expectedLockVersion: number;
    stagingKey: string;
    actorId: string;
    now: Date;
  }): Promise<MediaAsset | null> {
    const [row] = await this.db
      .update(cmsMedia)
      .set({
        replacementStagingKey: input.stagingKey,
        lockVersion: sql`${cmsMedia.lockVersion} + 1`,
        updatedBy: input.actorId,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(cmsMedia.id, input.id),
          eq(cmsMedia.status, "ready"),
          eq(cmsMedia.lockVersion, input.expectedLockVersion),
          isNull(cmsMedia.replacementStagingKey),
          isNull(cmsMedia.replacementCleanupKey),
        ),
      )
      .returning();
    return row ? toAsset(row) : null;
  }

  /** Point the stable media id at a newly stored immutable master. The old key
   * stays recorded until object storage confirms its deletion, so a transient
   * S3 failure cannot turn it into an untracked orphan. */
  async replaceWithLock(input: MediaReplacement): Promise<MediaAsset | null> {
    const current = await this.objectKeysOf(input.id);
    if (!current?.objectKey) return null;
    const cleanupKey =
      current.objectKey === input.objectKey ? null : current.objectKey;

    const [row] = await this.db
      .update(cmsMedia)
      .set({
        objectKey: input.objectKey,
        replacementStagingKey: null,
        replacementCleanupKey: cleanupKey,
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        width: input.width,
        height: input.height,
        sha256: input.sha256,
        lockVersion: sql`${cmsMedia.lockVersion} + 1`,
        updatedBy: input.actorId,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(cmsMedia.id, input.id),
          eq(cmsMedia.status, "ready"),
          eq(cmsMedia.lockVersion, input.expectedLockVersion),
          eq(cmsMedia.replacementStagingKey, input.stagingKey),
          eq(cmsMedia.objectKey, current.objectKey),
        ),
      )
      .returning();
    return row ? toAsset(row) : null;
  }

  async clearReplacementCleanup(input: {
    id: string;
    key: string;
  }): Promise<void> {
    await this.db
      .update(cmsMedia)
      .set({ replacementCleanupKey: null })
      .where(
        and(
          eq(cmsMedia.id, input.id),
          eq(cmsMedia.replacementCleanupKey, input.key),
        ),
      );
  }

  /** Abandon a reservation that can no longer be finalized (for example after
   * a concurrent metadata edit). The exact-key condition leaves a newer
   * reservation untouched. */
  async clearReplacementStaging(input: {
    id: string;
    key: string;
  }): Promise<void> {
    await this.db
      .update(cmsMedia)
      .set({ replacementStagingKey: null })
      .where(
        and(
          eq(cmsMedia.id, input.id),
          eq(cmsMedia.replacementStagingKey, input.key),
        ),
      );
  }

  /** A new master was stored but lost the optimistic-concurrency race. Track
   * it as cleanup work before releasing the now-consumed staging key. */
  async moveReplacementToCleanup(input: {
    id: string;
    stagingKey: string;
    cleanupKey: string;
  }): Promise<boolean> {
    const rows = await this.db
      .update(cmsMedia)
      .set({
        replacementStagingKey: null,
        replacementCleanupKey: input.cleanupKey,
      })
      .where(
        and(
          eq(cmsMedia.id, input.id),
          eq(cmsMedia.replacementStagingKey, input.stagingKey),
        ),
      )
      .returning({ id: cmsMedia.id });
    return rows.length > 0;
  }

  async findById(id: string): Promise<MediaAsset | null> {
    const row = await this.db.query.cmsMedia.findFirst({
      where: eq(cmsMedia.id, id),
    });
    return row ? toAsset(row) : null;
  }

  /** Batch resolution, for rendering a section list without an N+1 query. */
  async findManyByIds(ids: string[]): Promise<MediaAsset[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.query.cmsMedia.findMany({
      where: inArray(cmsMedia.id, ids),
    });
    return rows.map(toAsset);
  }

  /** The library grid. */
  async list(filter: MediaListFilter = {}): Promise<MediaAssetWithUsage[]> {
    const statuses = filter.statuses ?? ["ready"];
    const conditions = [
      inArray(cmsMedia.status, statuses),
      filter.collectionId === null
        ? isNull(cmsMedia.collectionId)
        : filter.collectionId
          ? eq(cmsMedia.collectionId, filter.collectionId)
          : undefined,
      filter.mimeTypes?.length
        ? inArray(cmsMedia.mimeType, filter.mimeTypes)
        : undefined,
      filter.search
        ? or(
            ilike(cmsMedia.displayName, `%${escapeLike(filter.search)}%`),
            ilike(cmsMedia.originalFilename, `%${escapeLike(filter.search)}%`),
            ilike(cmsMedia.defaultAlt, `%${escapeLike(filter.search)}%`),
          )
        : undefined,
      usageCondition(filter.usage),
    ].filter((c) => c !== undefined);

    const rows = await this.db
      .select({
        media: cmsMedia,
        usageCount: usageCountSql,
        portraitCount: portraitCountSql,
      })
      .from(cmsMedia)
      .where(and(...conditions))
      .orderBy(...orderFor(filter.sort))
      .limit(filter.limit ?? 200)
      .offset(filter.offset ?? 0);

    return rows.map((row) => ({
      ...toAsset(row.media),
      usageCount: Number(row.usageCount ?? 0),
      portraitCount: Number(row.portraitCount ?? 0),
    }));
  }

  /** Counts per virtual view, for the sidebar. One pass, so the numbers are
   * consistent with each other. */
  async counts(): Promise<{
    all: number;
    used: number;
    neverUsed: number;
    noLongerUsed: number;
    trashed: number;
    uncollected: number;
  }> {
    const [row] = await this.db
      .select({
        all: sql<number>`count(*) filter (where cms_media.status = 'ready')::int`,
        used: sql<number>`count(*) filter (where cms_media.status = 'ready' and ${stillInUse()})::int`,
        neverUsed: sql<number>`count(*) filter (where cms_media.status = 'ready' and cms_media.first_used_at is null and not ${stillInUse()})::int`,
        noLongerUsed: sql<number>`count(*) filter (where cms_media.status = 'ready' and cms_media.first_used_at is not null and not ${stillInUse()})::int`,
        trashed: sql<number>`count(*) filter (where cms_media.status = 'trashed')::int`,
        uncollected: sql<number>`count(*) filter (where cms_media.status = 'ready' and cms_media.collection_id is null)::int`,
      })
      .from(cmsMedia);
    return {
      all: Number(row?.all ?? 0),
      used: Number(row?.used ?? 0),
      neverUsed: Number(row?.neverUsed ?? 0),
      noLongerUsed: Number(row?.noLongerUsed ?? 0),
      trashed: Number(row?.trashed ?? 0),
      uncollected: Number(row?.uncollected ?? 0),
    };
  }

  /** Edit metadata under optimistic concurrency — same bargain as a page save:
   * the version is in the WHERE clause, so a stale edit changes zero rows and
   * is reported as a conflict instead of overwriting whatever landed. */
  async updateWithLock(input: {
    id: string;
    expectedLockVersion: number;
    actorId: string;
    now: Date;
    patch: MediaPatch;
  }): Promise<MediaAsset | null> {
    const { patch } = input;
    const [row] = await this.db
      .update(cmsMedia)
      .set({
        ...(patch.displayName !== undefined
          ? { displayName: patch.displayName }
          : {}),
        ...(patch.defaultAlt !== undefined
          ? { defaultAlt: patch.defaultAlt }
          : {}),
        ...(patch.decorative !== undefined
          ? { decorative: patch.decorative }
          : {}),
        ...(patch.attribution !== undefined
          ? { attribution: patch.attribution }
          : {}),
        ...(patch.collectionId !== undefined
          ? { collectionId: patch.collectionId }
          : {}),
        lockVersion: sql`${cmsMedia.lockVersion} + 1`,
        updatedBy: input.actorId,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(cmsMedia.id, input.id),
          eq(cmsMedia.lockVersion, input.expectedLockVersion),
        ),
      )
      .returning();
    return row ? toAsset(row) : null;
  }

  async lockVersionOf(id: string): Promise<number | null> {
    const row = await this.db.query.cmsMedia.findFirst({
      where: eq(cmsMedia.id, id),
      columns: { lockVersion: true },
    });
    return row?.lockVersion ?? null;
  }

  /** ready → trashed, and only from `ready` and only with no usage rows. Both
   * conditions are in the statement rather than checked before it, so a page
   * save landing concurrently cannot slip past them. */
  async trash(input: {
    id: string;
    actorId: string;
    now: Date;
  }): Promise<MediaAsset | null> {
    const [row] = await this.db
      .update(cmsMedia)
      .set({
        status: "trashed",
        trashedAt: input.now,
        trashedBy: input.actorId,
        updatedAt: input.now,
        lockVersion: sql`${cmsMedia.lockVersion} + 1`,
      })
      .where(
        and(
          eq(cmsMedia.id, input.id),
          eq(cmsMedia.status, "ready"),
          not(stillInUse()),
        ),
      )
      .returning();
    return row ? toAsset(row) : null;
  }

  /** `actorId` is nullable because the purge sweep restores too, and it runs on
   * a schedule with nobody behind it. Attributing that to a person would be a
   * lie in the audit trail. */
  async restore(input: {
    id: string;
    actorId: string | null;
    now: Date;
  }): Promise<MediaAsset | null> {
    const [row] = await this.db
      .update(cmsMedia)
      .set({
        status: "ready",
        trashedAt: null,
        trashedBy: null,
        updatedAt: input.now,
        updatedBy: input.actorId,
        lockVersion: sql`${cmsMedia.lockVersion} + 1`,
      })
      .where(
        and(
          eq(cmsMedia.id, input.id),
          inArray(cmsMedia.status, ["trashed", "purging"]),
        ),
      )
      .returning();
    return row ? toAsset(row) : null;
  }

  /** trashed → purging, and only when still unreferenced.
   *
   * This is the step that makes the whole design safe without row locking on
   * the page-save path: by the time it runs the asset has been unreferenced for
   * the entire grace period, and if a reference *has* appeared, zero rows match
   * and the caller restores instead of deleting bytes. */
  async markPurging(input: {
    id: string;
    actorId: string | null;
    now: Date;
  }): Promise<boolean> {
    const rows = await this.db
      .update(cmsMedia)
      .set({ status: "purging", updatedAt: input.now })
      .where(
        and(
          eq(cmsMedia.id, input.id),
          inArray(cmsMedia.status, ["trashed", "purging"]),
          not(stillInUse()),
        ),
      )
      .returning({ id: cmsMedia.id });
    return rows.length > 0;
  }

  /** purging → purged. The row stays as a tombstone: the id, the key it used to
   * occupy and who removed it are worth more than the space they take, and a
   * permalink can answer `410 Gone` rather than `404`. */
  async markPurged(input: {
    id: string;
    actorId: string | null;
    now: Date;
  }): Promise<void> {
    await this.db
      .update(cmsMedia)
      .set({
        status: "purged",
        purgedAt: input.now,
        purgedBy: input.actorId,
        updatedAt: input.now,
      })
      .where(eq(cmsMedia.id, input.id));
  }

  /** Reservations whose upload never finished. */
  async pendingBefore(cutoff: Date): Promise<MediaAsset[]> {
    const rows = await this.db.query.cmsMedia.findMany({
      where: and(
        eq(cmsMedia.status, "pending"),
        lt(cmsMedia.createdAt, cutoff),
      ),
    });
    return rows.map(toAsset);
  }

  /** Trashed past the grace period, plus anything left mid-purge by a storage
   * failure — both are work for the same sweep. */
  async purgeCandidates(cutoff: Date): Promise<MediaAsset[]> {
    const rows = await this.db.query.cmsMedia.findMany({
      where: or(
        and(eq(cmsMedia.status, "trashed"), lt(cmsMedia.trashedAt, cutoff)),
        eq(cmsMedia.status, "purging"),
      ),
    });
    return rows.map(toAsset);
  }

  /** Every key this table believes exists, for reconciliation against the
   * bucket. Includes staging keys: an abandoned upload is a real object. */
  async allKnownKeys(): Promise<
    {
      key: string;
      id: string;
      status: string;
      kind: "master" | "staging" | "cleanup";
    }[]
  > {
    const rows = await this.db
      .select({
        id: cmsMedia.id,
        status: cmsMedia.status,
        objectKey: cmsMedia.objectKey,
        stagingKey: cmsMedia.stagingKey,
        replacementStagingKey: cmsMedia.replacementStagingKey,
        replacementCleanupKey: cmsMedia.replacementCleanupKey,
      })
      .from(cmsMedia);
    return rows.flatMap((row) => [
      ...(row.objectKey
        ? [
            {
              key: row.objectKey,
              id: row.id,
              status: row.status,
              kind: "master" as const,
            },
          ]
        : []),
      ...[row.stagingKey, row.replacementStagingKey]
        .filter((key): key is string => Boolean(key))
        .map((key) => ({
          key,
          id: row.id,
          status: row.status,
          kind: "staging" as const,
        })),
      ...(row.replacementCleanupKey
        ? [
            {
              key: row.replacementCleanupKey,
              id: row.id,
              status: row.status,
              kind: "cleanup" as const,
            },
          ]
        : []),
    ]);
  }

  /** The internal key for an asset. Server-side only, and never mapped into
   * `MediaAsset`. */
  async objectKeysOf(id: string): Promise<{
    objectKey: string | null;
    stagingKey: string | null;
    replacementStagingKey: string | null;
    replacementCleanupKey: string | null;
  } | null> {
    const row = await this.db.query.cmsMedia.findFirst({
      where: eq(cmsMedia.id, id),
      columns: {
        objectKey: true,
        stagingKey: true,
        replacementStagingKey: true,
        replacementCleanupKey: true,
      },
    });
    return row ?? null;
  }

  async replacementCleanupCandidates(): Promise<{ id: string; key: string }[]> {
    const rows = await this.db
      .select({ id: cmsMedia.id, key: cmsMedia.replacementCleanupKey })
      .from(cmsMedia)
      .where(not(isNull(cmsMedia.replacementCleanupKey)));
    return rows.flatMap((row) =>
      row.key ? [{ id: row.id, key: row.key }] : [],
    );
  }

  async staleReplacementReservations(
    cutoff: Date,
  ): Promise<{ id: string; key: string }[]> {
    const rows = await this.db
      .select({ id: cmsMedia.id, key: cmsMedia.replacementStagingKey })
      .from(cmsMedia)
      .where(
        and(
          not(isNull(cmsMedia.replacementStagingKey)),
          lt(cmsMedia.updatedAt, cutoff),
        ),
      );
    return rows.flatMap((row) =>
      row.key ? [{ id: row.id, key: row.key }] : [],
    );
  }

  async findBySha256(sha256: string): Promise<MediaAsset[]> {
    const rows = await this.db.query.cmsMedia.findMany({
      where: and(eq(cmsMedia.sha256, sha256), eq(cmsMedia.status, "ready")),
    });
    return rows.map(toAsset);
  }

  // ── usage ───────────────────────────────────────────────────────────────

  /** Replace one revision's usage rows, and move the two "was it ever used"
   * timestamps forward.
   *
   * `coalesce`/`greatest` rather than assignment, because a full reconciliation
   * rebuilds this table from scratch and must never move those backwards or
   * null them out — that would turn every "ya no se usa" back into "nunca
   * usada" and lose the only signal that distinguishes them. */
  async replaceRevisionUsage(input: {
    revisionId: string;
    entries: UsageEntry[];
    now: Date;
  }): Promise<void> {
    await this.db
      .delete(cmsMediaUsage)
      .where(eq(cmsMediaUsage.revisionId, input.revisionId));
    if (input.entries.length === 0) return;

    await this.db.insert(cmsMediaUsage).values(
      input.entries.map((entry) => ({
        revisionId: input.revisionId,
        mediaId: entry.mediaId,
        placement: entry.placement,
        occurrences: entry.occurrences,
        locators: entry.locators,
        updatedAt: input.now,
      })),
    );

    // Bound as an ISO string with an explicit cast, not as a `Date`: inside a
    // raw fragment there is no column type to infer from, and postgres.js
    // refuses to serialize a bare Date parameter.
    const stamp = sql`${input.now.toISOString()}::timestamptz`;
    await this.db
      .update(cmsMedia)
      .set({
        firstUsedAt: sql`coalesce(${cmsMedia.firstUsedAt}, ${stamp})`,
        lastReferencedAt: sql`greatest(coalesce(${cmsMedia.lastReferencedAt}, ${stamp}), ${stamp})`,
      })
      .where(
        inArray(
          cmsMedia.id,
          input.entries.map((entry) => entry.mediaId),
        ),
      );
  }

  /** Drop every usage row. Only the reconciliation rebuild does this, inside a
   * transaction that immediately re-derives them. */
  async clearAllUsage(): Promise<void> {
    await this.db.delete(cmsMediaUsage);
  }

  /** Which *versions* reference an asset, grouped by the page they belong to —
   * the detail view's usage list, and the explanation behind a refused trash.
   *
   * The title comes from the revision rather than the page, because a
   * publication from March may well be called something else than the working
   * copy is now, and "used by the version titled X" is the sentence that helps.
   * `kind` travels with it so the screen can say whether the reference is a
   * live publication, a retained one, the working copy or a checkpoint —
   * "still in use" and "kept alive by a version nobody is reading" are very
   * different answers to «¿por qué no puedo borrarla?». */
  async usageOf(mediaId: string): Promise<MediaUsageRef[]> {
    const rows = await this.db
      .select({
        pageId: cmsPages.id,
        revisionId: cmsPageRevisions.id,
        kind: cmsPageRevisions.kind,
        publicationNumber: cmsPageRevisions.publicationNumber,
        section: cmsPages.section,
        slug: cmsPages.slug,
        title: cmsPageRevisions.title,
        status: cmsPages.status,
        placement: cmsMediaUsage.placement,
        occurrences: cmsMediaUsage.occurrences,
        // Whether this is the copy readers are actually being served. Computed
        // here rather than guessed at the screen: "the live article uses this"
        // and "a publication from March uses this" are the same row otherwise.
        isLive: sql<boolean>`${cmsPages.status} = 'published'
          and ${cmsPages.publishedRevisionId} = ${cmsPageRevisions.id}`,
      })
      .from(cmsMediaUsage)
      .innerJoin(
        cmsPageRevisions,
        eq(cmsPageRevisions.id, cmsMediaUsage.revisionId),
      )
      .innerJoin(cmsPages, eq(cmsPages.id, cmsPageRevisions.pageId))
      .where(eq(cmsMediaUsage.mediaId, mediaId))
      .orderBy(
        asc(cmsPages.section),
        asc(cmsPages.slug),
        asc(cmsPageRevisions.kind),
      );
    return rows.map((row) => ({
      ...row,
      kind: isRevisionKind(row.kind) ? row.kind : "checkpoint",
      placement: row.placement as MediaPlacement,
    }));
  }

  async isReferenced(mediaId: string): Promise<boolean> {
    const rows = await this.db
      .select({ one: sql`1` })
      .from(cmsMedia)
      .where(and(eq(cmsMedia.id, mediaId), stillInUse()))
      .limit(1);
    return rows.length > 0;
  }

  // ── collections ─────────────────────────────────────────────────────────

  async listCollections(): Promise<(MediaCollection & { count: number })[]> {
    const rows = await this.db
      .select({
        id: cmsMediaCollections.id,
        name: cmsMediaCollections.name,
        slug: cmsMediaCollections.slug,
        description: cmsMediaCollections.description,
        sortOrder: cmsMediaCollections.sortOrder,
        count: sql<number>`(
          select count(*)::int from cms_media media
          where media.collection_id = cms_media_collection.id
            and media.status = 'ready'
        )`,
      })
      .from(cmsMediaCollections)
      .orderBy(
        asc(cmsMediaCollections.sortOrder),
        asc(cmsMediaCollections.name),
      );
    return rows.map((row) => ({ ...row, count: Number(row.count ?? 0) }));
  }

  async insertCollection(input: {
    name: string;
    slug: string;
    description: string | null;
    actorId: string;
    now: Date;
  }): Promise<MediaCollection> {
    const [row] = await this.db
      .insert(cmsMediaCollections)
      .values({
        name: input.name,
        slug: input.slug,
        description: input.description,
        createdBy: input.actorId,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    return row;
  }

  async renameCollection(input: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    now: Date;
  }): Promise<MediaCollection | null> {
    const [row] = await this.db
      .update(cmsMediaCollections)
      .set({
        name: input.name,
        slug: input.slug,
        description: input.description,
        updatedAt: input.now,
      })
      .where(eq(cmsMediaCollections.id, input.id))
      .returning();
    return row ?? null;
  }

  /** Removing a collection is never destructive: the media reappear under «Sin
   * colección» because the foreign key sets null. */
  async deleteCollection(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(cmsMediaCollections)
      .where(eq(cmsMediaCollections.id, id))
      .returning({ id: cmsMediaCollections.id });
    return rows.length > 0;
  }

  async findCollectionBySlug(slug: string): Promise<MediaCollection | null> {
    const row = await this.db.query.cmsMediaCollections.findFirst({
      where: eq(cmsMediaCollections.slug, slug),
    });
    return row ?? null;
  }
}

function usageCondition(usage: MediaListFilter["usage"]) {
  switch (usage) {
    case "used":
      return stillInUse();
    case "never-used":
      return and(not(stillInUse()), isNull(cmsMedia.firstUsedAt));
    case "no-longer-used":
      return and(not(stillInUse()), not(isNull(cmsMedia.firstUsedAt)));
    default:
      return undefined;
  }
}

function orderFor(sort: MediaListFilter["sort"]) {
  switch (sort) {
    case "oldest":
      return [asc(cmsMedia.createdAt)];
    case "name":
      return [asc(cmsMedia.displayName)];
    case "largest":
      return [desc(cmsMedia.byteSize)];
    default:
      return [desc(cmsMedia.createdAt)];
  }
}

/** Escape the wildcards `ILIKE` gives meaning to, so a search box matches what
 * was typed. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export const cmsMediaStore = new CmsMediaStore();

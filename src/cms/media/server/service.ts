import "server-only";
import { CONTENT_SECTIONS } from "@/content-system/types";
import { canAuthor } from "../../auth/policy";
import {
  CmsConflictError,
  CmsForbiddenError,
  CmsMediaInUseError,
  CmsMediaPortraitInUseError,
  CmsMediaUnavailableError,
  CmsNotFoundError,
  CmsValidationError,
} from "../../server/errors";
import {
  revalidatePublicContent,
  type PublicCacheInvalidator,
} from "../../server/invalidation";
import type { CmsActor } from "../../types";
import type {
  MediaAsset,
  MediaCollection,
  MediaListFilter,
  MediaRef,
  MediaUsageRef,
} from "../types";
import {
  checkAltDecision,
  checkReservation,
  RESERVATION_TTL_MINUTES,
  type UploadRejection,
} from "../validation/upload";
import { CmsMediaStore, cmsMediaStore, type MediaPatch } from "./store";
import {
  isMediaStorageConfigured,
  mediaStorageProblem,
  presignUpload,
} from "./storage";
import {
  MediaUploadError,
  newReservationId,
  processStagedUpload,
  stagingKeyFor,
  storeMaster,
} from "./uploads";
import { purgeAsset } from "./purge";
import { CmsAuthorStore, cmsAuthorStore } from "../../authors/server/store";

// The CMS media service: the single entry point for every media operation,
// browser or MCP.
//
// Everything that decides *whether* something happens is here — the actor's
// authority, the upload guardrails, the alt-text rule, optimistic concurrency,
// and the trash gate. The store below only executes SQL and the storage adapter
// only moves bytes.
//
// One rule has no exception (cms.md): **nothing is deleted
// automatically.** Removing an image from a page rewrites that page's usage
// rows and does nothing else. The asset stays, surfaces under «ya no se usa»,
// and a person decides. There is no code path from a content edit to a deleted
// object.

export type ReserveUploadInput = {
  filename: string;
  contentType: string;
  byteSize: number;
  collectionId?: string | null;
};

export type ReservedUpload = {
  mediaId: string;
  uploadUrl: string;
  /** ISO. After this the presigned URL is dead and the reservation is swept. */
  expiresAt: string;
};

export type MediaDetail = {
  asset: MediaAsset;
  usage: MediaUsageRef[];
  /** Other ready assets with the same bytes. A warning, never a merge: two rows
   * with the same pixels are two independent objects on purpose. */
  duplicates: MediaAsset[];
  /** Authors whose portrait this is. A hold on the image that `usage` above
   * structurally cannot show, so the detail screen has to be told separately or
   * a refused deletion would have no visible cause. */
  portraitOf: { id: string; name: string }[];
};

const invalid = (rejection: UploadRejection) =>
  new CmsValidationError([
    { code: rejection.code, severity: "error", message: rejection.message },
  ]);

export class CmsMediaService {
  constructor(
    private readonly store: CmsMediaStore = cmsMediaStore,
    /** Injected so tests can pin timestamps. */
    private readonly clock: () => Date = () => new Date(),
    /** Only ever asked one question — "whose portrait is this?" — and only to
     * explain a refusal the store already made. The gate itself is a predicate
     * inside the removal statements, not a call from here. */
    private readonly authors: CmsAuthorStore = cmsAuthorStore,
    /** Injected rather than imported so a unit test can watch the decision
     * without a Next.js request context, which `revalidateTag` requires. */
    private readonly invalidate: PublicCacheInvalidator = revalidatePublicContent,
  ) {}

  // ── reads ───────────────────────────────────────────────────────────────
  //
  // No actor argument, and that is deliberate rather than an omission:
  // membership *is* the read grant, exactly as it is for pages, and there is no
  // per-asset ownership to weigh. Every caller reaches these through
  // `requireCmsMember`, which is where the grant is checked. Taking an actor
  // here and ignoring it would suggest a decision that is not being made.

  list(filter: MediaListFilter = {}) {
    return this.store.list(filter);
  }

  counts() {
    return this.store.counts();
  }

  listCollections() {
    return this.store.listCollections();
  }

  async get(id: string): Promise<MediaDetail> {
    const asset = await this.store.findById(id);
    if (!asset) throw new CmsNotFoundError(`Media ${id}`);
    const [usage, sameBytes, portraitOf] = await Promise.all([
      this.store.usageOf(id),
      asset.sha256
        ? this.store.findBySha256(asset.sha256)
        : Promise.resolve([]),
      this.authors.byPortrait([id]),
    ]);
    return {
      asset,
      usage,
      duplicates: sameBytes.filter((other) => other.id !== id),
      portraitOf: portraitOf.map(({ id: authorId, name }) => ({
        id: authorId,
        name,
      })),
    };
  }

  /** Batch-resolve ids to what a renderer needs. One query for a whole page or
   * section list, never one per image.
   *
   * Only `ready` assets resolve. A trashed or purged id returns nothing, and the
   * caller decides between a validation failure (in the CMS) and a placeholder
   * (on the public site) — neither should be decided here. */
  async resolve(ids: string[]): Promise<Map<string, MediaRef>> {
    const assets = await this.store.findManyByIds([...new Set(ids)]);
    const out = new Map<string, MediaRef>();
    for (const asset of assets) {
      if (asset.status !== "ready") continue;
      if (!asset.src || !asset.width || !asset.height || !asset.mimeType) {
        continue;
      }
      out.set(asset.id, {
        id: asset.id,
        src: asset.src,
        width: asset.width,
        height: asset.height,
        defaultAlt: asset.defaultAlt,
        decorative: asset.decorative,
        mimeType: asset.mimeType,
      });
    }
    return out;
  }

  // ── upload ──────────────────────────────────────────────────────────────

  /** Reserve an upload and hand back a short-lived presigned `PUT`.
   *
   * The `pending` row is committed *before* the URL exists. That ordering is
   * the invariant behind "no stray objects": every key that can possibly appear
   * in the bucket already has a row here, so an upload whose finalize call never
   * arrives is a row the sweep can find rather than an object nothing knows
   * about. */
  async reserveUpload(
    actor: CmsActor,
    input: ReserveUploadInput,
  ): Promise<ReservedUpload> {
    this.assertMayAuthor(actor);
    this.assertStorage();

    const rejection = checkReservation(input);
    if (rejection) throw invalid(rejection);

    const reservationId = newReservationId();
    const stagingKey = stagingKeyFor(reservationId);
    const now = this.clock();

    const pending = await this.store.insertPending({
      originalFilename: input.filename,
      displayName: titleFromFilename(input.filename),
      stagingKey,
      collectionId: input.collectionId ?? null,
      actorId: actor.userId,
      now,
    });

    const uploadUrl = await presignUpload({
      key: stagingKey,
      contentType: input.contentType,
      expiresInSeconds: RESERVATION_TTL_MINUTES * 60,
    });

    return {
      mediaId: pending.id,
      uploadUrl,
      expiresAt: new Date(
        now.getTime() + RESERVATION_TTL_MINUTES * 60_000,
      ).toISOString(),
    };
  }

  /** Validate what actually arrived, write the master, and make the row real.
   *
   * A failure here leaves the row `pending` rather than half-ready: the sweep
   * removes the staged bytes and the reservation, and the editor retries. */
  async completeUpload(
    actor: CmsActor,
    input: { mediaId: string },
  ): Promise<MediaAsset> {
    this.assertMayAuthor(actor);
    this.assertStorage();

    const asset = await this.store.findById(input.mediaId);
    if (!asset) throw new CmsNotFoundError(`Media ${input.mediaId}`);
    if (asset.status === "ready") return asset; // idempotent retry
    if (asset.status !== "pending") {
      throw new CmsNotFoundError(`Media ${input.mediaId}`);
    }

    const keys = await this.store.objectKeysOf(input.mediaId);
    if (!keys?.stagingKey) {
      throw new CmsNotFoundError(`Media ${input.mediaId}`);
    }

    let processed;
    try {
      processed = await processStagedUpload(keys.stagingKey);
    } catch (error) {
      if (error instanceof MediaUploadError) {
        throw invalid({ code: error.code, message: error.message });
      }
      throw error;
    }

    const objectKey = await storeMaster({
      mediaId: input.mediaId,
      stagingKey: keys.stagingKey,
      processed,
    });

    const ready = await this.store.finalize({
      id: input.mediaId,
      objectKey,
      mimeType: processed.mimeType,
      byteSize: processed.byteSize,
      width: processed.width,
      height: processed.height,
      sha256: processed.sha256,
      now: this.clock(),
    });
    if (!ready) throw new CmsNotFoundError(`Media ${input.mediaId}`);
    return ready;
  }

  // ── metadata ────────────────────────────────────────────────────────────

  /** Edit the library title, the default alt, the decorative flag, the credit
   * or the collection. Same optimistic concurrency as a page save. */
  async update(
    actor: CmsActor,
    input: {
      id: string;
      expectedLockVersion: number;
      patch: MediaPatch;
    },
  ): Promise<MediaAsset> {
    this.assertMayAuthor(actor);

    const current = await this.store.findById(input.id);
    if (!current) throw new CmsNotFoundError(`Media ${input.id}`);

    // Only when the edit touches the alt decision. A freshly uploaded image has
    // no alt yet — that is normal, and the rule that it must have one before it
    // reaches a reader belongs to publish validation, not to every unrelated
    // save. Demanding it here would make filing an image into a collection fail
    // for a reason that has nothing to do with collections.
    if (
      input.patch.defaultAlt !== undefined ||
      input.patch.decorative !== undefined
    ) {
      const rejection = checkAltDecision({
        defaultAlt: input.patch.defaultAlt ?? current.defaultAlt,
        decorative: input.patch.decorative ?? current.decorative,
      });
      if (rejection) throw invalid(rejection);
    }

    if (
      input.patch.displayName !== undefined &&
      !input.patch.displayName.trim()
    ) {
      throw invalid({
        code: "media.no-name",
        message: "El nombre no puede quedar vacío.",
      });
    }

    const saved = await this.store.updateWithLock({
      id: input.id,
      expectedLockVersion: input.expectedLockVersion,
      actorId: actor.userId,
      now: this.clock(),
      patch: input.patch,
    });
    if (!saved) {
      throw new CmsConflictError(
        input.id,
        input.expectedLockVersion,
        await this.store.lockVersionOf(input.id),
      );
    }
    // Two of these five fields reach readers: `defaultAlt` and `decorative` are
    // the whole of what `MediaRef` carries beyond the bytes
    // (`@/content-system/media/repository`), and the bytes themselves are
    // immutable — a replaced image is a new id at a new URL. The other three
    // are library bookkeeping no visitor ever sees, so filing an image into a
    // collection must not cost a regeneration.
    if (
      input.patch.defaultAlt !== undefined ||
      input.patch.decorative !== undefined
    ) {
      this.expirePublicCache();
    }
    return saved;
  }

  // ── removal ─────────────────────────────────────────────────────────────

  /** Move an unused asset to the trash. Reversible for the whole grace period;
   * no bytes move.
   *
   * The "unused" condition is in the UPDATE's WHERE clause, not checked before
   * it, so a page save landing at the same moment cannot slip past. The usage
   * list is fetched only to *explain* a refusal. */
  async trash(actor: CmsActor, input: { id: string }): Promise<MediaAsset> {
    this.assertMayAuthor(actor);

    const current = await this.store.findById(input.id);
    if (!current) throw new CmsNotFoundError(`Media ${input.id}`);

    const trashed = await this.store.trash({
      id: input.id,
      actorId: actor.userId,
      now: this.clock(),
    });
    if (trashed) return trashed;

    const usage = await this.store.usageOf(input.id);
    if (usage.length > 0) throw new CmsMediaInUseError(usage);
    // The other way an image can be held. No page mentions it, so the usage
    // list above is empty and says nothing useful — the remedy is in Autores,
    // and the message has to say so or the refusal looks like a bug.
    const portraits = await this.authors.byPortrait([input.id]);
    if (portraits.length > 0) throw new CmsMediaPortraitInUseError(portraits);
    // Not referenced and still refused: the status moved under us.
    throw new CmsNotFoundError(`Media ${input.id}`);
  }

  async restore(actor: CmsActor, input: { id: string }): Promise<MediaAsset> {
    this.assertMayAuthor(actor);
    const restored = await this.store.restore({
      id: input.id,
      actorId: actor.userId,
      now: this.clock(),
    });
    if (!restored) throw new CmsNotFoundError(`Media ${input.id}`);
    return restored;
  }

  /** «Eliminar definitivamente» — skip the rest of the grace period.
   *
   * Deliberately available: an editor who has just uploaded the wrong file
   * should not have to wait a month, and the confirmation says what it does. It
   * runs exactly the same guarded sequence as the scheduled sweep, including the
   * final usage re-check, so an asset that gained a reference is restored rather
   * than emptied. */
  async purgeNow(actor: CmsActor, input: { id: string }): Promise<void> {
    this.assertMayAuthor(actor);
    const current = await this.store.findById(input.id);
    if (!current) throw new CmsNotFoundError(`Media ${input.id}`);
    if (current.status !== "trashed" && current.status !== "purging") {
      throw invalid({
        code: "media.not-trashed",
        message:
          "Solo se puede eliminar definitivamente algo que ya está en la papelera.",
      });
    }
    const outcome = await purgeAsset({
      id: input.id,
      actorId: actor.userId,
      store: this.store,
      now: this.clock(),
    });
    if (outcome === "restored") {
      const portraits = await this.authors.byPortrait([input.id]);
      if (portraits.length > 0) throw new CmsMediaPortraitInUseError(portraits);
      throw new CmsMediaInUseError(await this.store.usageOf(input.id));
    }
  }

  // ── collections ─────────────────────────────────────────────────────────

  async createCollection(
    actor: CmsActor,
    input: { name: string; description?: string | null },
  ): Promise<MediaCollection> {
    this.assertMayAuthor(actor);
    const name = input.name.trim();
    if (!name) {
      throw invalid({
        code: "media.collection-name",
        message: "La colección necesita un nombre.",
      });
    }
    const slug = collectionSlug(name);
    if (await this.store.findCollectionBySlug(slug)) {
      throw invalid({
        code: "media.collection-exists",
        message: `Ya existe una colección llamada «${name}».`,
      });
    }
    return this.store.insertCollection({
      name,
      slug,
      description: input.description?.trim() || null,
      actorId: actor.userId,
      now: this.clock(),
    });
  }

  async renameCollection(
    actor: CmsActor,
    input: { id: string; name: string; description?: string | null },
  ): Promise<MediaCollection> {
    this.assertMayAuthor(actor);
    const name = input.name.trim();
    if (!name) {
      throw invalid({
        code: "media.collection-name",
        message: "La colección necesita un nombre.",
      });
    }
    const slug = collectionSlug(name);
    const clash = await this.store.findCollectionBySlug(slug);
    if (clash && clash.id !== input.id) {
      throw invalid({
        code: "media.collection-exists",
        message: `Ya existe una colección llamada «${name}».`,
      });
    }
    const saved = await this.store.renameCollection({
      id: input.id,
      name,
      slug,
      description: input.description?.trim() || null,
      now: this.clock(),
    });
    if (!saved) throw new CmsNotFoundError(`Collection ${input.id}`);
    return saved;
  }

  /** Never destructive: the foreign key sets null, so the images reappear under
   * «Sin colección». */
  async deleteCollection(actor: CmsActor, id: string): Promise<void> {
    this.assertMayAuthor(actor);
    const removed = await this.store.deleteCollection(id);
    if (!removed) throw new CmsNotFoundError(`Collection ${id}`);
  }

  // ── guards ──────────────────────────────────────────────────────────────

  private assertMayAuthor(actor: CmsActor): void {
    if (!canAuthor(actor)) throw new CmsForbiddenError("editar medios");
  }

  private assertStorage(): void {
    if (!isMediaStorageConfigured()) {
      throw new CmsMediaUnavailableError(mediaStorageProblem()!);
    }
  }

  /** An image's alt text reaches readers through every page that embeds it and
   * through the portrait of every author who uses it — across all four
   * sections, with no page of its own to expire. Same answer as the author
   * service, and for the same reason: there is no one section to name.
   *
   * Asking `usageOf` which sections actually embed it would be narrower, but it
   * would also miss the portrait case and would put a join on the path of every
   * alt-text fix to save regenerations of pages that, having not changed, are
   * not re-stored anyway.
   *
   * Best-effort, like the other two: the row is already committed, so a failed
   * expiry is logged rather than reported as a failed save. */
  private expirePublicCache(): void {
    for (const section of CONTENT_SECTIONS) {
      try {
        this.invalidate(section);
      } catch (cause) {
        console.error("[cms] media cache invalidation failed:", cause);
      }
    }
  }
}

/** A first library title, from the uploaded filename: drop the extension, turn
 * separators into spaces, and capitalize. Editable immediately — this only has
 * to be better than `IMG_0042.JPEG`. */
export function titleFromFilename(filename: string): string {
  const stem = filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!stem) return "Imagen";
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

export function collectionSlug(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "coleccion"
  );
}

export const cmsMediaService = new CmsMediaService();

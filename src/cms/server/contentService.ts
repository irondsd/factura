import "server-only";
import type { Database } from "@/db";
import {
  type ContentDocument,
  type ContentSection,
  type ContentStatus,
  type ContentSummary,
  type ValidationResult,
} from "@/content-system/types";
import { checkHierarchy, type HierarchyNode } from "@/content-system/hierarchy";
import { canRender } from "@/content-system/repository/visibility";
import { parseMetadata } from "@/content-system/metadata/schema";
import { canAuthor, canPublish } from "../auth/policy";
import {
  type ComparableDocument,
  type DocumentDiff,
  diffDocuments,
  documentsEqual,
} from "../diff";
import {
  checkpointIsStale,
  type PageVersions,
  RETAINED_PUBLICATIONS,
  type RevisionKind,
  type VersionEntry,
} from "../revisions";
import { actorLabel } from "../history";
import { planRename, RENAME_CODES } from "../rename";
import type { CmsActor } from "../types";
import { documentOf } from "./documents";
import {
  CmsConflictError,
  CmsForbiddenError,
  CmsNoWorkingCopyError,
  CmsNotDeletableError,
  CmsNotFoundError,
  CmsRevisionNotFoundError,
  CmsSlugTakenError,
  CmsValidationError,
} from "./errors";
import {
  isContentEdit,
  levelForSave,
  nextPublishedAt,
  stampsContentUpdatedAt,
  statusChangeAffectsPublicCache,
  WIP_VALIDATION_LEVEL,
  type ValidationLevel,
} from "./lifecycle";
import {
  type PublicCacheInvalidator,
  revalidatePublicContent,
} from "./invalidation";
import {
  CmsPageHistoryStore,
  cmsPageHistoryStore as defaultHistoryStore,
} from "./historyStore";
import {
  type AuthoredDocument,
  authoredFrom,
  authoredOf,
  CmsRevisionStore,
  cmsRevisionStore as defaultRevisionStore,
  type RevisionRecord,
} from "./revisionStore";
import {
  type CmsListFilter,
  type CmsPageRecord,
  CmsPageStore,
  cmsPageStore as defaultStore,
} from "./store";

// The CMS content service: the single entry point for every content mutation,
// whether it arrives from the browser or from the CMS MCP (cms.md —
// "The MCP must not be a second direct database implementation").
//
// Everything that decides *whether* a write happens is here: the actor's
// authority, the validation level the destination demands, the optimistic
// concurrency check, and the timestamp bookkeeping. The two stores below it
// only execute SQL.
//
// Since revisions (cms.md) this module also owns the lifecycle between
// copies: which revision a save writes, when a checkpoint rotates, what
// publishing promotes and prunes, and which of the four page pointers moves.
// Those decisions are the feature, and none of them is expressible as a query.
//
// ── the transaction shape every mutation uses ──────────────────────────────
//
// Each one claims the page first — `updateWithLock` with the version the caller
// is holding — and only then inserts, repoints and deletes. Two reasons, and
// both matter:
//
//   * zero rows updated is the conflict check, atomic by construction; and
//   * a matched UPDATE takes a row lock that is held to commit, so everything
//     after it is serialized against a second editor doing the same thing.
//
// The claim also *clears* every pointer whose revision this operation is about
// to replace or delete, because those foreign keys are `restrict`: a revision
// cannot be deleted while the page still names it, and the partial unique
// indexes mean the replacement cannot be inserted while the old row is still
// there. Clear, delete, insert, repoint — in that order, once per operation.

/** How content is checked. Phase 4 supplies the real implementation; the
 * service takes it as a dependency rather than importing one, so there is no
 * default that quietly permits everything and no way to construct a service
 * that skips validation by accident. */
export type ContentValidator = (input: {
  document: ContentDocument;
  level: ValidationLevel;
}) => Promise<ValidationResult> | ValidationResult;

/** How a stored revision's media usage is recorded (cms.md).
 *
 * Injected rather than imported so the service does not depend on the media
 * library — the CMS still works with no media storage configured, and the
 * lifecycle tests do not need a media schema. It is handed the *transaction*
 * that is writing the revision, because usage rows must land with the copy that
 * produced them: a revision that committed while its usage rows did not would
 * leave an image looking unused while a retained version points at it.
 *
 * Keyed by revision, not by page: that is what makes a retained publication
 * keep its images alive after the page has moved on (cms.md). */
export type MediaUsageRecorder = (input: {
  revision: { id: string; bodyMdx: string; metadata: unknown };
  now: Date;
  tx: Database;
}) => Promise<void>;

/** The default: record nothing. A CMS without the media library behaves exactly
 * as it did before, rather than failing to save. */
const noMediaUsage: MediaUsageRecorder = async () => {};

export type CreateContentInput = {
  section: ContentSection;
  slug: string;
  title: string;
  titleTag?: string | null;
  description: string;
  summary: string;
  cta: string;
  canonicalSlug?: string | null;
  body: string;
  metadata: unknown;
  /** Where the page sits in the section's tree. Every section has this; a
   * section whose pages are all top level simply never sets it. */
  parentId?: string | null;
  sortOrder?: number;
  crumb?: string | null;
};

export type ContentPatch = {
  title?: string;
  titleTag?: string | null;
  description?: string;
  summary?: string;
  cta?: string;
  canonicalSlug?: string | null;
  body?: string;
  metadata?: unknown;
  parentId?: string | null;
  sortOrder?: number;
  crumb?: string | null;
};

export type UpdateContentInput = {
  id: string;
  expectedLockVersion: number;
  patch: ContentPatch;
};

/** What a working-copy save answers with (cms.md). The document as
 * stored, plus which copy it landed in and when — an agent that saved needs to
 * know it wrote the WIP and not the live page. */
export type WipSaveResult = {
  document: ContentDocument;
  wipRevisionId: string;
  wipUpdatedAt: string;
  /** True when this save created the working copy rather than updating it. */
  created: boolean;
};

/** Everything the editor header and the MCP's `get_content` need to say what
 * state a page is in without a second round trip. */
export type CmsPageState = {
  document: ContentDocument;
  status: ContentStatus;
  lockVersion: number;
  hasWip: boolean;
  wipRevisionId: string | null;
  wipUpdatedAt: string | null;
  /** The publication or preview the working copy was started from. */
  wipBasedOnRevisionId: string | null;
  publishedRevisionId: string | null;
  publishedAt: string | null;
  previewRevisionId: string | null;
  /** The public preview exists and the working copy has been saved since it was
   * promoted — so what a shared link shows is older than what the editor sees. */
  previewIsStale: boolean;
  checkpointRevisionId: string | null;
  publicationCount: number;
};

export type PublishResult = {
  document: ContentDocument;
  status: ContentStatus;
  lockVersion: number;
  /** The publication created, or null when nothing needed publishing. */
  publicationNumber: number | null;
  /** True when the working copy matched the live publication exactly, so no
   * duplicate publication was manufactured (cms.md). */
  noChange: boolean;
};

/** What a rename answers with: the page as it now stands, plus what moved and
 * which addresses were preserved — an editor is owed both, because a rename
 * can move pages they were not looking at. */
export type RenameResult = {
  document: ContentDocument;
  lockVersion: number;
  moves: { from: string; to: string }[];
  redirects: string[];
};

export type VersionComparison = {
  /** Null when the page has never been published — there is nothing to compare
   * against, and the tab says so rather than diffing against emptiness. */
  baseline: {
    revisionId: string;
    label: string;
    at: string;
    isLive: boolean;
  } | null;
  candidate: {
    revisionId: string;
    kind: RevisionKind;
    label: string;
    at: string;
  };
  diff: DocumentDiff | null;
};

/** Stand-in id for a page that does not exist yet, so the hierarchy rules can
 * be checked before the insert rather than after. It can never collide with a
 * real row: ids are UUIDs. */
const PENDING_ID = "pending";

/** A page column's timestamp in the ISO form everything above the store speaks
 * (`mapping.ts`). Only the rename planner needs one straight off a page record,
 * which is why it is a line here rather than a shared helper. */
const pageIso = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

export class CmsContentService {
  constructor(
    private readonly validate: ContentValidator,
    private readonly store: CmsPageStore = defaultStore,
    /** Where every stored copy of a document lives. */
    private readonly revisions: CmsRevisionStore = defaultRevisionStore,
    /** Where the «Historial» tab's activity rows come from. Injected like the
     * stores so a test can watch what a mutation records without a database. */
    private readonly history: CmsPageHistoryStore = defaultHistoryStore,
    /** Injected so tests can pin timestamps. */
    private readonly clock: () => Date = () => new Date(),
    /** How the public cache is expired after a write the public can see.
     * Injected like the rest so a unit test can observe the decision without a
     * Next.js request context. */
    private readonly invalidate: PublicCacheInvalidator = revalidatePublicContent,
    /** See `MediaUsageRecorder`. */
    private readonly recordMediaUsage: MediaUsageRecorder = noMediaUsage,
  ) {}

  /** The CMS list — every status. Membership is the read grant; there is no
   * per-page ownership in iteration 1. */
  list(
    _actor: CmsActor,
    filter: CmsListFilter = {},
  ): Promise<ContentSummary[]> {
    return this.store.list(filter);
  }

  /** The document the CMS shows: the working copy if there is one, otherwise
   * the baseline an editor would start from. */
  async get(_actor: CmsActor, id: string): Promise<ContentDocument> {
    const page = await this.store.findById(id);
    if (!page) throw new CmsNotFoundError(`Page ${id}`);
    return page;
  }

  /** The same document plus the lifecycle around it. What the editor route and
   * the MCP's `get_content` both read, so «hay borrador guardado» is one
   * answer rather than two implementations of it. */
  async getState(_actor: CmsActor, id: string): Promise<CmsPageState> {
    const page = await this.store.findPage(id);
    if (!page) throw new CmsNotFoundError(`Page ${id}`);
    const revision = await this.selectedRevision(page);
    const [wip, preview, publications] = await Promise.all([
      page.wipRevisionId ? this.revisions.byId(page.wipRevisionId) : null,
      page.previewRevisionId
        ? this.revisions.byId(page.previewRevisionId)
        : null,
      this.revisions.publications(id),
    ]);

    return {
      document: documentOf(page, revision),
      status: page.status,
      lockVersion: page.lockVersion,
      hasWip: wip !== null,
      wipRevisionId: wip?.id ?? null,
      wipUpdatedAt: wip ? wip.updatedAt.toISOString() : null,
      wipBasedOnRevisionId: wip?.basedOnRevisionId ?? null,
      publishedRevisionId: page.publishedRevisionId,
      publishedAt: page.publishedAt ? page.publishedAt.toISOString() : null,
      previewRevisionId: page.previewRevisionId,
      previewIsStale: previewIsStale(preview, wip),
      checkpointRevisionId: page.checkpointRevisionId,
      publicationCount: publications.length,
    };
  }

  /** Create a page. Always `draft` (cms.md): a new page is never born
   * public, and an agent that wants one published has to ask for the transition
   * explicitly and pass the publish gate.
   *
   * The initial document becomes the page's working copy, which is why creating
   * one *does* write a revision while merely opening an editor does not
   * (cms.md): a create carries a complete document, an open carries nothing. */
  async create(
    actor: CmsActor,
    input: CreateContentInput,
  ): Promise<ContentDocument> {
    this.assertMayAuthor(actor);

    const existing = await this.store.findPageBySlug(input.section, input.slug);
    if (existing) throw new CmsSlugTakenError(input.section, input.slug);

    const metadata = this.checkedMetadata(input.section, input.metadata);

    await this.assertHierarchy({
      id: PENDING_ID,
      section: input.section,
      slug: input.slug,
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder ?? 0,
    });

    const now = this.clock();
    const draft = await this.store.transaction(async (store, tx) => {
      const page = await store.insertPage({
        section: input.section,
        slug: input.slug,
        status: "draft",
        actorId: actor.userId,
        now,
      });
      const revisions = this.revisions.bind(tx);
      const wip = await revisions.insert({
        pageId: page.id,
        kind: "wip",
        document: authoredFrom(
          {
            body: input.body,
            title: input.title,
            titleTag: input.titleTag ?? null,
            description: input.description,
            summary: input.summary,
            cta: input.cta,
            canonicalSlug: input.canonicalSlug ?? null,
            metadata,
            parentId: input.parentId ?? null,
            sortOrder: input.sortOrder ?? 0,
            crumb: input.crumb ?? null,
          },
          now,
        ),
        actorId: actor.userId,
        now,
      });
      // `setPointers`, not `updateWithLock`: the row was inserted by this same
      // transaction and is already locked by that insert, so there is no
      // version to check — and bumping it here would hand the editor a
      // brand-new page already at version 2, which reads as "somebody has
      // edited this" everywhere the number is shown.
      await store.setPointers({
        id: page.id,
        patch: { wipRevisionId: wip.id },
      });
      // A page always wins over a redirect (`rename`). Creating one at an
      // address something used to redirect away from is the other way that
      // situation arises, and it is resolved the same way.
      await store.dropRedirects(input.section, [input.slug]);
      await this.recordUsage(tx, wip, now);
      return documentOf({ ...page, wipRevisionId: wip.id }, wip);
    });

    await this.record(actor, { pageId: draft.id, action: "created", now });

    // Validated after the insert, not before: a draft is allowed to be
    // incomplete (cms.md), and the diagnostics are for the editor to see, not a
    // gate. `validateOnly` is how a caller asks the question without writing.
    return draft;
  }

  /** Save the working copy (cms.md).
   *
   * Never touches a public copy, whatever state the page is in — which is why
   * it is checked at draft level and expires no cache. The first save on a page
   * whose WIP was consumed by a publication lazily creates a new one from the
   * baseline the editor was looking at, and records which revision that was. */
  async update(
    actor: CmsActor,
    input: UpdateContentInput,
  ): Promise<WipSaveResult> {
    this.assertMayAuthor(actor);

    const page = await this.store.findPage(input.id);
    if (!page) throw new CmsNotFoundError(`Page ${input.id}`);
    // Reported from the row already in hand, before validation: a stale save is
    // not going to land whatever its content says, and "someone else edited
    // this" is more actionable than a list of rules. The atomic check inside
    // the transaction still guards the race between this read and the write.
    if (page.lockVersion !== input.expectedLockVersion) {
      await this.reportConflict(input.id, input.expectedLockVersion);
    }

    const existingWip = page.wipRevisionId
      ? await this.revisions.byId(page.wipRevisionId)
      : null;
    const baseline = existingWip ?? (await this.baselineRevision(page));
    if (!baseline) throw new CmsNotFoundError(`Page ${input.id}`);

    // Before anything else that could write: a metadata blob the row → document
    // mapper cannot read back is not a validation failure the editor can see
    // later, it is a row that exists and cannot be loaded — by the list, by
    // this editor, or by the public repository. Checked here, on the way in,
    // where refusing is still cheap.
    const metadata =
      input.patch.metadata !== undefined
        ? this.checkedMetadata(
            page.section as ContentSection,
            input.patch.metadata,
          )
        : undefined;

    const current = documentOf(page, baseline);
    const next = {
      ...current,
      ...input.patch,
      ...(metadata !== undefined ? { metadata } : {}),
    } as ContentDocument;

    // Placement is checked before content: a page in the wrong place in the
    // tree is a broken URL and a broken breadcrumb whatever its prose says, and
    // this is also what stops a page being re-parented onto its own descendant.
    await this.assertHierarchy({
      id: page.id,
      section: page.section as ContentSection,
      slug: page.slug,
      parentId: next.parentId,
      sortOrder: next.sortOrder,
    });

    await this.assertValid(next, WIP_VALIDATION_LEVEL);

    const now = this.clock();
    const document = authoredFrom(
      { ...next, metadata: next.metadata },
      // A content edit moves the editorial timestamp the reader will see once
      // this is published; a save that changed nothing leaves it alone.
      isContentEdit(input.patch) ? now : baseline.contentUpdatedAt,
    );

    const saved = await this.store.transaction(async (store, tx) => {
      const revisions = this.revisions.bind(tx);

      // 24-hour compression (cms.md), decided before the claim so the claim
      // can clear the checkpoint pointer in the same statement.
      const checkpoint = page.checkpointRevisionId
        ? await revisions.byId(page.checkpointRevisionId)
        : null;
      const rotate =
        existingWip !== null &&
        checkpointIsStale(checkpoint?.createdAt ?? null, now);

      const claimed = await store.updateWithLock({
        id: page.id,
        expectedLockVersion: input.expectedLockVersion,
        actorId: actor.userId,
        now,
        patch: rotate ? { checkpointRevisionId: null } : {},
      });
      if (!claimed) return null;

      let checkpointId = page.checkpointRevisionId;
      if (rotate && existingWip) {
        if (checkpoint) await revisions.deleteMany([checkpoint.id]);
        const copy = await revisions.insert({
          pageId: page.id,
          kind: "checkpoint",
          document: authoredOf(existingWip),
          basedOnRevisionId: existingWip.basedOnRevisionId,
          // The checkpoint is a copy of somebody's WIP, not a thing this actor
          // wrote — attributing it to whoever happened to trigger the rotation
          // would put the wrong name on «antes de esta sesión».
          createdBy: existingWip.createdBy,
          actorId: existingWip.updatedBy,
          now,
        });
        checkpointId = copy.id;
      }

      const wip = existingWip
        ? await revisions.updateWip({
            id: existingWip.id,
            document,
            actorId: actor.userId,
            now,
          })
        : await revisions.insert({
            pageId: page.id,
            kind: "wip",
            document,
            basedOnRevisionId: baseline.id,
            actorId: actor.userId,
            now,
          });
      if (!wip) throw new Error("working copy vanished mid-save");

      await store.setPointers({
        id: page.id,
        patch: { wipRevisionId: wip.id, checkpointRevisionId: checkpointId },
      });
      await this.recordUsage(tx, wip, now);
      return {
        document: documentOf({ ...claimed, wipRevisionId: wip.id }, wip),
        wipRevisionId: wip.id,
        wipUpdatedAt: wip.updatedAt.toISOString(),
        created: existingWip === null,
      };
    });
    if (!saved) await this.reportConflict(input.id, input.expectedLockVersion);

    await this.record(actor, { pageId: input.id, action: "saved", now });
    // No cache invalidation, ever. See `saveAffectsPublicCache`.
    return saved as WipSaveResult;
  }

  /** Publish the working copy (cms.md). One transaction: validate,
   * snapshot, repoint, clear the work, prune to three previous publications. */
  async publish(
    actor: CmsActor,
    input: { id: string; expectedLockVersion: number },
  ): Promise<PublishResult> {
    const page = await this.store.findPage(input.id);
    if (!page) throw new CmsNotFoundError(`Page ${input.id}`);
    if (page.lockVersion !== input.expectedLockVersion) {
      await this.reportConflict(input.id, input.expectedLockVersion);
    }
    if (!canPublish(actor)) throw new CmsForbiddenError("publicar contenido");

    const wip = page.wipRevisionId
      ? await this.revisions.byId(page.wipRevisionId)
      : null;
    const live = page.publishedRevisionId
      ? await this.revisions.byId(page.publishedRevisionId)
      : null;

    // Republishing a page that was taken down, with nothing new written since:
    // re-expose the retained publication rather than manufacture a copy of it
    // (cms.md). Editorial dates do not move — the article was not rewritten.
    if (!wip) {
      if (!live) throw new CmsNoWorkingCopyError("publicar");
      return this.reexpose(actor, page, live, input.expectedLockVersion);
    }

    const candidate = documentOf(page, wip);
    await this.assertValid({ ...candidate, status: "published" }, "publish");

    // Publishing a working copy identical to what is already live would file a
    // second publication saying nothing, consume a retention slot and move the
    // publication number. Refused, with the WIP left in place: removing it is
    // «Descartar borrador», a separate decision.
    if (live && page.status === "published" && documentsEqual(live, wip)) {
      return {
        document: documentOf(page, live),
        status: page.status,
        lockVersion: page.lockVersion,
        publicationNumber: live.publicationNumber,
        noChange: true,
      };
    }

    const now = this.clock();
    const result = await this.store.transaction(async (store, tx) => {
      const revisions = this.revisions.bind(tx);
      const claimed = await store.updateWithLock({
        id: page.id,
        expectedLockVersion: input.expectedLockVersion,
        actorId: actor.userId,
        now,
        patch: {
          status: "published",
          publishedAt: nextPublishedAt(page.publishedAt, "published", now),
          // Everything this operation consumes, released in the claim so the
          // deletes below are not refused by the `restrict` foreign keys.
          wipRevisionId: null,
          checkpointRevisionId: null,
          previewRevisionId: null,
        },
      });
      if (!claimed) return null;

      // A working copy identical to the last publication on a page that is not
      // currently published: re-expose that publication and consume the WIP,
      // rather than file a duplicate.
      if (live && documentsEqual(live, wip)) {
        await revisions.deleteMany(
          [wip.id, page.checkpointRevisionId, page.previewRevisionId].filter(
            (id): id is string => id !== null,
          ),
        );
        await store.setPointers({
          id: page.id,
          patch: { publishedRevisionId: live.id },
        });
        return {
          document: documentOf(claimed, live),
          status: "published" as ContentStatus,
          lockVersion: claimed.lockVersion,
          publicationNumber: live.publicationNumber,
          noChange: true,
        };
      }

      const publicationNumber = await revisions.nextPublicationNumber(page.id);
      const publication = await revisions.insert({
        pageId: page.id,
        kind: "published",
        document: authoredOf({
          ...wip,
          // At the moment of first publication the content is current by
          // definition, and a `contentUpdatedAt` earlier than `publishedAt`
          // reads as "updated before it existed". Only ever on the first.
          contentUpdatedAt: stampsContentUpdatedAt(
            page.publishedAt,
            "published",
          )
            ? now
            : wip.contentUpdatedAt,
        }),
        basedOnRevisionId: wip.basedOnRevisionId,
        publicationNumber,
        publishedAt: now,
        createdBy: wip.createdBy,
        actorId: actor.userId,
        now,
      });

      await store.setPointers({
        id: page.id,
        patch: { publishedRevisionId: publication.id },
      });

      // The work this publication consumed, plus a public preview that is now
      // behind the live page.
      await revisions.deleteMany(
        [wip.id, page.checkpointRevisionId, page.previewRevisionId].filter(
          (id): id is string => id !== null,
        ),
      );

      // Retention (cms.md): the new publication plus three previous. Never the
      // one the page now points at — checked rather than assumed, because a
      // retention bug that pruned the live revision would take the page off the
      // site with the publication that was supposed to put it there.
      const publications = await revisions.publications(page.id);
      const prune = publications
        .slice(RETAINED_PUBLICATIONS + 1)
        .filter((revision) => revision.id !== publication.id);
      await revisions.deleteMany(prune.map((revision) => revision.id));

      await this.recordUsage(tx, publication, now);
      return {
        document: documentOf(claimed, publication),
        status: "published" as ContentStatus,
        lockVersion: claimed.lockVersion,
        publicationNumber: publication.publicationNumber,
        noChange: false,
      };
    });
    if (!result) await this.reportConflict(input.id, input.expectedLockVersion);
    const published = result as PublishResult;

    await this.record(actor, {
      pageId: input.id,
      action: "status",
      fromStatus: page.status,
      toStatus: "published",
      now,
    });
    this.expirePublicCache(page.section as ContentSection);
    return published;
  }

  /** Promote the working copy to the shareable public preview (cms.md).
   *
   * The snapshot is immutable: later saves stay private until this is run
   * again. That is the difference between a link an editor can send someone and
   * a window onto whatever they are typing. */
  async promotePreview(
    actor: CmsActor,
    input: { id: string; expectedLockVersion: number },
  ): Promise<ContentDocument> {
    this.assertMayAuthor(actor);
    const page = await this.store.findPage(input.id);
    if (!page) throw new CmsNotFoundError(`Page ${input.id}`);
    if (page.lockVersion !== input.expectedLockVersion) {
      await this.reportConflict(input.id, input.expectedLockVersion);
    }

    // The working copy is what a promotion promotes. A published page with no
    // WIP is being *moved* into preview rather than previewed, and the copy to
    // freeze is the one already live — otherwise the URL would have nothing to
    // serve the moment it stopped being published.
    const source = page.wipRevisionId
      ? await this.revisions.byId(page.wipRevisionId)
      : await this.baselineRevision(page);
    if (!source) throw new CmsNoWorkingCopyError("la vista previa pública");

    const candidate = documentOf(page, source);
    await this.assertValid({ ...candidate, status: "preview" }, "preview");

    const now = this.clock();
    const promoted = await this.store.transaction(async (store, tx) => {
      const revisions = this.revisions.bind(tx);
      const claimed = await store.updateWithLock({
        id: page.id,
        expectedLockVersion: input.expectedLockVersion,
        actorId: actor.userId,
        now,
        patch: { status: "preview", previewRevisionId: null },
      });
      if (!claimed) return null;

      if (page.previewRevisionId) {
        await revisions.deleteMany([page.previewRevisionId]);
      }
      const preview = await revisions.insert({
        pageId: page.id,
        kind: "preview",
        document: authoredOf(source),
        basedOnRevisionId: source.basedOnRevisionId,
        createdBy: source.createdBy,
        actorId: actor.userId,
        now,
      });
      await store.setPointers({
        id: page.id,
        patch: { previewRevisionId: preview.id },
      });
      await this.recordUsage(tx, preview, now);
      return documentOf({ ...claimed, previewRevisionId: preview.id }, preview);
    });
    if (!promoted)
      await this.reportConflict(input.id, input.expectedLockVersion);

    await this.record(actor, {
      pageId: input.id,
      action: "preview_promoted",
      fromStatus: page.status,
      toStatus: "preview",
      now,
    });
    this.expirePublicCache(page.section as ContentSection);
    return promoted as ContentDocument;
  }

  /** Take a page out of public view — unpublish, or walk a preview back
   * (cms.md).
   *
   * Never blocked by validation. This is the lever an editor reaches for when
   * something is wrong with a live page, and gating it on the page being valid
   * would mean the pages most in need of it are the ones that cannot be taken
   * down. The last published pointer is retained, so republishing is one click
   * and creates no duplicate. */
  async unpublish(
    actor: CmsActor,
    input: { id: string; expectedLockVersion: number },
  ): Promise<ContentDocument> {
    const page = await this.store.findPage(input.id);
    if (!page) throw new CmsNotFoundError(`Page ${input.id}`);
    if (page.lockVersion !== input.expectedLockVersion) {
      await this.reportConflict(input.id, input.expectedLockVersion);
    }
    if (page.status === "published" && !canPublish(actor)) {
      throw new CmsForbiddenError("despublicar contenido");
    }
    this.assertMayAuthor(actor);
    if (page.status === "draft") return this.get(actor, input.id);

    const now = this.clock();
    const result = await this.store.transaction(async (store, tx) => {
      const revisions = this.revisions.bind(tx);
      const claimed = await store.updateWithLock({
        id: page.id,
        expectedLockVersion: input.expectedLockVersion,
        actorId: actor.userId,
        now,
        // The preview snapshot exists to be served at a public URL; once the
        // page is a draft there is no such URL, and keeping the copy would only
        // pin the images it references.
        patch: { status: "draft", previewRevisionId: null },
      });
      if (!claimed) return null;
      if (page.previewRevisionId) {
        await revisions.deleteMany([page.previewRevisionId]);
      }
      const revision = await this.selectedRevision(claimed, revisions);
      return documentOf(claimed, revision);
    });
    if (!result) await this.reportConflict(input.id, input.expectedLockVersion);

    await this.record(actor, {
      pageId: input.id,
      action: "status",
      fromStatus: page.status,
      toStatus: "draft",
      now,
    });
    if (statusChangeAffectsPublicCache(page.status, "draft")) {
      this.expirePublicCache(page.section as ContentSection);
    }
    return result as ContentDocument;
  }

  /** The lifecycle move as one call, for callers that speak in destinations
   * rather than operations — the browser's status buttons and the MCP's
   * `set_content_status`.
   *
   * A thin dispatch on purpose: `status: "published"` must never be a way to
   * expose a mutable working copy, so it goes through the same `publish` that
   * snapshots and prunes. */
  async setStatus(
    actor: CmsActor,
    input: { id: string; status: ContentStatus; expectedLockVersion: number },
  ): Promise<ContentDocument> {
    switch (input.status) {
      case "published":
        return (await this.publish(actor, input)).document;
      case "preview":
        return this.promotePreview(actor, input);
      case "draft":
        return this.unpublish(actor, input);
    }
  }

  /** Throw away the working copy and its checkpoint (cms.md).
   *
   * Changes no public pointer and no status: the page keeps serving exactly
   * what it was serving, and the editor reloads onto that baseline. */
  async discardWip(
    actor: CmsActor,
    input: { id: string; expectedLockVersion: number },
  ): Promise<ContentDocument> {
    this.assertMayAuthor(actor);
    const page = await this.store.findPage(input.id);
    if (!page) throw new CmsNotFoundError(`Page ${input.id}`);
    if (page.lockVersion !== input.expectedLockVersion) {
      await this.reportConflict(input.id, input.expectedLockVersion);
    }
    if (!page.wipRevisionId) throw new CmsNoWorkingCopyError("descartar");
    // Discarding the only copy a page has would leave it unreadable — that is
    // «Eliminar esta página», which has its own guards and its own confirmation.
    if (!page.publishedRevisionId && !page.previewRevisionId) {
      throw new CmsNotDeletableError(
        "Esta página solo existe como borrador: descartar el borrador la dejaría sin contenido. Elimina la página si eso es lo que quieres.",
      );
    }

    const now = this.clock();
    const result = await this.store.transaction(async (store, tx) => {
      const revisions = this.revisions.bind(tx);
      const claimed = await store.updateWithLock({
        id: page.id,
        expectedLockVersion: input.expectedLockVersion,
        actorId: actor.userId,
        now,
        patch: { wipRevisionId: null, checkpointRevisionId: null },
      });
      if (!claimed) return null;
      await revisions.deleteMany(
        [page.wipRevisionId, page.checkpointRevisionId].filter(
          (id): id is string => id !== null,
        ),
      );
      const revision = await this.selectedRevision(claimed, revisions);
      return documentOf(claimed, revision);
    });
    if (!result) await this.reportConflict(input.id, input.expectedLockVersion);

    await this.record(actor, { pageId: input.id, action: "discarded", now });
    return result as ContentDocument;
  }

  /** Copy a retained version back into the working copy (cms.md).
   *
   * Private, always: it changes no status, no public pointer and no cache. A
   * restore that published would make "look at what this used to say" a
   * dangerous click. The pre-restore working copy becomes the checkpoint even
   * if the 24-hour window has not elapsed, so the restore itself is undoable. */
  async restoreVersion(
    actor: CmsActor,
    input: { id: string; revisionId: string; expectedLockVersion: number },
  ): Promise<WipSaveResult> {
    this.assertMayAuthor(actor);
    const page = await this.store.findPage(input.id);
    if (!page) throw new CmsNotFoundError(`Page ${input.id}`);
    if (page.lockVersion !== input.expectedLockVersion) {
      await this.reportConflict(input.id, input.expectedLockVersion);
    }

    const source = await this.revisions.byId(input.revisionId);
    // Same page, and not the working copy itself — restoring the WIP onto the
    // WIP is a no-op that would still rotate the checkpoint and lose the very
    // state it was protecting.
    if (!source || source.pageId !== page.id || source.kind === "wip") {
      throw new CmsRevisionNotFoundError();
    }

    const now = this.clock();
    const restored: AuthoredDocument = {
      ...authoredOf(source),
      contentUpdatedAt: now,
    };
    const candidate = { ...documentOf(page, source), status: page.status };
    await this.assertHierarchy({
      id: page.id,
      section: page.section as ContentSection,
      slug: page.slug,
      parentId: restored.parentId,
      sortOrder: restored.sortOrder,
    });
    await this.assertValid(candidate, WIP_VALIDATION_LEVEL);

    const existingWip = page.wipRevisionId
      ? await this.revisions.byId(page.wipRevisionId)
      : null;

    const result = await this.store.transaction(async (store, tx) => {
      const revisions = this.revisions.bind(tx);
      const claimed = await store.updateWithLock({
        id: page.id,
        expectedLockVersion: input.expectedLockVersion,
        actorId: actor.userId,
        now,
        patch: existingWip ? { checkpointRevisionId: null } : {},
      });
      if (!claimed) return null;

      let checkpointId = page.checkpointRevisionId;
      if (existingWip) {
        if (page.checkpointRevisionId) {
          await revisions.deleteMany([page.checkpointRevisionId]);
        }
        const copy = await revisions.insert({
          pageId: page.id,
          kind: "checkpoint",
          document: authoredOf(existingWip),
          basedOnRevisionId: existingWip.basedOnRevisionId,
          createdBy: existingWip.createdBy,
          actorId: existingWip.updatedBy,
          now,
        });
        checkpointId = copy.id;
      }

      const wip = existingWip
        ? await revisions.updateWip({
            id: existingWip.id,
            document: restored,
            basedOnRevisionId: source.id,
            actorId: actor.userId,
            now,
          })
        : await revisions.insert({
            pageId: page.id,
            kind: "wip",
            document: restored,
            basedOnRevisionId: source.id,
            actorId: actor.userId,
            now,
          });
      if (!wip) throw new Error("working copy vanished mid-restore");

      await store.setPointers({
        id: page.id,
        patch: { wipRevisionId: wip.id, checkpointRevisionId: checkpointId },
      });
      await this.recordUsage(tx, wip, now);
      return {
        document: documentOf({ ...claimed, wipRevisionId: wip.id }, wip),
        wipRevisionId: wip.id,
        wipUpdatedAt: wip.updatedAt.toISOString(),
        created: existingWip === null,
      };
    });
    if (!result) await this.reportConflict(input.id, input.expectedLockVersion);

    await this.record(actor, { pageId: input.id, action: "restored", now });
    return result as WipSaveResult;
  }

  /** The bounded list of versions a page holds, newest first (cms.md). */
  async listVersions(_actor: CmsActor, id: string): Promise<PageVersions> {
    const page = await this.store.findPage(id);
    if (!page) throw new CmsNotFoundError(`Page ${id}`);

    const revisions = await this.revisions.listForPage(id);
    const actors = await this.history.actorsById(
      revisions.flatMap((revision) =>
        revision.updatedBy ? [revision.updatedBy] : [],
      ),
    );

    const entry = (revision: RevisionRecord): VersionEntry => ({
      revisionId: revision.id,
      kind: revision.kind,
      publicationNumber: revision.publicationNumber,
      at: (revision.publishedAt ?? revision.updatedAt).toISOString(),
      who: actorLabel(
        (revision.updatedBy && actors.get(revision.updatedBy)) || null,
      ),
      // Provenance is on the activity row, not on the revision; the tab reads
      // it from there rather than duplicating a column that would have to be
      // kept in agreement with it.
      source: null,
      isLive:
        page.status === "published" && page.publishedRevisionId === revision.id,
      isPublicPreview: page.previewRevisionId === revision.id,
      title: revision.title,
    });

    const byKind = (kind: RevisionKind) =>
      revisions.filter((revision) => revision.kind === kind);
    const publications = byKind("published").sort(
      (a, b) => (b.publicationNumber ?? 0) - (a.publicationNumber ?? 0),
    );

    const [wip] = byKind("wip");
    const [checkpoint] = byKind("checkpoint");
    const [preview] = byKind("preview");

    const versions = [
      ...(wip ? [entry(wip)] : []),
      ...(checkpoint ? [entry(checkpoint)] : []),
      ...(preview ? [entry(preview)] : []),
      ...publications.map(entry),
    ];

    return {
      pageId: id,
      status: page.status,
      versions,
      baselineRevisionId: page.publishedRevisionId,
      baselineIsLive:
        page.status === "published" && page.publishedRevisionId !== null,
      previewIsStale: previewIsStale(preview ?? null, wip ?? null),
    };
  }

  /** One stored version, as a document. Used by the history tab's preview and
   * by the MCP's `get_content_version`. */
  async getVersion(
    _actor: CmsActor,
    input: { id: string; revisionId: string },
  ): Promise<ContentDocument> {
    const document = await this.store.findAtRevision(
      input.id,
      input.revisionId,
    );
    if (!document) throw new CmsRevisionNotFoundError();
    return document;
  }

  /** Compare a candidate against the one baseline: the live publication, or the
   * last one when the page is not currently published (cms.md).
   *
   * `revisionId` picks the candidate; omitting it means the working copy, which
   * is the comparison an editor actually wants. There is no second selector —
   * see the note at the top of `../diff`. */
  async compareVersion(
    _actor: CmsActor,
    input: { id: string; revisionId?: string },
  ): Promise<VersionComparison> {
    const page = await this.store.findPage(input.id);
    if (!page) throw new CmsNotFoundError(`Page ${input.id}`);

    const candidate = input.revisionId
      ? await this.revisions.byId(input.revisionId)
      : page.wipRevisionId
        ? await this.revisions.byId(page.wipRevisionId)
        : await this.baselineRevision(page);
    if (!candidate || candidate.pageId !== page.id) {
      throw new CmsRevisionNotFoundError();
    }

    const baseline = page.publishedRevisionId
      ? await this.revisions.byId(page.publishedRevisionId)
      : null;

    const asComparable = (revision: RevisionRecord): ComparableDocument => ({
      body: revision.body,
      title: revision.title,
      titleTag: revision.titleTag,
      description: revision.description,
      summary: revision.summary,
      cta: revision.cta,
      canonicalSlug: revision.canonicalSlug,
      parentId: revision.parentId,
      sortOrder: revision.sortOrder,
      crumb: revision.crumb,
      metadata: revision.metadata,
    });

    return {
      baseline: baseline
        ? {
            revisionId: baseline.id,
            label:
              page.status === "published"
                ? `Publicación ${baseline.publicationNumber} · en línea`
                : `Última versión publicada (${baseline.publicationNumber})`,
            at: (baseline.publishedAt ?? baseline.updatedAt).toISOString(),
            isLive: page.status === "published",
          }
        : null,
      candidate: {
        revisionId: candidate.id,
        kind: candidate.kind,
        label: candidateLabel(candidate),
        at: (candidate.publishedAt ?? candidate.updatedAt).toISOString(),
      },
      diff:
        baseline && baseline.id !== candidate.id
          ? diffDocuments(asComparable(baseline), asComparable(candidate))
          : null,
    };
  }

  /** Move a page's public address, preserving the old one (cms.md).
   *
   * Not a content edit and not part of a save: the slug is on the page row
   * rather than on a revision, so a rename takes effect the moment it commits —
   * for the *live* page, whatever the working copy says. That is why it is its
   * own method with its own confirmation rather than a field in the metadata
   * form, and why it expires the public cache while an ordinary save does not.
   *
   * Three things happen together or not at all:
   *
   *  1. The page moves, and every descendant moves with it — `slug` is the full
   *     path, so a hub's children are part of its address.
   *  2. Every vacated path that was ever public becomes a redirect to the page
   *     that left it. The row points at the *page*, so the next rename does not
   *     have to rewrite it and a chain can never form.
   *  3. Any redirect standing at a destination is dropped: a live page always
   *     wins over a redirect, which is what makes loops impossible rather than
   *     merely unlikely.
   */
  async rename(
    actor: CmsActor,
    input: { id: string; expectedLockVersion: number; slug: string },
  ): Promise<RenameResult> {
    this.assertMayAuthor(actor);

    const page = await this.store.findPage(input.id);
    if (!page) throw new CmsNotFoundError(`Page ${input.id}`);
    if (page.lockVersion !== input.expectedLockVersion) {
      await this.reportConflict(input.id, input.expectedLockVersion);
    }

    const section = page.section as ContentSection;
    const siblings = await this.store.list({ section });
    const planned = planRename(
      { id: page.id, slug: page.slug, publishedAt: pageIso(page.publishedAt) },
      input.slug,
      siblings.filter((s) => s.id !== page.id),
    );
    if (!planned.ok) {
      // A taken address is the one problem with its own error class, because
      // the editor and the MCP both already know how to say it.
      const taken = planned.problems.find(
        (problem) => problem.code === RENAME_CODES.taken,
      );
      if (taken) throw new CmsSlugTakenError(section, input.slug);
      throw new CmsValidationError(
        planned.problems.map((problem) => ({
          code: problem.code,
          severity: "error" as const,
          message: problem.message,
          field: "slug",
        })),
      );
    }
    const { plan } = planned;
    const target = plan.moves[0].to;

    // The tree, checked against the section as it would be *after* the move:
    // a page whose parent is set still has to sit under that parent's path, and
    // the parent may itself be moving in this same plan.
    const moved = new Map(plan.moves.map((move) => [move.id, move.to]));
    const document = await this.store.findById(page.id);
    if (!document) throw new CmsNotFoundError(`Page ${input.id}`);
    await this.assertHierarchyAmong(
      {
        id: page.id,
        section,
        slug: target,
        parentId: document.parentId,
        sortOrder: document.sortOrder,
      },
      siblings
        .filter((s) => s.id !== page.id)
        .map((s) => ({
          id: s.id,
          section: s.section,
          slug: moved.get(s.id) ?? s.slug,
          parentId: s.parentId,
          sortOrder: s.sortOrder,
        })),
    );

    const now = this.clock();
    const done = await this.store.transaction(async (store) => {
      const claimed = await store.updateWithLock({
        id: page.id,
        expectedLockVersion: input.expectedLockVersion,
        actorId: actor.userId,
        now,
        patch: { slug: target },
      });
      if (!claimed) return null;

      for (const move of plan.moves.slice(1)) {
        await store.moveSlug({
          id: move.id,
          slug: move.to,
          actorId: actor.userId,
          now,
        });
      }

      // Destinations first: the page may be taking back an address it once
      // redirected away from, and the unique index would refuse the insert.
      await store.dropRedirects(section, plan.redirectsToDrop);
      for (const move of plan.moves) {
        if (!move.redirect) continue;
        await store.addRedirects({
          section,
          slugs: [move.from],
          pageId: move.id,
          actorId: actor.userId,
          now,
        });
      }
      return claimed;
    });
    if (!done) await this.reportConflict(input.id, input.expectedLockVersion);
    const claimed = done as CmsPageRecord;

    await this.record(actor, { pageId: page.id, action: "renamed", now });

    // Both addresses change for a reader at once — the new one starts
    // resolving, the old one starts redirecting — and the section's listings,
    // sitemap and feed all carry the moved path. A page nobody can see yet has
    // nothing cached to expire.
    if (
      plan.moves.some((move) => move.redirect) ||
      canRender(page.status, "public")
    ) {
      this.expirePublicCache(section);
    }

    const revision = await this.selectedRevision(claimed);
    return {
      document: documentOf(claimed, revision),
      lockVersion: claimed.lockVersion,
      moves: plan.moves.map(({ from, to }) => ({ from, to })),
      redirects: plan.redirectsToAdd,
    };
  }

  /** Delete a page for good.
   *
   * The only destructive operation in the CMS, and the guards are what keep the
   * reasoning behind "archive by status" intact rather than discarding it
   * (cms.md):
   *
   * - **Drafts only.** A published or previewed page has a public URL and, for
   *   up to an hour, a cached copy that outlives the row. Unpublishing first is
   *   one extra click and it makes "this is live" and "this is gone" two
   *   separate decisions.
   * - **No children.** The foreign key is `restrict`, so the database would
   *   refuse anyway; this is the version that can say how many pages hang off
   *   this one instead of surfacing a constraint name.
   * - **The lock version, like any other write.** A page someone else has been
   *   editing is not deleted out from under them.
   *
   * Every retained version goes with it — working copy, checkpoint, public
   * preview and all four publications — which is why the confirmation says so
   * and the CMS MCP does not expose this at all. */
  async delete(
    actor: CmsActor,
    input: { id: string; expectedLockVersion: number },
  ): Promise<void> {
    this.assertMayAuthor(actor);

    const page = await this.store.findPage(input.id);
    if (!page) throw new CmsNotFoundError(`Page ${input.id}`);
    if (page.lockVersion !== input.expectedLockVersion) {
      await this.reportConflict(input.id, input.expectedLockVersion);
    }

    if (page.status !== "draft") {
      throw new CmsNotDeletableError(
        "Solo se pueden eliminar borradores. Vuelve la página a borrador antes de eliminarla.",
      );
    }

    // Every *revision* that names this page as its parent, not only the
    // documents the CMS currently shows. The foreign key is `restrict` and it
    // is declared on the revision, so a retained publication from before a page
    // was re-parented would refuse the delete at the database with a constraint
    // name and nothing else. Asking the same question the constraint asks means
    // the answer can name the pages instead.
    const children = await this.store.pagesWithParent(page.id);
    if (children.length > 0) {
      throw new CmsNotDeletableError(
        children.length === 1
          ? "Otra página cuelga de esta, en su versión actual o en una guardada. Muévela o elimínala antes."
          : `Hay ${children.length} páginas que cuelgan de esta, en su versión actual o en alguna guardada. Muévelas o elimínalas antes.`,
      );
    }

    const now = this.clock();
    const deleted = await this.store.transaction(async (store) => {
      // The four pointers are `restrict`, so they are released before the row
      // that names them goes; the revisions themselves then cascade with it.
      const claimed = await store.updateWithLock({
        id: page.id,
        expectedLockVersion: input.expectedLockVersion,
        actorId: actor.userId,
        now,
        patch: {
          publishedRevisionId: null,
          previewRevisionId: null,
          wipRevisionId: null,
          checkpointRevisionId: null,
        },
      });
      if (!claimed) return false;
      await store.deleteById(page.id);
      return true;
    });
    if (!deleted)
      await this.reportConflict(input.id, input.expectedLockVersion);
  }

  /** Validate without writing — the Validation tab, and the MCP's
   * `validate_content`. Takes the *working copy* plus an optional patch so an
   * editor can ask "would this be accepted?" before saving or publishing. */
  async validateOnly(
    _actor: CmsActor,
    input: {
      id: string;
      patch?: ContentPatch;
      level?: ValidationLevel;
    },
  ): Promise<ValidationResult> {
    const current = await this.store.findById(input.id);
    if (!current) throw new CmsNotFoundError(`Page ${input.id}`);
    const level = input.level ?? levelForSave(current.status);
    const document = {
      ...current,
      ...input.patch,
      // At publish level the candidate is measured as the page's prospective
      // *public* document, so a page still in draft is checked against the
      // rules it will have to meet rather than the ones it has now (cms.md).
      ...(level === "publish" ? { status: "published" as ContentStatus } : {}),
    } as ContentDocument;
    return this.validate({ document, level });
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /** The revision a CMS read of this page follows. Throws rather than returning
   * null: a page with no readable revision is damage, not a state.
   *
   * `revisions` is a parameter rather than `this.revisions` because callers
   * inside a transaction must pass the transaction-bound store. The pool the
   * tests run against holds one connection, so a read on the outer handle from
   * inside a transaction does not merely bypass it — it deadlocks, waiting for
   * a connection the transaction is holding.
   */
  private async selectedRevision(
    page: CmsPageRecord,
    revisions: CmsRevisionStore = this.revisions,
  ): Promise<RevisionRecord> {
    const id =
      page.wipRevisionId ?? page.publishedRevisionId ?? page.previewRevisionId;
    const revision = id ? await revisions.byId(id) : null;
    if (!revision) {
      throw new CmsNotFoundError(`Page ${page.id} has no readable revision`);
    }
    return revision;
  }

  /** What a new working copy would start from: the last publication, or the
   * public preview when the page has never been published. */
  private async baselineRevision(
    page: CmsPageRecord,
  ): Promise<RevisionRecord | null> {
    const id = page.publishedRevisionId ?? page.previewRevisionId;
    return id ? this.revisions.byId(id) : null;
  }

  /** Put a retained publication back in front of readers without writing a new
   * one (cms.md). */
  private async reexpose(
    actor: CmsActor,
    page: CmsPageRecord,
    live: RevisionRecord,
    expectedLockVersion: number,
  ): Promise<PublishResult> {
    if (page.status === "published") {
      return {
        document: documentOf(page, live),
        status: page.status,
        lockVersion: page.lockVersion,
        publicationNumber: live.publicationNumber,
        noChange: true,
      };
    }

    const now = this.clock();
    const result = await this.store.transaction(async (store, tx) => {
      const revisions = this.revisions.bind(tx);
      const claimed = await store.updateWithLock({
        id: page.id,
        expectedLockVersion,
        actorId: actor.userId,
        now,
        patch: {
          status: "published",
          publishedAt: nextPublishedAt(page.publishedAt, "published", now),
          previewRevisionId: null,
        },
      });
      if (!claimed) return null;
      if (page.previewRevisionId) {
        await revisions.deleteMany([page.previewRevisionId]);
      }
      return {
        document: documentOf(claimed, live),
        status: "published" as ContentStatus,
        lockVersion: claimed.lockVersion,
        publicationNumber: live.publicationNumber,
        noChange: true,
      };
    });
    if (!result) await this.reportConflict(page.id, expectedLockVersion);

    await this.record(actor, {
      pageId: page.id,
      action: "status",
      fromStatus: page.status,
      toStatus: "published",
      now,
    });
    this.expirePublicCache(page.section as ContentSection);
    return result as PublishResult;
  }

  private recordUsage(
    tx: Database,
    revision: RevisionRecord,
    now: Date,
  ): Promise<void> {
    return this.recordMediaUsage({
      revision: {
        id: revision.id,
        bodyMdx: revision.body,
        metadata: revision.metadata,
      },
      now,
      tx,
    });
  }

  /** Write one activity row for a mutation that already succeeded.
   *
   * Best-effort, and deliberately so: the write it describes is committed by
   * the time this runs, so a failure here cannot be reported as a failed save
   * without lying to the editor about what is in the database. A missing line
   * in «Historial» is the smaller loss — the *versions* are the recoverable
   * history, and they are written inside the transaction — and the console says
   * when it happens.
   *
   * Called after every accepted mutation rather than from the browser actions,
   * so the CMS MCP records the same trail without a second implementation
   * (cms.md). Deletes record nothing: the row's events go with it. */
  private async record(
    actor: CmsActor,
    input: {
      pageId: string;
      action:
        | "created"
        | "saved"
        | "status"
        | "restored"
        | "discarded"
        | "preview_promoted"
        | "renamed";
      fromStatus?: ContentStatus;
      toStatus?: ContentStatus;
      now: Date;
    },
  ): Promise<void> {
    try {
      await this.history.record({
        ...input,
        actorId: actor.userId,
        source: actor.source ?? "browser",
      });
    } catch (cause) {
      console.error("[cms] history insert failed:", cause);
    }
  }

  /** Expire the public cache for a section after a write the public can see.
   *
   * Best-effort for the same reason `record` is: the write it follows is
   * already committed, and telling an editor their publication failed because a
   * cache tag could not be expired would be a lie about what is in the
   * database. */
  private expirePublicCache(section: ContentSection): void {
    try {
      this.invalidate(section);
    } catch (cause) {
      console.error("[cms] public cache invalidation failed:", cause);
    }
  }

  /** Enforce the one invariant that keeps `slug` and `parentId` in agreement,
   * plus the tree's own rules (no cycles, no cross-section parents, no orphaned
   * intermediate paths). Uniform for every section — this is the alternative to
   * a per-section branch in the editor, the list and the breadcrumb. */
  private async assertHierarchy(node: HierarchyNode): Promise<void> {
    const siblings = await this.store.list({
      section: node.section as ContentSection,
    });
    await this.assertHierarchyAmong(
      node,
      siblings
        .filter((s) => s.id !== node.id)
        .map((s) => ({
          id: s.id,
          section: s.section,
          slug: s.slug,
          parentId: s.parentId,
          sortOrder: s.sortOrder,
        })),
    );
  }

  /** The same check against a section the caller has already assembled — which
   * a rename has to, because the tree it must be valid in is the one *after*
   * the move, and that section does not exist in the database yet. */
  private async assertHierarchyAmong(
    node: HierarchyNode,
    others: readonly HierarchyNode[],
  ): Promise<void> {
    const problems = checkHierarchy(node, others);
    if (problems.length > 0) {
      throw new CmsValidationError(
        problems.map((p) => ({
          code: p.code,
          severity: "error" as const,
          message: p.message,
          field: "parentId",
        })),
      );
    }
  }

  /** Refuse a write by an actor whose role may not author.
   *
   * Every role may today, so this never fires — which is exactly why it has to
   * exist. `canAuthor` is presented as a one-line policy toggle, and a toggle
   * with no call site is one that will be narrowed later and silently change
   * nothing. */
  private assertMayAuthor(actor: CmsActor): void {
    if (!canAuthor(actor)) throw new CmsForbiddenError("editar contenido");
  }

  /** Parse a metadata blob against its section's schema, or refuse the write.
   *
   * Deliberately *not* part of the validation levels: a draft is allowed to be
   * incomplete (cms.md), so its metadata is not held to the editorial rules — but
   * it still has to be the right shape to store, because the mapper that reads
   * a row back applies this same schema and throws when it fails. Everything
   * downstream of a write assumes a row can be read; this is what makes that
   * true. Returns the parsed value, which is what gets stored. */
  private checkedMetadata(section: ContentSection, value: unknown): unknown {
    const parsed = parseMetadata(section, value);
    if (parsed.ok) return parsed.data;
    throw new CmsValidationError(
      parsed.problems.map((problem) => ({
        code: "metadata.shape",
        severity: "error" as const,
        message: `${problem.field || "metadata"}: ${problem.message}`,
        field: problem.field || undefined,
      })),
    );
  }

  private async assertValid(
    document: ContentDocument,
    level: ValidationLevel,
  ): Promise<void> {
    const result = await this.validate({ document, level });
    if (!result.ok) throw new CmsValidationError(result.diagnostics);
  }

  /** Turn a zero-row update into a conflict that names the version actually in
   * the database, so the editor can be offered a reload rather than a shrug.
   * Always throws. */
  private async reportConflict(id: string, expected: number): Promise<never> {
    throw new CmsConflictError(
      id,
      expected,
      await this.store.lockVersionOf(id),
    );
  }
}

/** Is the shareable preview behind the working copy? Only meaningful when both
 * exist: without a preview there is no stale link, and without a WIP nothing
 * has moved since it was promoted. */
function previewIsStale(
  preview: RevisionRecord | null,
  wip: RevisionRecord | null,
): boolean {
  if (!preview || !wip) return false;
  return wip.updatedAt.getTime() > preview.createdAt.getTime();
}

function candidateLabel(revision: RevisionRecord): string {
  switch (revision.kind) {
    case "wip":
      return "Borrador de trabajo";
    case "checkpoint":
      return "Antes de esta sesión";
    case "preview":
      return "Vista previa pública";
    case "published":
      return `Publicación ${revision.publicationNumber}`;
  }
}

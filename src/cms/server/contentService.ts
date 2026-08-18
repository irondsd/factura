import "server-only";
import {
  type ContentDocument,
  type ContentSection,
  type ContentStatus,
  type ContentSummary,
  type ValidationResult,
} from "@/content-system/types";
import { checkHierarchy, type HierarchyNode } from "@/content-system/hierarchy";
import { canPublish } from "../auth/policy";
import type { CmsActor } from "../types";
import {
  CmsConflictError,
  CmsForbiddenError,
  CmsNotFoundError,
  CmsSlugTakenError,
  CmsValidationError,
} from "./errors";
import {
  isContentEdit,
  levelForSave,
  levelForTransition,
  nextPublishedAt,
  stampsContentUpdatedAt,
  type ValidationLevel,
} from "./lifecycle";
import {
  type CmsListFilter,
  CmsPageStore,
  cmsPageStore as defaultStore,
} from "./store";

// The CMS content service: the single entry point for every content mutation,
// whether it arrives from the browser or from the CMS MCP (cms.md §2.2 —
// "The MCP must not be a second direct database implementation").
//
// Everything that decides *whether* a write happens is here: the actor's
// authority, the validation level the destination demands, the optimistic
// concurrency check, and the timestamp bookkeeping. The store below it only
// executes SQL.

/** How content is checked. Phase 4 supplies the real implementation; the
 * service takes it as a dependency rather than importing one, so there is no
 * default that quietly permits everything and no way to construct a service
 * that skips validation by accident. */
export type ContentValidator = (input: {
  document: ContentDocument;
  level: ValidationLevel;
}) => Promise<ValidationResult> | ValidationResult;

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

export type UpdateContentInput = {
  id: string;
  expectedLockVersion: number;
  patch: {
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
};

/** Stand-in id for a page that does not exist yet, so the hierarchy rules can
 * be checked before the insert rather than after. It can never collide with a
 * real row: ids are UUIDs. */
const PENDING_ID = "pending";

export class CmsContentService {
  constructor(
    private readonly validate: ContentValidator,
    private readonly store: CmsPageStore = defaultStore,
    /** Injected so tests can pin timestamps. */
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** The CMS list — every status. Membership is the read grant; there is no
   * per-page ownership in iteration 1. */
  list(
    _actor: CmsActor,
    filter: CmsListFilter = {},
  ): Promise<ContentSummary[]> {
    return this.store.list(filter);
  }

  async get(_actor: CmsActor, id: string): Promise<ContentDocument> {
    const page = await this.store.findById(id);
    if (!page) throw new CmsNotFoundError(`Page ${id}`);
    return page;
  }

  /** Create a page. Always `draft` (cms.md §8): a new page is never born
   * public, and an agent that wants one published has to ask for the transition
   * explicitly and pass the publish gate. */
  async create(
    actor: CmsActor,
    input: CreateContentInput,
  ): Promise<ContentDocument> {
    const existing = await this.store.findBySlug(input.section, input.slug);
    if (existing) throw new CmsSlugTakenError(input.section, input.slug);

    await this.assertHierarchy({
      id: PENDING_ID,
      section: input.section,
      slug: input.slug,
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder ?? 0,
    });

    const now = this.clock();
    const draft = await this.store.insert({
      section: input.section,
      slug: input.slug,
      status: "draft",
      body: input.body,
      title: input.title,
      titleTag: input.titleTag ?? null,
      description: input.description,
      summary: input.summary,
      cta: input.cta,
      canonicalSlug: input.canonicalSlug ?? null,
      metadata: input.metadata,
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder ?? 0,
      crumb: input.crumb ?? null,
      actorId: actor.userId,
      now,
    });

    // Validated after the insert, not before: a draft is allowed to be
    // incomplete (§5.3), and the diagnostics are for the editor to see, not a
    // gate. `validateOnly` is how a caller asks the question without writing.
    return draft;
  }

  /** Save an edit. The level a save must meet comes from where the page
   * currently is — editing a published page has to survive publish validation,
   * because the copy being edited is the live one. */
  async update(
    actor: CmsActor,
    input: UpdateContentInput,
  ): Promise<ContentDocument> {
    const current = await this.store.findById(input.id);
    if (!current) throw new CmsNotFoundError(`Page ${input.id}`);
    // Reported from the row already in hand, before validation: a stale save is
    // not going to land whatever its content says, and "someone else edited
    // this" is more actionable than a list of rules. The atomic check in
    // `updateWithLock` still guards the race between this read and the write.
    if (current.lockVersion !== input.expectedLockVersion) {
      await this.reportConflict(input.id, input.expectedLockVersion);
    }

    const next = { ...current, ...input.patch } as ContentDocument;

    // Placement is checked before content: a page in the wrong place in the
    // tree is a broken URL and a broken breadcrumb whatever its prose says, and
    // this is also what stops a page being re-parented onto its own descendant.
    await this.assertHierarchy({
      id: current.id,
      section: current.section,
      slug: next.slug,
      parentId: next.parentId,
      sortOrder: next.sortOrder,
    });

    const level = levelForSave(current.status);
    await this.assertValid(next, level);

    const now = this.clock();
    const saved = await this.store.updateWithLock({
      id: input.id,
      expectedLockVersion: input.expectedLockVersion,
      actorId: actor.userId,
      now,
      patch: {
        ...input.patch,
        // A content edit moves the editorial timestamp the reader sees; a
        // status flip does not (see `setStatus`).
        ...(isContentEdit(input.patch) ? { contentUpdatedAt: now } : {}),
      },
    });
    if (!saved) await this.reportConflict(input.id, input.expectedLockVersion);
    return saved as ContentDocument;
  }

  /** Move a page between states. The same gate the browser and the MCP share,
   * so an agent cannot reach a state a person could not. */
  async setStatus(
    actor: CmsActor,
    input: { id: string; status: ContentStatus; expectedLockVersion: number },
  ): Promise<ContentDocument> {
    const current = await this.store.findById(input.id);
    if (!current) throw new CmsNotFoundError(`Page ${input.id}`);
    if (current.lockVersion !== input.expectedLockVersion) {
      await this.reportConflict(input.id, input.expectedLockVersion);
    }

    if (input.status === "published" && !canPublish(actor)) {
      throw new CmsForbiddenError("publicar contenido");
    }

    const level = levelForTransition(current.status, input.status);
    await this.assertValid(current, level);

    const now = this.clock();
    const publishedAt = current.publishedAt
      ? new Date(current.publishedAt)
      : null;
    const saved = await this.store.updateWithLock({
      id: input.id,
      expectedLockVersion: input.expectedLockVersion,
      actorId: actor.userId,
      now,
      patch: {
        status: input.status,
        publishedAt: nextPublishedAt(publishedAt, input.status, now),
        // Moved only on a *first* publication, where the content is current by
        // definition. Unpublishing and republishing must not tell every reader
        // the article was rewritten today.
        ...(stampsContentUpdatedAt(publishedAt, input.status)
          ? { contentUpdatedAt: now }
          : {}),
      },
    });
    if (!saved) await this.reportConflict(input.id, input.expectedLockVersion);
    return saved as ContentDocument;
  }

  /** Validate without writing — the Validation tab, and the MCP's
   * `validate_content`. Takes the *saved* page plus an optional patch so an
   * editor can ask "would this save be accepted?" before making it. */
  async validateOnly(
    _actor: CmsActor,
    input: {
      id: string;
      patch?: UpdateContentInput["patch"];
      level?: ValidationLevel;
    },
  ): Promise<ValidationResult> {
    const current = await this.store.findById(input.id);
    if (!current) throw new CmsNotFoundError(`Page ${input.id}`);
    const document = { ...current, ...input.patch } as ContentDocument;
    return this.validate({
      document,
      level: input.level ?? levelForSave(current.status),
    });
  }

  /** Enforce the one invariant that keeps `slug` and `parentId` in agreement,
   * plus the tree's own rules (no cycles, no cross-section parents, no orphaned
   * intermediate paths). Uniform for every section — this is the alternative to
   * a per-section branch in the editor, the list and the breadcrumb. */
  private async assertHierarchy(node: HierarchyNode): Promise<void> {
    const siblings = await this.store.list({
      section: node.section as ContentSection,
    });
    const problems = checkHierarchy(
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

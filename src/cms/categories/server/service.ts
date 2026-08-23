import "server-only";
import type {
  ContentCategory,
  ContentCategoryWithUsage,
} from "@/content-system/categories/types";
import {
  isCategorySlug,
  slugifyCategory,
} from "@/content-system/categories/slug";
import type { ContentSection } from "@/content-system/types";
import { revalidatePublicContent } from "@/cms/server/invalidation";
import { canAuthor } from "@/cms/auth/policy";
import type { CmsActor } from "@/cms/types";
import {
  CmsCategoryConflictError,
  CmsCategoryInUseError,
  CmsCategorySlugTakenError,
  CmsForbiddenError,
  CmsNotFoundError,
  CmsValidationError,
} from "@/cms/server/errors";
import {
  CmsCategoryStore,
  cmsCategoryStore,
  type CategoryUsage,
} from "./store";

export type CreateCategoryInput = {
  section: ContentSection;
  label: string;
  title: string;
  description: string;
  sortOrder?: number;
  /** Browser-only. MCP creation deliberately omits this and receives the slug
   * derived from `label`. */
  slug?: string;
};

export type UpdateCategoryInput = {
  id: string;
  expectedLockVersion: number;
  patch: Partial<
    Pick<ContentCategory, "label" | "title" | "description" | "sortOrder">
  >;
};

export type CategoryDetail = ContentCategoryWithUsage & {
  redirects: string[];
  usage: CategoryUsage[];
};

type CategoryInvalidator = (section: ContentSection) => void;

export class CmsCategoryService {
  constructor(
    private readonly store: CmsCategoryStore = cmsCategoryStore,
    private readonly clock: () => Date = () => new Date(),
    private readonly invalidate: CategoryInvalidator = revalidatePublicContent,
  ) {}

  async list(
    _actor: CmsActor,
    section: ContentSection,
  ): Promise<ContentCategoryWithUsage[]> {
    const categories = await this.store.list(section);
    return Promise.all(
      categories.map(async (category) => ({
        ...category,
        usageCount: (await this.store.usage(section, category.key)).length,
      })),
    );
  }

  async get(_actor: CmsActor, id: string): Promise<CategoryDetail> {
    const category = await this.required(id);
    const [usage, redirects] = await Promise.all([
      this.store.usage(category.section, category.key),
      this.store.redirectsForCategory(id),
    ]);
    return { ...category, usageCount: usage.length, usage, redirects };
  }

  async create(
    actor: CmsActor,
    input: CreateCategoryInput,
  ): Promise<ContentCategory> {
    this.assertMayAuthor(actor);
    const values = checkedCopy(input);
    if (actor.source === "mcp" && input.slug !== undefined) {
      throw new CmsForbiddenError("elegir la dirección de una categoría");
    }
    const slug =
      actor.source === "mcp"
        ? slugifyCategory(values.label)
        : (input.slug ?? slugifyCategory(values.label));
    this.assertSlug(slug);

    if (
      (await this.store.findBySlug(input.section, slug, {
        includeRetired: true,
      })) ||
      (await this.store.findByKey(input.section, slug))
    ) {
      throw new CmsCategorySlugTakenError(input.section, slug);
    }

    const now = this.clock();
    const created = await this.store.transaction(async (store) => {
      await store.dropRedirect(input.section, slug);
      return store.insert({
        section: input.section,
        key: slug,
        slug,
        ...values,
        sortOrder: input.sortOrder ?? 0,
        actorId: actor.userId,
        now,
      });
    });
    this.expirePublicCache(input.section);
    return created;
  }

  async update(
    actor: CmsActor,
    input: UpdateCategoryInput,
  ): Promise<ContentCategory> {
    this.assertMayAuthor(actor);
    const current = await this.required(input.id);
    if (current.retiredAt) throw new CmsNotFoundError(`Category ${input.id}`);

    const patch = checkedPatch(input.patch);
    const saved = await this.store.updateWithLock({
      id: input.id,
      expectedLockVersion: input.expectedLockVersion,
      patch,
      actorId: actor.userId,
      now: this.clock(),
    });
    if (!saved) await this.conflict(input.id, input.expectedLockVersion);
    this.expirePublicCache(current.section);
    return saved as ContentCategory;
  }

  /** Browser-only public-address change. The target row makes every historical
   * address resolve directly to the newest slug. */
  async rename(
    actor: CmsActor,
    input: { id: string; expectedLockVersion: number; slug: string },
  ): Promise<ContentCategory & { redirects: string[] }> {
    this.assertHuman(actor, "cambiar la dirección de una categoría");
    const current = await this.required(input.id);
    if (current.retiredAt) throw new CmsNotFoundError(`Category ${input.id}`);
    this.assertSlug(input.slug);
    if (input.slug === current.slug) {
      return {
        ...current,
        redirects: await this.store.redirectsForCategory(current.id),
      };
    }

    const occupied = await this.store.findBySlug(current.section, input.slug, {
      includeRetired: true,
    });
    if (occupied && occupied.id !== current.id) {
      throw new CmsCategorySlugTakenError(current.section, input.slug);
    }

    const now = this.clock();
    const moved = await this.store.transaction(async (store) => {
      const claimed = await store.updateWithLock({
        id: input.id,
        expectedLockVersion: input.expectedLockVersion,
        patch: { slug: input.slug },
        actorId: actor.userId,
        now,
      });
      if (!claimed) return null;
      await store.dropRedirect(current.section, input.slug);
      await store.addRedirect({
        section: current.section,
        fromSlug: current.slug,
        categoryId: current.id,
        actorId: actor.userId,
        now,
      });
      return claimed;
    });
    if (!moved) await this.conflict(input.id, input.expectedLockVersion);
    this.expirePublicCache(current.section);
    return {
      ...(moved as ContentCategory),
      redirects: await this.store.redirectsForCategory(current.id),
    };
  }

  /** Browser-only removal. The row becomes a tombstone so stored historical
   * versions can still resolve their immutable key. */
  async retire(
    actor: CmsActor,
    input: { id: string; expectedLockVersion: number },
  ): Promise<void> {
    this.assertHuman(actor, "eliminar una categoría");
    const current = await this.required(input.id);
    const usage = await this.store.usage(current.section, current.key);
    if (usage.length > 0) throw new CmsCategoryInUseError(usage);

    const now = this.clock();
    const retired = await this.store.updateWithLock({
      id: current.id,
      expectedLockVersion: input.expectedLockVersion,
      patch: { retiredAt: now, retiredBy: actor.userId },
      actorId: actor.userId,
      now,
    });
    if (!retired) await this.conflict(input.id, input.expectedLockVersion);
    this.expirePublicCache(current.section);
  }

  private async required(id: string): Promise<ContentCategory> {
    const category = await this.store.findById(id);
    if (!category) throw new CmsNotFoundError(`Category ${id}`);
    return category;
  }

  private assertMayAuthor(actor: CmsActor): void {
    if (!canAuthor(actor)) throw new CmsForbiddenError("editar categorías");
  }

  private assertHuman(actor: CmsActor, operation: string): void {
    this.assertMayAuthor(actor);
    if (actor.source === "mcp") throw new CmsForbiddenError(operation);
  }

  private assertSlug(slug: string): void {
    if (!isCategorySlug(slug)) {
      throw invalid(
        "category.slug",
        "La dirección debe usar minúsculas, números y guiones, sin espacios ni acentos.",
        "slug",
      );
    }
  }

  /** The database write is already committed. A cache failure must not turn a
   * successful category edit into a reported failure; the one-hour TTL remains
   * the fallback, exactly as it does for page publications. */
  private expirePublicCache(section: ContentSection): void {
    try {
      this.invalidate(section);
    } catch (cause) {
      console.error("[cms] category cache invalidation failed:", cause);
    }
  }

  private async conflict(id: string, expected: number): Promise<never> {
    throw new CmsCategoryConflictError(
      id,
      expected,
      await this.store.lockVersionOf(id),
    );
  }
}

const invalid = (code: string, message: string, field?: string) =>
  new CmsValidationError([
    { code, severity: "error", message, ...(field ? { field } : {}) },
  ]);

function filled(value: string, field: string, max: number): string {
  const clean = value.trim();
  if (!clean)
    throw invalid(`category.${field}`, "No puede quedar vacío.", field);
  if (clean.length > max) {
    throw invalid(
      `category.${field}`,
      `No puede superar ${max} caracteres.`,
      field,
    );
  }
  return clean;
}

function checkedCopy(input: {
  label: string;
  title: string;
  description: string;
}) {
  return {
    label: filled(input.label, "label", 80),
    title: filled(input.title, "title", 180),
    description: filled(input.description, "description", 220),
  };
}

function checkedPatch(
  patch: UpdateCategoryInput["patch"],
): UpdateCategoryInput["patch"] {
  return {
    ...(patch.label !== undefined
      ? { label: filled(patch.label, "label", 80) }
      : {}),
    ...(patch.title !== undefined
      ? { title: filled(patch.title, "title", 180) }
      : {}),
    ...(patch.description !== undefined
      ? {
          description: filled(patch.description, "description", 220),
        }
      : {}),
    ...(patch.sortOrder !== undefined
      ? { sortOrder: Math.trunc(patch.sortOrder) }
      : {}),
  };
}

export const cmsCategoryService = new CmsCategoryService();

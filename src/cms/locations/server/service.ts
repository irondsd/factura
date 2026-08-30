import "server-only";
import type {
  ContentLocation,
  ContentLocationWithUsage,
} from "@/content-system/locations/types";
import {
  isLocationSlug,
  slugifyLocation,
} from "@/content-system/locations/slug";
import { alphabetizeLocations } from "@/content-system/locations/alphabetize";
import { revalidatePublicLocations } from "@/cms/server/invalidation";
import { canAuthor } from "@/cms/auth/policy";
import type { CmsActor } from "@/cms/types";
import {
  CmsForbiddenError,
  CmsLocationConflictError,
  CmsLocationInUseError,
  CmsLocationSlugTakenError,
  CmsNotFoundError,
  CmsValidationError,
} from "@/cms/server/errors";
import {
  CmsLocationStore,
  cmsLocationStore,
  type LocationUsage,
} from "./store";

export type CreateLocationInput = {
  label: string;
  title: string;
  description: string;
  slug?: string;
};
export type UpdateLocationInput = {
  id: string;
  expectedLockVersion: number;
  patch: Partial<Pick<ContentLocation, "label" | "title" | "description">>;
};
export type LocationDetail = ContentLocationWithUsage & {
  redirects: string[];
  usage: LocationUsage[];
};

export class CmsLocationService {
  constructor(
    private readonly store: CmsLocationStore = cmsLocationStore,
    private readonly clock: () => Date = () => new Date(),
    private readonly invalidate: () => void = revalidatePublicLocations,
  ) {}
  /** The registry as the manager and the MCP see it: every active location with
   * the pages that would block its retirement.
   *
   * One usage query per location, which is what makes it the wrong call for the
   * page editor — see `options` below. */
  async list(_actor?: CmsActor): Promise<ContentLocationWithUsage[]> {
    void _actor;
    return Promise.all(
      alphabetizeLocations(await this.store.list()).map(async (location) => {
        const usage = await this.store.usage(location.key);
        return { ...location, usageCount: usage.length, usage };
      }),
    );
  }

  /** The registry as the page editor's field needs it: keys and labels, in
   * alphabetical order, and no usage at all. The editor renders once per page load
   * and never asks who else uses a location, so it should not pay for a
   * revision scan per location to find out. */
  async options(_actor?: CmsActor): Promise<ContentLocation[]> {
    void _actor;
    return alphabetizeLocations(await this.store.list());
  }
  async get(_actor: CmsActor, id: string): Promise<LocationDetail> {
    const location = await this.required(id);
    const [usage, redirects] = await Promise.all([
      this.store.usage(location.key),
      this.store.redirectsForLocation(id),
    ]);
    return { ...location, usageCount: usage.length, usage, redirects };
  }
  async create(
    actor: CmsActor,
    input: CreateLocationInput,
  ): Promise<ContentLocation> {
    this.assertMayAuthor(actor);
    const values = checkedCopy(input);
    if (actor.source === "mcp" && input.slug !== undefined)
      throw new CmsForbiddenError("elegir la dirección de una ubicación");
    const slug =
      actor.source === "mcp"
        ? slugifyLocation(values.label)
        : (input.slug ?? slugifyLocation(values.label));
    this.assertSlug(slug);
    if (
      (await this.store.findBySlug(slug, { includeRetired: true })) ||
      (await this.store.findByKey(slug))
    )
      throw new CmsLocationSlugTakenError(slug);
    const now = this.clock();
    const created = await this.store.transaction(async (store) => {
      await store.dropRedirect(slug);
      return store.insert({
        key: slug,
        slug,
        ...values,
        actorId: actor.userId,
        now,
      });
    });
    this.expire();
    return created;
  }
  async update(
    actor: CmsActor,
    input: UpdateLocationInput,
  ): Promise<ContentLocation> {
    this.assertMayAuthor(actor);
    const current = await this.required(input.id);
    if (current.retiredAt) throw new CmsNotFoundError(`Location ${input.id}`);
    const saved = await this.store.updateWithLock({
      id: input.id,
      expectedLockVersion: input.expectedLockVersion,
      patch: checkedPatch(input.patch),
      actorId: actor.userId,
      now: this.clock(),
    });
    if (!saved) await this.conflict(input.id, input.expectedLockVersion);
    this.expire();
    return saved as ContentLocation;
  }
  async rename(
    actor: CmsActor,
    input: { id: string; expectedLockVersion: number; slug: string },
  ): Promise<ContentLocation & { redirects: string[] }> {
    this.assertHuman(actor, "cambiar la dirección de una ubicación");
    const current = await this.required(input.id);
    this.assertSlug(input.slug);
    if (input.slug === current.slug)
      return {
        ...current,
        redirects: await this.store.redirectsForLocation(current.id),
      };
    const occupied = await this.store.findBySlug(input.slug, {
      includeRetired: true,
    });
    if (occupied && occupied.id !== current.id)
      throw new CmsLocationSlugTakenError(input.slug);
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
      await store.dropRedirect(input.slug);
      await store.addRedirect({
        fromSlug: current.slug,
        locationId: current.id,
        actorId: actor.userId,
        now,
      });
      return claimed;
    });
    if (!moved) await this.conflict(input.id, input.expectedLockVersion);
    this.expire();
    return {
      ...(moved as ContentLocation),
      redirects: await this.store.redirectsForLocation(current.id),
    };
  }
  async retire(
    actor: CmsActor,
    input: { id: string; expectedLockVersion: number },
  ): Promise<void> {
    this.assertHuman(actor, "eliminar una ubicación");
    const current = await this.required(input.id);
    const usage = await this.store.usage(current.key);
    if (usage.length) throw new CmsLocationInUseError(usage);
    const now = this.clock();
    const retired = await this.store.updateWithLock({
      id: current.id,
      expectedLockVersion: input.expectedLockVersion,
      patch: { retiredAt: now, retiredBy: actor.userId },
      actorId: actor.userId,
      now,
    });
    if (!retired) await this.conflict(input.id, input.expectedLockVersion);
    this.expire();
  }
  private async required(id: string) {
    const value = await this.store.findById(id);
    if (!value) throw new CmsNotFoundError(`Location ${id}`);
    return value;
  }
  private assertMayAuthor(actor: CmsActor) {
    if (!canAuthor(actor)) throw new CmsForbiddenError("editar ubicaciones");
  }
  private assertHuman(actor: CmsActor, operation: string) {
    this.assertMayAuthor(actor);
    if (actor.source === "mcp") throw new CmsForbiddenError(operation);
  }
  private assertSlug(slug: string) {
    if (!isLocationSlug(slug))
      throw invalid(
        "location.slug",
        "La dirección debe usar minúsculas, números y guiones, sin espacios ni acentos.",
        "slug",
      );
  }
  private expire() {
    try {
      this.invalidate();
    } catch (cause) {
      console.error("[cms] location cache invalidation failed:", cause);
    }
  }
  private async conflict(id: string, expected: number): Promise<never> {
    throw new CmsLocationConflictError(
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
function filled(value: string, field: string, max: number) {
  const clean = value.trim();
  if (!clean)
    throw invalid(`location.${field}`, "No puede quedar vacío.", field);
  if (clean.length > max)
    throw invalid(
      `location.${field}`,
      `No puede superar ${max} caracteres.`,
      field,
    );
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
  patch: UpdateLocationInput["patch"],
): UpdateLocationInput["patch"] {
  return {
    ...(patch.label !== undefined
      ? { label: filled(patch.label, "label", 80) }
      : {}),
    ...(patch.title !== undefined
      ? { title: filled(patch.title, "title", 180) }
      : {}),
    ...(patch.description !== undefined
      ? { description: filled(patch.description, "description", 220) }
      : {}),
  };
}
export const cmsLocationService = new CmsLocationService();

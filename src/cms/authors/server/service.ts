import "server-only";
import type { ContentAuthor } from "@/content-system/authors/types";
// A URL segment is a URL segment: authors reuse the rule categories already
// define rather than growing a second, subtly different one. Aliased so the
// call sites below read as what they are.
import {
  isCategorySlug as isUrlSlug,
  slugifyCategory as slugify,
} from "@/content-system/categories/slug";
import { CONTENT_SECTIONS, type ContentSection } from "@/content-system/types";
import { revalidatePublicContent } from "@/cms/server/invalidation";
import { canAuthor } from "@/cms/auth/policy";
import type { CmsActor } from "@/cms/types";
import {
  CmsAuthorNameTakenError,
  CmsAuthorSlugTakenError,
  CmsForbiddenError,
  CmsNotFoundError,
  CmsValidationError,
} from "@/cms/server/errors";
import { CmsAuthorStore, cmsAuthorStore, type AuthorUsage } from "./store";

// Who may be credited on a page, and the rules for editing that list.
//
// Thinner than the category service by one whole dimension: an author has no
// section, no immutable key, no public address history and no `lock_version`.
// What it does have that a category does not is a *public* consequence with no
// visible page of its own — an author's name reaches readers only through the
// structured data of every article they signed, so every write here expires the
// cache of all four sections rather than one.

export type AuthorInput = {
  name: string;
  tagline?: string | null;
  jobTitle?: string | null;
  imageMediaId?: string | null;
  slug?: string | null;
  about?: string | null;
};

export type UpdateAuthorInput = {
  id: string;
  patch: Partial<AuthorInput>;
};

export type ContentAuthorWithUsage = ContentAuthor & { usageCount: number };

export type AuthorDetail = ContentAuthorWithUsage & { usage: AuthorUsage[] };

type PublicCacheInvalidator = (section: ContentSection) => void;

export class CmsAuthorService {
  constructor(
    private readonly store: CmsAuthorStore = cmsAuthorStore,
    private readonly clock: () => Date = () => new Date(),
    private readonly invalidate: PublicCacheInvalidator = revalidatePublicContent,
  ) {}

  // The two reads take no actor, deliberately rather than by omission — the
  // same call the media service makes. Membership *is* the read grant here:
  // there is no per-author ownership to weigh, and every caller arrives through
  // `requireCmsMember`. Accepting an actor and ignoring it would imply a
  // decision that is not being made.

  /** The list the picker and the manager both read. */
  async list(): Promise<ContentAuthorWithUsage[]> {
    const authors = await this.store.list();
    return Promise.all(
      authors.map(async (author) => ({
        ...author,
        usageCount: (await this.store.usage(author.id)).length,
      })),
    );
  }

  async get(id: string): Promise<AuthorDetail> {
    const author = await this.required(id);
    const usage = await this.store.usage(id);
    return { ...author, usage, usageCount: usage.length };
  }

  async create(actor: CmsActor, input: AuthorInput): Promise<ContentAuthor> {
    this.assertHuman(actor, "crear autores");
    const values = await this.checked(input);

    const created = await this.store.insert({
      values,
      actorId: actor.userId,
      now: this.clock(),
    });
    // A brand-new author is on no page yet, so nothing public changed. The
    // expiry runs anyway: it costs one tag write and it removes the question of
    // whether create is the one write that may skip it.
    this.expirePublicCache();
    return created;
  }

  async update(
    actor: CmsActor,
    input: UpdateAuthorInput,
  ): Promise<ContentAuthor> {
    this.assertHuman(actor, "editar autores");
    const current = await this.required(input.id);
    const patch = await this.checkedPatch(input.patch, current.id);

    const saved = await this.store.update({
      id: input.id,
      patch,
      actorId: actor.userId,
      now: this.clock(),
    });
    if (!saved) throw new CmsNotFoundError(`Author ${input.id}`);
    this.expirePublicCache();
    return saved;
  }

  private async required(id: string): Promise<ContentAuthor> {
    const author = await this.store.findById(id);
    if (!author) throw new CmsNotFoundError(`Author ${id}`);
    return author;
  }

  private assertHuman(actor: CmsActor, operation: string): void {
    if (!canAuthor(actor)) throw new CmsForbiddenError(operation);
    // Agents may *credit* an author — that is a page edit, and it goes through
    // the content service like any other metadata. Adding a person to the list
    // is an editorial decision about a real human being, and it stays with one.
    if (actor.source === "mcp") throw new CmsForbiddenError(operation);
  }

  /** Every field of a new author, checked and normalized. */
  private async checked(
    input: AuthorInput,
  ): Promise<Required<Omit<AuthorInput, "name">> & { name: string }> {
    const name = filled(input.name, "name", 120);
    if (await this.store.findByName(name)) {
      throw new CmsAuthorNameTakenError(name);
    }
    const slug = await this.checkedSlug(input.slug, name);
    return {
      name,
      slug,
      tagline: optional(input.tagline, "tagline", 200),
      jobTitle: optional(input.jobTitle, "jobTitle", 120),
      about: optional(input.about, "about", 4000),
      imageMediaId: input.imageMediaId ?? null,
    };
  }

  private async checkedPatch(
    patch: Partial<AuthorInput>,
    id: string,
  ): Promise<Partial<AuthorInput>> {
    const out: Partial<AuthorInput> = {};

    if (patch.name !== undefined) {
      const name = filled(patch.name, "name", 120);
      if (await this.store.findByName(name, { exceptId: id })) {
        throw new CmsAuthorNameTakenError(name);
      }
      out.name = name;
    }
    if (patch.slug !== undefined) {
      out.slug = await this.checkedSlug(patch.slug, null, id);
    }
    if (patch.tagline !== undefined) {
      out.tagline = optional(patch.tagline, "tagline", 200);
    }
    if (patch.jobTitle !== undefined) {
      out.jobTitle = optional(patch.jobTitle, "jobTitle", 120);
    }
    if (patch.about !== undefined) {
      out.about = optional(patch.about, "about", 4000);
    }
    if (patch.imageMediaId !== undefined) {
      out.imageMediaId = patch.imageMediaId || null;
    }
    return out;
  }

  /** The address, which nothing serves yet.
   *
   * Left empty it stays null, and the author's Person node in every article is
   * anonymous — valid, just not addressable. `fallbackFrom` derives one from the
   * name on creation only when a slug was not asked for explicitly; passing an
   * empty string clears it. The shape rule is shared with categories because a
   * URL segment is a URL segment. */
  private async checkedSlug(
    value: string | null | undefined,
    fallbackFrom: string | null,
    exceptId?: string,
  ): Promise<string | null> {
    const raw =
      value === undefined && fallbackFrom
        ? slugify(fallbackFrom)
        : (value ?? "").trim();
    if (!raw) return null;
    if (!isUrlSlug(raw)) {
      throw invalid(
        "author.slug",
        "La dirección debe usar minúsculas, números y guiones, sin espacios ni acentos.",
        "slug",
      );
    }
    const occupied = await this.store.findBySlug(
      raw,
      exceptId ? { exceptId } : {},
    );
    if (occupied) throw new CmsAuthorSlugTakenError(raw);
    return raw;
  }

  /** An author's name and standing travel in the structured data of every page
   * they signed, across every section — so unlike a category edit there is no
   * one section to expire.
   *
   * Same swallow-and-log as the category service: the row is already committed,
   * and a cache failure must not be reported as a failed save. */
  private expirePublicCache(): void {
    for (const section of CONTENT_SECTIONS) {
      try {
        this.invalidate(section);
      } catch (cause) {
        console.error("[cms] author cache invalidation failed:", cause);
      }
    }
  }
}

const invalid = (code: string, message: string, field?: string) =>
  new CmsValidationError([
    { code, severity: "error", message, ...(field ? { field } : {}) },
  ]);

function filled(value: string, field: string, max: number): string {
  const clean = (value ?? "").trim();
  if (!clean) throw invalid(`author.${field}`, "No puede quedar vacío.", field);
  if (clean.length > max) {
    throw invalid(
      `author.${field}`,
      `No puede superar ${max} caracteres.`,
      field,
    );
  }
  return clean;
}

/** Blank and absent are the same thing for every field but the name: an editor
 * clearing a box means "no job title", not "the empty job title". */
function optional(
  value: string | null | undefined,
  field: string,
  max: number,
): string | null {
  const clean = (value ?? "").trim();
  if (!clean) return null;
  if (clean.length > max) {
    throw invalid(
      `author.${field}`,
      `No puede superar ${max} caracteres.`,
      field,
    );
  }
  return clean;
}

export const cmsAuthorService = new CmsAuthorService();

import "server-only";
import { toJSONSchema, z } from "zod";
import { isContentSection, isContentStatus } from "@/content-system/types";
import { contentMetadataSchema } from "@/content-system/metadata/sections";
import { cmsContentService } from "@/cms/server/service";
import { cmsMediaService } from "@/cms/media/server/service";
import { cmsCategoryService } from "@/cms/categories/server/service";
import { cmsAuthorService } from "@/cms/authors/server/service";
import { cmsLocationService } from "@/cms/locations/server/service";
import { hasScope, type CmsTokenCaller, type CmsScope } from "./tokens";

const section = z.string().refine(isContentSection, "Unknown content section.");
const status = z.string().refine(isContentStatus, "Unknown content status.");
// One metadata contract for every section. Editorial validation decides which
// optional capabilities (for example dataset provenance) a page must fill in.
const metadata = contentMetadataSchema;

const patch = z.object({
  title: z.string().optional(),
  titleTag: z.string().nullable().optional(),
  description: z.string().optional(),
  summary: z.string().optional(),
  cta: z.string().optional(),
  canonicalSlug: z.string().nullable().optional(),
  body: z.string().optional(),
  metadata: metadata.optional(),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().optional(),
  crumb: z.string().nullable().optional(),
});

/** MCP tool annotations (spec `2025-06-18`). Hints, not enforcement — the
 * server's real guarantee is the tool list itself, which has no delete. What
 * these buy is that a client learns *which* calls change the public site
 * without having to hard-code this server's tool names, so a fresh agent asks
 * before publishing instead of after. */
type ToolAnnotations = {
  title: string;
  readOnlyHint: boolean;
  /** `set_content_status` is the one tool that can take a live page off the
   * public site, so it is the one tool marked destructive. Editing a published
   * page is not: the URL keeps rendering either way. */
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

type Tool = {
  name: string;
  scope: CmsScope;
  description: string;
  annotations: ToolAnnotations;
  schema: z.ZodType;
  run: (caller: CmsTokenCaller, input: unknown) => Promise<unknown>;
};

const readOnly = (title: string): ToolAnnotations => ({
  title,
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});
const writes = (title: string, destructiveHint = false): ToolAnnotations => ({
  title,
  readOnlyHint: false,
  destructiveHint,
  idempotentHint: false,
  openWorldHint: false,
});
export const CMS_TOOLS: Tool[] = [
  {
    name: "list_content",
    scope: "cms:read",
    description:
      "List CMS content, optionally filtered by section, status, or title/slug search.",
    annotations: readOnly("Listar contenido"),
    schema: z.object({
      section: section.optional(),
      statuses: z.array(status).optional(),
      search: z.string().optional(),
    }),
    run: (a, input) =>
      cmsContentService.list(
        a,
        input as { section?: never; statuses?: never; search?: string },
      ),
  },
  {
    name: "get_content",
    scope: "cms:read",
    description:
      "Get one CMS page: the working copy if one is saved (otherwise the live publication), plus lifecycle status, whether a working copy exists, the revision it was started from, the live publication id, whether the public preview has fallen behind, and the lock version.",
    annotations: readOnly("Ver una página"),
    schema: z.object({ id: z.string().uuid() }),
    run: (a, input) =>
      cmsContentService.getState(a, (input as { id: string }).id),
  },
  {
    name: "list_categories",
    scope: "cms:read",
    description:
      "List the active categories for one section, including their immutable metadata key, public slug, usage count and lock version.",
    annotations: readOnly("Listar categorías"),
    schema: z.object({ section }).strict(),
    run: (a, input) =>
      cmsCategoryService.list(
        a,
        (input as { section: Parameters<typeof cmsCategoryService.list>[1] })
          .section,
      ),
  },
  {
    name: "list_authors",
    scope: "cms:read",
    description:
      "List the people who can be credited on a page. Use the returned id in a page's authorId (who wrote it) or factCheckerId (who verified its numbers) metadata. Read-only: authors are created and edited by a person at /cms.",
    annotations: readOnly("Listar autores"),
    schema: z.object({}).strict(),
    // No caller and no input: the scope check above is the whole authorization,
    // and every member sees the same two-name list.
    run: async () =>
      (await cmsAuthorService.list()).map((author) => ({
        id: author.id,
        name: author.name,
        jobTitle: author.jobTitle,
        slug: author.slug,
      })),
  },
  {
    name: "list_locations",
    scope: "cms:read",
    description:
      "List the active global locations, including immutable metadata keys, public slugs, usage counts and lock versions. Use exact narrow geography; Argentina is only for genuinely nationwide content.",
    annotations: readOnly("Listar ubicaciones"),
    schema: z.object({}).strict(),
    run: (a) => cmsLocationService.list(a),
  },
  {
    name: "get_location",
    scope: "cms:read",
    description:
      "Get one global location with usage across every section, redirect history and current lock version.",
    annotations: readOnly("Ver una ubicación"),
    schema: z.object({ id: z.uuid() }).strict(),
    run: (a, input) => cmsLocationService.get(a, (input as { id: string }).id),
  },
  {
    name: "create_location",
    scope: "cms:write",
    description:
      "Create a global location. The server derives its immutable key and public slug from the label; agents cannot choose either. Settings are live immediately, although an unused location has no public hub.",
    annotations: writes("Crear una ubicación"),
    schema: z
      .object({
        label: z.string(),
        title: z.string(),
        description: z.string(),
      })
      .strict(),
    run: (a, input) =>
      cmsLocationService.create(
        a,
        input as Parameters<typeof cmsLocationService.create>[1],
      ),
  },
  {
    name: "update_location",
    scope: "cms:write",
    description:
      "Edit a location's label, hub title or description. Changes are live immediately. Address changes and retirement are browser-only.",
    annotations: writes("Editar una ubicación"),
    schema: z
      .object({
        id: z.uuid(),
        expectedLockVersion: z.number().int().positive(),
        patch: z
          .object({
            label: z.string().optional(),
            title: z.string().optional(),
            description: z.string().optional(),
          })
          .strict()
          .refine((value) => Object.keys(value).length > 0, {
            message: "At least one editable field is required.",
          }),
      })
      .strict(),
    run: (a, input) =>
      cmsLocationService.update(
        a,
        input as Parameters<typeof cmsLocationService.update>[1],
      ),
  },
  {
    name: "get_category",
    scope: "cms:read",
    description:
      "Get one category with its usage, redirect history and current lock version.",
    annotations: readOnly("Ver una categoría"),
    schema: z.object({ id: z.uuid() }).strict(),
    run: (a, input) => cmsCategoryService.get(a, (input as { id: string }).id),
  },
  {
    name: "create_category",
    scope: "cms:write",
    description:
      "Create a section-scoped category. The server derives its immutable key and public slug from the label; agents cannot choose either. Category settings are live immediately, although an unused category has no public hub.",
    annotations: writes("Crear una categoría"),
    schema: z
      .object({
        section,
        label: z.string(),
        title: z.string(),
        description: z.string(),
        sortOrder: z.number().int().optional(),
      })
      .strict(),
    run: (a, input) =>
      cmsCategoryService.create(
        a,
        input as Parameters<typeof cmsCategoryService.create>[1],
      ),
  },
  {
    name: "update_category",
    scope: "cms:write",
    description:
      "Edit a category's label, hub title, description or order. Changes are live immediately. The key and public slug cannot be changed by an agent; a human must change the address in /cms.",
    annotations: writes("Editar una categoría"),
    schema: z
      .object({
        id: z.uuid(),
        expectedLockVersion: z.number().int().positive(),
        patch: z
          .object({
            label: z.string().optional(),
            title: z.string().optional(),
            description: z.string().optional(),
            sortOrder: z.number().int().optional(),
          })
          .strict()
          .refine((value) => Object.keys(value).length > 0, {
            message: "At least one editable field is required.",
          }),
      })
      .strict(),
    run: (a, input) =>
      cmsCategoryService.update(
        a,
        input as Parameters<typeof cmsCategoryService.update>[1],
      ),
  },
  {
    name: "create_content",
    scope: "cms:write",
    description:
      "Create a new draft. Publication always requires a separate set_content_status call.",
    annotations: writes("Crear un borrador"),
    schema: z.object({
      section,
      slug: z.string(),
      title: z.string(),
      titleTag: z.string().nullable().optional(),
      description: z.string(),
      summary: z.string(),
      cta: z.string().optional(),
      canonicalSlug: z.string().nullable().optional(),
      body: z.string(),
      metadata,
      parentId: z.string().uuid().nullable().optional(),
      sortOrder: z.number().int().optional(),
      crumb: z.string().nullable().optional(),
    }),
    run: (a, input) =>
      cmsContentService.create(
        a,
        input as Parameters<typeof cmsContentService.create>[1],
      ),
  },
  {
    name: "update_content",
    scope: "cms:write",
    description:
      "Save the page's shared working copy. This never changes what the public sees: the live article keeps serving its last publication until set_content_status publishes the working copy. expectedLockVersion must equal get_content's lockVersion.",
    annotations: writes("Guardar el borrador"),
    schema: z.object({
      id: z.string().uuid(),
      expectedLockVersion: z.number().int().positive(),
      patch,
    }),
    run: (a, input) =>
      cmsContentService.update(
        a,
        input as Parameters<typeof cmsContentService.update>[1],
      ),
  },
  {
    name: "validate_content",
    scope: "cms:read",
    description:
      "Return structured validation diagnostics for a saved page, optionally with a proposed patch.",
    annotations: readOnly("Validar"),
    schema: z.object({
      id: z.string().uuid(),
      patch: patch.optional(),
      level: z.enum(["draft", "preview", "publish"]).optional(),
    }),
    run: (a, input) =>
      cmsContentService.validateOnly(
        a,
        input as Parameters<typeof cmsContentService.validateOnly>[1],
      ),
  },
  {
    name: "set_content_status",
    scope: "cms:write",
    description:
      "Change what the public sees. 'published' publishes the saved working copy as a new immutable publication and clears the working copy; 'preview' freezes it into the shareable, noindexed public preview; 'draft' takes the page off the public site and keeps the last publication for restoring. Ask the human before every call, in both directions.",
    annotations: writes("Cambiar el estado de publicación", true),
    schema: z.object({
      id: z.string().uuid(),
      status,
      expectedLockVersion: z.number().int().positive(),
    }),
    run: (a, input) =>
      cmsContentService.setStatus(
        a,
        input as Parameters<typeof cmsContentService.setStatus>[1],
      ),
  },
  // ── versions (cms.md) ─────────────────────────────────────────────
  //
  // Read the bounded set of stored copies, compare one against the live
  // publication, restore one into the working copy, or throw the working copy
  // away. **None of these changes what the public sees** — that stays the sole
  // job of `set_content_status`, which is the one tool that still needs the
  // human's go-ahead. The annotations say so: a restore is a write, and a
  // discard is destructive, but neither is a publication.
  {
    name: "list_content_versions",
    scope: "cms:read",
    description:
      "List the stored versions of one page: the working copy, the temporary checkpoint, the public preview snapshot, and the current publication plus up to three previous ones. Bounded — this is every version that exists, not a page of a longer list.",
    annotations: readOnly("Listar versiones"),
    schema: z.object({ id: z.uuid() }),
    run: (a, input) =>
      cmsContentService.listVersions(a, (input as { id: string }).id),
  },
  {
    name: "get_content_version",
    scope: "cms:read",
    description:
      "Get one stored version of a page as a complete document. revisionId comes from list_content_versions and must belong to that page.",
    annotations: readOnly("Ver una versión"),
    schema: z.object({ id: z.uuid(), revisionId: z.uuid() }),
    run: (a, input) =>
      cmsContentService.getVersion(
        a,
        input as { id: string; revisionId: string },
      ),
  },
  {
    name: "compare_content_version",
    scope: "cms:read",
    description:
      "Compare a version against the page's live publication — or its last publication when the page is not currently published. Omit revisionId to compare the working copy, which is the usual question. There is no second baseline: two arbitrary versions cannot be compared.",
    annotations: readOnly("Comparar versiones"),
    schema: z.object({ id: z.uuid(), revisionId: z.uuid().optional() }),
    run: (a, input) =>
      cmsContentService.compareVersion(
        a,
        input as { id: string; revisionId?: string },
      ),
  },
  {
    name: "restore_content_version",
    scope: "cms:write",
    description:
      "Copy a stored version back into the page's working copy. Does not publish, does not change the page's status, and does not touch the public preview — publishing the restored text is a separate set_content_status call. Overwrites whatever was in the working copy; the previous contents are kept as the checkpoint.",
    annotations: writes("Restaurar una versión"),
    schema: z.object({
      id: z.uuid(),
      revisionId: z.uuid(),
      expectedLockVersion: z.number().int().positive(),
    }),
    run: (a, input) =>
      cmsContentService.restoreVersion(
        a,
        input as Parameters<typeof cmsContentService.restoreVersion>[1],
      ),
  },
  {
    name: "discard_content_wip",
    scope: "cms:write",
    description:
      "Throw away the page's working copy and its checkpoint. Unsaved editorial work is lost and there is no undo. Nothing public changes: the page keeps serving exactly what it was serving.",
    annotations: writes("Descartar el borrador", true),
    schema: z.object({
      id: z.uuid(),
      expectedLockVersion: z.number().int().positive(),
    }),
    run: (a, input) =>
      cmsContentService.discardWip(
        a,
        input as { id: string; expectedLockVersion: number },
      ),
  },
  // ── media library ───────────────────────────────────────────────────────
  //
  // Read, upload and edit. **No destructive tool, deliberately and
  // permanently** (cms.md): this endpoint already tells its
  // clients that it cannot delete anything and that removal is a browser-only
  // action a person performs at /cms, and media follows pages rather than
  // carving out an exception. An agent that wants an image gone leaves it
  // unused, where the library's «ya no se usan» view surfaces it for a human.
  {
    name: "list_media",
    scope: "cms:read",
    description:
      "List media-library images with their stable permalinks, dimensions and usage state. Filter by usage: 'never-used' and 'no-longer-used' are the two kinds of unused.",
    annotations: readOnly("Listar medios"),
    schema: z.object({
      search: z.string().optional(),
      usage: z.enum(["all", "used", "never-used", "no-longer-used"]).optional(),
      collectionId: z.uuid().nullable().optional(),
      limit: z.number().int().positive().max(200).optional(),
    }),
    run: (_a, input) =>
      cmsMediaService.list(input as Parameters<typeof cmsMediaService.list>[0]),
  },
  {
    name: "get_media",
    scope: "cms:read",
    description:
      "Get one image: metadata, stable permalink, and every CMS page that references it.",
    annotations: readOnly("Ver un medio"),
    schema: z.object({ id: z.uuid() }),
    run: (_a, input) => cmsMediaService.get((input as { id: string }).id),
  },
  {
    name: "create_media_upload",
    scope: "cms:write",
    description:
      "Reserve an upload and return a short-lived presigned PUT URL. Transfer the file to that URL with an ordinary HTTP PUT (Content-Type must match), then call complete_media_upload. The URL is a credential until it expires: never paste it into article content, metadata or logs.",
    annotations: writes("Reservar una subida"),
    schema: z.object({
      filename: z.string(),
      contentType: z.enum([
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/avif",
        "image/gif",
      ]),
      byteSize: z.number().int().positive(),
      collectionId: z.uuid().nullable().optional(),
    }),
    run: (a, input) =>
      cmsMediaService.reserveUpload(
        a,
        input as Parameters<typeof cmsMediaService.reserveUpload>[1],
      ),
  },
  {
    name: "complete_media_upload",
    scope: "cms:write",
    description:
      "Validate the uploaded bytes and create the media record. Returns the id and the permalink to use in previewMediaId or in Markdown.",
    annotations: writes("Terminar una subida"),
    schema: z.object({ mediaId: z.uuid() }),
    run: (a, input) =>
      cmsMediaService.completeUpload(a, input as { mediaId: string }),
  },
  {
    name: "update_media",
    scope: "cms:write",
    description:
      "Edit an image's library title, default alt text, decorative flag, credit or collection. expectedLockVersion must equal get_media's lockVersion.",
    annotations: writes("Editar un medio"),
    schema: z.object({
      id: z.uuid(),
      expectedLockVersion: z.number().int().positive(),
      patch: z.object({
        displayName: z.string().optional(),
        defaultAlt: z.string().optional(),
        decorative: z.boolean().optional(),
        attribution: z.string().nullable().optional(),
        collectionId: z.uuid().nullable().optional(),
      }),
    }),
    run: (a, input) =>
      cmsMediaService.update(
        a,
        input as Parameters<typeof cmsMediaService.update>[1],
      ),
  },
];

export const findCmsTool = (name: string): Tool | undefined =>
  CMS_TOOLS.find((tool) => tool.name === name);

export const cmsToolListing = (scopes: readonly CmsScope[]) =>
  CMS_TOOLS.filter((tool) => hasScope(scopes, tool.scope)).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: toJSONSchema(tool.schema),
    annotations: tool.annotations,
  }));

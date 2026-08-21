import "server-only";
import { toJSONSchema, z } from "zod";
import { isContentSection, isContentStatus } from "@/content-system/types";
import { guideMetadataSchema } from "@/content-system/metadata/guias";
import { sectionMetadataSchema } from "@/content-system/metadata/sections";
import { cmsContentService } from "@/cms/server/service";
import { cmsMediaService } from "@/cms/media/server/service";
import { hasScope, type CmsTokenCaller, type CmsScope } from "./tokens";

const section = z.string().refine(isContentSection, "Unknown content section.");
const status = z.string().refine(isContentStatus, "Unknown content status.");
// The MCP advertises the same structured metadata contracts as the browser
// editor.  `section` is still supplied separately for create; the service and
// repository select the appropriate member when the row is stored/read.
const metadata = z.union([guideMetadataSchema, sectionMetadataSchema]);

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
      "Get one CMS page including metadata, MDX body, lifecycle status, and lock version.",
    annotations: readOnly("Ver una página"),
    schema: z.object({ id: z.string().uuid() }),
    run: (a, input) => cmsContentService.get(a, (input as { id: string }).id),
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
      cta: z.string(),
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
      "Update content with optimistic concurrency. expectedLockVersion must equal get_content's lockVersion.",
    annotations: writes("Editar una página"),
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
      "Explicitly transition a page to draft, preview, or published after the same validation gate as the browser.",
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
  // ── media library ───────────────────────────────────────────────────────
  //
  // Read, upload and edit. **No destructive tool, deliberately and
  // permanently** (cms.md §9.9/§9.13): this endpoint already tells its
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

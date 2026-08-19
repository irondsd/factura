import "server-only";
import { z } from "zod";
import { isContentSection, isContentStatus } from "@/content-system/types";
import { cmsContentService } from "@/cms/server/service";
import type { CmsTokenCaller, CmsScope } from "./tokens";

const section = z.string().refine(isContentSection, "Unknown content section.");
const status = z.string().refine(isContentStatus, "Unknown content status.");
const patch = z.object({
  title: z.string().optional(), titleTag: z.string().nullable().optional(),
  description: z.string().optional(), summary: z.string().optional(),
  cta: z.string().optional(), canonicalSlug: z.string().nullable().optional(),
  body: z.string().optional(), metadata: z.unknown().optional(),
  parentId: z.string().uuid().nullable().optional(), sortOrder: z.number().int().optional(),
  crumb: z.string().nullable().optional(),
});

type Tool = { name: string; scope: CmsScope; description: string; schema: z.ZodType; run: (caller: CmsTokenCaller, input: unknown) => Promise<unknown> };
export const CMS_TOOLS: Tool[] = [
  { name: "list_content", scope: "cms:read", description: "List CMS content, optionally filtered by section, status, or title/slug search.", schema: z.object({ section: section.optional(), statuses: z.array(status).optional(), search: z.string().optional() }), run: (a, input) => cmsContentService.list(a, input as { section?: never; statuses?: never; search?: string }) },
  { name: "get_content", scope: "cms:read", description: "Get one CMS page including metadata, MDX body, lifecycle status, and lock version.", schema: z.object({ id: z.string().uuid() }), run: (a, input) => cmsContentService.get(a, (input as { id: string }).id) },
  { name: "create_content", scope: "cms:write", description: "Create a new draft. Publication always requires a separate set_content_status call.", schema: z.object({ section, slug: z.string(), title: z.string(), titleTag: z.string().nullable().optional(), description: z.string(), summary: z.string(), cta: z.string(), canonicalSlug: z.string().nullable().optional(), body: z.string(), metadata: z.unknown(), parentId: z.string().uuid().nullable().optional(), sortOrder: z.number().int().optional(), crumb: z.string().nullable().optional() }), run: (a, input) => cmsContentService.create(a, input as Parameters<typeof cmsContentService.create>[1]) },
  { name: "update_content", scope: "cms:write", description: "Update content with optimistic concurrency. expectedLockVersion must equal get_content's lockVersion.", schema: z.object({ id: z.string().uuid(), expectedLockVersion: z.number().int().positive(), patch }), run: (a, input) => cmsContentService.update(a, input as Parameters<typeof cmsContentService.update>[1]) },
  { name: "validate_content", scope: "cms:read", description: "Return structured validation diagnostics for a saved page, optionally with a proposed patch.", schema: z.object({ id: z.string().uuid(), patch: patch.optional(), level: z.enum(["draft", "preview", "publish"]).optional() }), run: (a, input) => cmsContentService.validateOnly(a, input as Parameters<typeof cmsContentService.validateOnly>[1]) },
  { name: "set_content_status", scope: "cms:write", description: "Explicitly transition a page to draft, preview, or published after the same validation gate as the browser.", schema: z.object({ id: z.string().uuid(), status, expectedLockVersion: z.number().int().positive() }), run: (a, input) => cmsContentService.setStatus(a, input as Parameters<typeof cmsContentService.setStatus>[1]) },
];

export const findCmsTool = (name: string): Tool | undefined => CMS_TOOLS.find((tool) => tool.name === name);

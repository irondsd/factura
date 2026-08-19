import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { cmsMembers, cmsPages, users } from "@/db/schema";
import { db } from "@/db";
import { mdxBody } from "@/content/mdx";
import { stripImports } from "@/content-system/adapters/filesystem";
import { extractMeta, isRef, refName } from "@/content-system/adapters/mdxMeta";
import { parentSlugFromPath } from "@/content-system/hierarchy";
import type { ContentDocument, ContentMetadata, ContentSection } from "@/content-system/types";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const production = args.has("--production");
const sections = ["estadisticas", "investigacion"] as const satisfies readonly ContentSection[];

type SourceEntry = { slug: string; crumb: string; file: string; order: number };

/** The existing registries are migration fixtures until the database is the
 * public source.  Parsing their literal entry records preserves the deliberate
 * editorial order and crumbs without importing MDX modules into a CLI. */
function entriesFor(section: ContentSection): SourceEntry[] {
  const registry = fs.readFileSync(path.join(process.cwd(), "src/content", section, "pages.ts"), "utf8");
  const records = [...registry.matchAll(/slug:\s*\[([^\]]+)\],\s*crumb:\s*"([^"]+)",\s*file:\s*"([^"]+)"/g)];
  return records.map((match, order) => ({
    slug: [...match[1].matchAll(/"([^"]+)"/g)].map((part) => part[1]).join("/"),
    crumb: match[2],
    file: match[3],
    order,
  }));
}

async function resolveRefs(meta: Record<string, unknown>, source: string, file: string): Promise<Record<string, unknown>> {
  const temporal = (meta.dataset as Record<string, unknown> | undefined)?.temporalCoverage;
  if (!isRef(temporal) || refName(temporal) !== "TEMPORAL_COVERAGE") return meta;
  const specifier = /^import\s+\{\s*TEMPORAL_COVERAGE\s*\}\s+from\s*["']([^"']+)["']/m.exec(source)?.[1];
  if (!specifier) throw new Error(`${file}: TEMPORAL_COVERAGE is not imported`);
  const modulePath = path.resolve(path.dirname(file), `${specifier}.ts`);
  const imported = await import(modulePath) as { TEMPORAL_COVERAGE?: unknown };
  if (typeof imported.TEMPORAL_COVERAGE !== "string") throw new Error(`${file}: imported TEMPORAL_COVERAGE is not a string`);
  return { ...meta, dataset: { ...(meta.dataset as Record<string, unknown>), temporalCoverage: imported.TEMPORAL_COVERAGE } };
}

function assertLocalTarget() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required for content import");
  const host = new URL(value).hostname;
  const local = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "db"]).has(host);
  if (!local && (!production || process.env.CMS_IMPORT_PRODUCTION_CONFIRM !== "IMPORT_CONTENT")) {
    throw new Error(`Refusing non-local database host ${JSON.stringify(host)}. Production requires --production and CMS_IMPORT_PRODUCTION_CONFIRM=IMPORT_CONTENT.`);
  }
  if (local && production) throw new Error("--production cannot target a local database");
  return { host, local };
}

async function sourceDocuments(): Promise<ContentDocument[]> {
  const out: ContentDocument[] = [];
  for (const section of sections) {
    for (const entry of entriesFor(section)) {
      const file = path.join(process.cwd(), "src/content", section, entry.file);
      const source = fs.readFileSync(file, "utf8");
      const parsed = extractMeta(source);
      if (!parsed.meta) throw new Error(`${file}: ${parsed.error ?? "missing metadata"}`);
      const meta = await resolveRefs(parsed.meta, source, file) as Record<string, any>;
      const slug = entry.slug;
      const publishedAt = meta.published as string;
      const metadata: ContentMetadata = {
        keywords: meta.keywords,
        categories: [],
        faq: meta.faq,
        ogTitle: meta.ogTitle,
        ogDescription: meta.ogDescription,
        ogStat: meta.ogStat,
        previewImage: meta.preview,
        sources: meta.sources,
        dataset: meta.dataset,
      };
      out.push({
        id: `fs:${section}/${slug}`,
        section,
        slug,
        status: meta.noindex ? "preview" : "published",
        body: stripImports(mdxBody(source)).replace(/^\n+/, ""),
        title: meta.title,
        titleTag: meta.titleTag ?? null,
        description: meta.description,
        summary: meta.summary,
        cta: meta.cta,
        canonicalSlug: null,
        parentId: null,
        sortOrder: entry.order,
        crumb: entry.crumb,
        metadata,
        publishedAt,
        contentUpdatedAt: meta.updated,
        createdAt: publishedAt,
        updatedAt: meta.updated,
        createdBy: null,
        updatedBy: null,
        lockVersion: 1,
      });
    }
  }
  return out.sort((a, b) => a.section.localeCompare(b.section) || a.slug.split("/").length - b.slug.split("/").length || a.sortOrder - b.sortOrder);
}

async function main() {
  const target = assertLocalTarget();
  const actorEmail = process.env.CMS_IMPORT_ACTOR_EMAIL;
  if (!actorEmail) throw new Error("CMS_IMPORT_ACTOR_EMAIL must name an existing CMS member");
  const [actor] = await db.select({ id: users.id }).from(users).innerJoin(cmsMembers, eq(cmsMembers.userId, users.id)).where(and(eq(users.email, actorEmail)));
  if (!actor) throw new Error(`${actorEmail} is not an active CMS member`);

  const documents = await sourceDocuments();
  console.log(`Section import target: ${target.local ? "local" : "production"} (${target.host})`);
  console.log(`${documents.filter((d) => d.section === "estadisticas").length} statistics; ${documents.filter((d) => d.section === "investigacion").length} research pages.`);
  if (dryRun) return;

  const ids = new Map<string, string>();
  for (const document of documents) {
    const parentSlug = parentSlugFromPath(document.slug);
    const parentId = parentSlug ? ids.get(`${document.section}/${parentSlug}`) : null;
    if (parentSlug && !parentId) throw new Error(`${document.section}/${document.slug}: missing imported parent ${parentSlug}`);
    const [row] = await db.insert(cmsPages).values({
      section: document.section,
      slug: document.slug,
      status: document.status,
      bodyMdx: document.body,
      title: document.title,
      titleTag: document.titleTag,
      description: document.description,
      summary: document.summary,
      cta: document.cta,
      canonicalSlug: null,
      metadata: document.metadata,
      parentId,
      sortOrder: document.sortOrder,
      crumb: document.crumb,
      createdBy: actor.id,
      updatedBy: actor.id,
      createdAt: new Date(document.createdAt),
      updatedAt: new Date(document.updatedAt),
      publishedAt: new Date(document.publishedAt ?? document.contentUpdatedAt),
      contentUpdatedAt: new Date(document.contentUpdatedAt),
    }).onConflictDoUpdate({
      target: [cmsPages.section, cmsPages.slug],
      set: { status: document.status, bodyMdx: document.body, title: document.title, titleTag: document.titleTag, description: document.description, summary: document.summary, cta: document.cta, metadata: document.metadata, parentId, sortOrder: document.sortOrder, crumb: document.crumb, updatedBy: actor.id, updatedAt: new Date(document.updatedAt), publishedAt: new Date(document.publishedAt ?? document.contentUpdatedAt), contentUpdatedAt: new Date(document.contentUpdatedAt) },
    }).returning({ id: cmsPages.id });
    ids.set(`${document.section}/${document.slug}`, row.id);
  }
  console.log(`Imported ${documents.length} statistics/research pages.`);
}

await main();

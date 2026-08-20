/**
 * One-shot: move the CMS's images out of the repository and into the media
 * library (cms.media.md §9 step 5).
 *
 * Two kinds of reference are migrated, and both point at files committed under
 * `public/img/**`:
 *
 *   - `metadata.previewImage`  → `metadata.previewMediaId`
 *   - `![alt](/img/…)` in a body → `![alt](/media/<id>/<name>.ext)`
 *
 * Every distinct file becomes exactly one `cms_media` row, so a preview reused
 * by two pages is uploaded once and both end up pointing at the same id. The
 * bytes go through the same finalization the browser uses — sniffed, EXIF
 * stripped, hashed — so a migrated image is indistinguishable from an uploaded
 * one, rather than a second class of asset with its own edge cases.
 *
 * Dry run by default; `--apply` writes. Content rewriting happens in one
 * transaction per page, after every file it needs has been stored: a page is
 * never left pointing at an id that does not exist.
 *
 * Idempotent. A file already imported (matched by its `original_filename`) is
 * reused rather than uploaded again, and a page with no legacy references is
 * skipped, so a second run finds nothing and exits 0.
 *
 * Files under `public/img/**` are NOT deleted. That is deliberate and is step 7
 * of the rollout: keep one rollback window, then remove only files proven to
 * have a ready media row and no remaining reference in code or content.
 *
 *   bun run scripts/importMediaLibrary.ts
 *   bun run scripts/importMediaLibrary.ts --apply
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cmsMedia, cmsMediaCollections, cmsPages } from "@/db/schema";
import { buildMediaPermalink } from "@/content-system/media/permalink";
import { extractBodyReferences } from "@/content-system/media/references";
import { CmsMediaStore } from "@/cms/media/server/store";
import { processImageBytes, storeMaster } from "@/cms/media/server/uploads";
import { isMediaStorageConfigured } from "@/cms/media/server/storage";
import { reconcileMediaUsage } from "@/cms/media/server/usage";
import { titleFromFilename, collectionSlug } from "@/cms/media/server/service";

const APPLY = process.argv.includes("--apply");
/** Stands in for a media id during a dry run, so the report can count the pages
 * a real run would rewrite. Never written anywhere. */
const DRY_RUN_ID = "(dry-run)";
const PUBLIC_DIR = path.join(process.cwd(), "public");

const store = new CmsMediaStore(db);

/** Legacy paths and where they came from, so a `previewImage` and a body image
 * of the same file share one row. */
type Legacy = { publicPath: string; pages: Set<string> };

async function main() {
  if (!isMediaStorageConfigured()) {
    throw new Error(
      "Media storage is not configured; set CMS_MEDIA_* before importing.",
    );
  }

  const pages = await db
    .select({
      id: cmsPages.id,
      section: cmsPages.section,
      slug: cmsPages.slug,
      bodyMdx: cmsPages.bodyMdx,
      metadata: cmsPages.metadata,
      lockVersion: cmsPages.lockVersion,
    })
    .from(cmsPages);

  // ── 1. find every legacy reference ──────────────────────────────────────
  const legacy = new Map<string, Legacy>();
  const note = (publicPath: string, pageId: string) => {
    const entry = legacy.get(publicPath) ?? {
      publicPath,
      pages: new Set<string>(),
    };
    entry.pages.add(pageId);
    legacy.set(publicPath, entry);
  };

  for (const page of pages) {
    const preview = (page.metadata as Record<string, unknown> | null)
      ?.previewImage;
    if (typeof preview === "string" && preview) note(preview, page.id);
    for (const image of extractBodyReferences(page.bodyMdx).legacy) {
      note(image.url, page.id);
    }
  }

  console.log(
    `${pages.length} pages · ${legacy.size} distinct legacy images referenced`,
  );
  if (legacy.size === 0) {
    console.log("Nothing to import.");
    return;
  }

  // ── 2. import each file once ────────────────────────────────────────────
  /** legacy public path → media id */
  const imported = new Map<string, string>();
  const collections = new Map<string, string>();

  for (const entry of [...legacy.values()].sort((a, b) =>
    a.publicPath.localeCompare(b.publicPath),
  )) {
    const filename = path.basename(entry.publicPath);

    const existing = await db.query.cmsMedia.findFirst({
      where: eq(cmsMedia.originalFilename, filename),
      columns: { id: true, status: true },
    });
    if (existing && existing.status === "ready") {
      imported.set(entry.publicPath, existing.id);
      console.log(`  = ${entry.publicPath} (already imported)`);
      continue;
    }

    const bytes = await readFile(path.join(PUBLIC_DIR, entry.publicPath)).catch(
      () => null,
    );
    if (!bytes) {
      console.warn(`  ! ${entry.publicPath} — file missing under public/`);
      continue;
    }

    if (!APPLY) {
      console.log(
        `  + ${entry.publicPath} (${(bytes.length / 1024).toFixed(0)} kB, ${entry.pages.size} page(s))`,
      );
      // Recorded with a placeholder so the rewrite pass below can count the
      // pages this would touch. A dry run that reported "0 pages" because it
      // had not imported anything yet would be worse than no dry run.
      imported.set(entry.publicPath, DRY_RUN_ID);
      continue;
    }

    // The same pipeline the browser upload uses, so a migrated image is not a
    // second class of asset.
    const processed = await processImageBytes(bytes);
    const collectionId = await collectionFor(entry.publicPath, collections);
    const pending = await store.insertPending({
      originalFilename: filename,
      displayName: titleFromFilename(filename),
      // Never used: the bytes are already in hand, so there is no staged upload
      // to read. Cleared by `finalize` on the next line.
      stagingKey: `import:${filename}`,
      collectionId,
      actorId: await anyUserId(),
      now: new Date(),
    });
    const objectKey = await storeMaster({
      mediaId: pending.id,
      stagingKey: `import:${filename}`,
      processed,
    });
    const ready = await store.finalize({
      id: pending.id,
      objectKey,
      mimeType: processed.mimeType,
      byteSize: processed.byteSize,
      width: processed.width,
      height: processed.height,
      sha256: processed.sha256,
      now: new Date(),
    });
    if (!ready) throw new Error(`could not finalize ${entry.publicPath}`);
    imported.set(entry.publicPath, ready.id);
    console.log(
      `  + ${entry.publicPath} → ${ready.id} (${processed.width}×${processed.height})`,
    );
  }

  // ── 3. rewrite the pages ────────────────────────────────────────────────
  let rewritten = 0;
  for (const page of pages) {
    const metadata = { ...(page.metadata as Record<string, unknown>) };
    let body = page.bodyMdx;
    let changed = false;

    const preview = metadata.previewImage;
    if (typeof preview === "string" && imported.has(preview)) {
      metadata.previewMediaId = imported.get(preview);
      delete metadata.previewImage;
      changed = true;
    }

    for (const image of extractBodyReferences(page.bodyMdx).legacy) {
      const id = imported.get(image.url);
      if (!id) continue;
      if (id === DRY_RUN_ID) {
        changed = true;
        continue;
      }
      const asset = await store.findById(id);
      if (!asset) continue;
      const permalink = buildMediaPermalink({
        id: asset.id,
        displayName: asset.displayName,
        originalFilename: asset.originalFilename,
      });
      // Replace the destination only, leaving the alt text exactly as written.
      // The alt belongs to the use, and this migration has no business
      // rewording it.
      body = body.split(`](${image.url})`).join(`](${permalink})`);
      changed = true;
    }

    if (!changed) continue;
    rewritten += 1;
    if (!APPLY) {
      console.log(`  ~ ${page.section}/${page.slug} would be rewritten`);
      continue;
    }
    await db
      .update(cmsPages)
      .set({ bodyMdx: body, metadata, lockVersion: page.lockVersion + 1 })
      .where(eq(cmsPages.id, page.id));
    console.log(`  ~ ${page.section}/${page.slug} rewritten`);
  }

  if (APPLY) {
    // The usage table is derived, and every reference just changed shape.
    const report = await reconcileMediaUsage(db);
    console.log(
      `Usage rebuilt: ${report.pagesScanned} pages, ${report.referencesFound} references, ${report.unresolved.length} unresolved`,
    );
    // Everything that has a usage row was in use before this ran, so seed the
    // timestamps — otherwise every migrated image reports as «nunca usada» and
    // the two unused views are wrong from day one.
    await db.execute(
      `update cms_media set first_used_at = coalesce(first_used_at, now()),
                            last_referenced_at = coalesce(last_referenced_at, now())
       where exists (select 1 from cms_media_usage u where u.media_id = cms_media.id)`,
    );
  }

  console.log(
    APPLY
      ? `Done. ${imported.size} images imported, ${rewritten} pages rewritten.`
      : `Dry run. ${legacy.size} images and ${rewritten} pages would change. Re-run with --apply.`,
  );
  console.log(
    "public/img/** is untouched on purpose — remove those files in a later deploy, once this one has stuck.",
  );
}

/** Group imported images by the section directory they came from, so the
 * library opens with something better than one undifferentiated pile. */
async function collectionFor(
  publicPath: string,
  cache: Map<string, string>,
): Promise<string | null> {
  const match = /^\/img\/(guias|estadisticas|investigaciones)\//.exec(
    publicPath,
  );
  if (!match) return null;
  const name = {
    guias: "Guías",
    estadisticas: "Estadísticas",
    investigaciones: "Investigaciones",
  }[match[1] as "guias" | "estadisticas" | "investigaciones"];
  const cached = cache.get(name);
  if (cached) return cached;

  const slug = collectionSlug(name);
  const existing = await store.findCollectionBySlug(slug);
  if (existing) {
    cache.set(name, existing.id);
    return existing.id;
  }
  const [created] = await db
    .insert(cmsMediaCollections)
    .values({ name, slug })
    .returning();
  cache.set(name, created.id);
  return created.id;
}

/** Authorship is a real foreign key. Migrated rows are attributed to whoever is
 * in the database rather than to nobody, because "imported by the migration" is
 * not an account and a null author reads as data loss. */
let cachedUser: string | null = null;
async function anyUserId(): Promise<string> {
  if (cachedUser) return cachedUser;
  const user = await db.query.users.findFirst({ columns: { id: true } });
  if (!user) throw new Error("no users in this database to attribute to");
  cachedUser = user.id;
  return cachedUser;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

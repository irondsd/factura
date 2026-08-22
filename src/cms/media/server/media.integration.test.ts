import { eq, inArray, like } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, hasTestDatabase } from "../../server/testDb";
import {
  CmsConflictError,
  CmsMediaInUseError,
  CmsValidationError,
} from "../../server/errors";
import type { CmsActor } from "../../types";
import { CmsMediaService } from "./service";
import { CmsMediaStore } from "./store";
import { isMediaStorageConfigured, listAllKeys, MEDIA_PREFIX } from "./storage";
import { reconcileMediaUsage, usageEntriesFor } from "./usage";
import { purgeAsset } from "./purge";

// The media library against a real PostgreSQL *and* a real S3 — MinIO locally.
//
// Both halves have to be real for this suite to mean anything. The trash gate
// is a `where` clause and a row count; "no stray objects" is a claim about what
// a bucket actually contains after a sequence of failures. Neither is exercised
// by a stub.
//
// Skipped when there is no local database or no media bucket. `bun run test:db`
// runs them.

const TEST_PREFIX = "zz-media-test-";

/** A real, decodable image — generated rather than committed, so the suite has
 * no fixtures to keep in sync and can make one of any size it needs. */
async function png(width = 40, height = 24): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 40, b: 40 },
    },
  })
    .png()
    .toBuffer();
}

if (!hasTestDatabase() || !isMediaStorageConfigured()) {
  describe.skip("CMS media library", () => {
    it("needs a local database and media bucket — run `bun run test:db`", () => {});
  });
} else {
  describe("CMS media library", () => {
    const { db, client } = createTestDb();
    const store = new CmsMediaStore(db);
    const service = new CmsMediaService(store);
    const schema = db._.fullSchema;

    const actor: CmsActor = {
      userId: "",
      email: "cms-test@example.com",
      name: "CMS Test",
      role: "admin",
    };

    /** Drive a whole upload the way the browser does: reserve, PUT the bytes at
     * the presigned URL, finalize. Nothing here shortcuts the contract. */
    async function upload(
      filename: string,
      bytes?: Buffer,
      collectionId?: string | null,
    ) {
      const body = bytes ?? (await png());
      const reservation = await service.reserveUpload(actor, {
        filename,
        contentType: "image/png",
        byteSize: body.length,
        collectionId: collectionId ?? null,
      });
      const response = await fetch(reservation.uploadUrl, {
        method: "PUT",
        body: new Uint8Array(body),
        headers: { "Content-Type": "image/png" },
      });
      expect(response.ok, `presigned PUT failed: ${response.status}`).toBe(
        true,
      );
      return service.completeUpload(actor, { mediaId: reservation.mediaId });
    }

    /** Every media row this suite made, so cleanup takes its objects too. */
    const created = new Set<string>();
    async function cleanup() {
      const rows = await db
        .select({ id: schema.cmsMedia.id })
        .from(schema.cmsMedia)
        .where(like(schema.cmsMedia.originalFilename, `${TEST_PREFIX}%`));
      const ids = [...new Set([...created, ...rows.map((r) => r.id)])];
      if (ids.length) {
        await db
          .delete(schema.cmsMediaUsage)
          .where(inArray(schema.cmsMediaUsage.mediaId, ids));
        for (const id of ids) {
          const keys = await store.objectKeysOf(id);
          for (const key of [keys?.objectKey, keys?.stagingKey]) {
            if (key) {
              const { deleteObject } = await import("./storage");
              await deleteObject(key).catch(() => {});
            }
          }
        }
        await db
          .delete(schema.cmsMedia)
          .where(inArray(schema.cmsMedia.id, ids));
      }
      created.clear();
      await db
        .delete(schema.cmsMediaCollections)
        .where(like(schema.cmsMediaCollections.name, `${TEST_PREFIX}%`));
      // Pointers first, then revisions, then pages: every foreign key between
      // the three is `restrict` or `cascade` in a direction that refuses the
      // shortcut, which is the protection production relies on.
      const mine = like(schema.cmsPages.slug, `${TEST_PREFIX}%`);
      await db
        .update(schema.cmsPages)
        .set({
          publishedRevisionId: null,
          previewRevisionId: null,
          wipRevisionId: null,
          checkpointRevisionId: null,
        })
        .where(mine);
      await db
        .delete(schema.cmsPageRevisions)
        .where(
          inArray(
            schema.cmsPageRevisions.pageId,
            db
              .select({ id: schema.cmsPages.id })
              .from(schema.cmsPages)
              .where(mine),
          ),
        );
      await db.delete(schema.cmsPages).where(mine);
    }

    beforeEach(async () => {
      await cleanup();
      const user = await db.query.users.findFirst({ columns: { id: true } });
      if (!user) throw new Error("local database has no users to author as");
      actor.userId = user.id;
    });

    afterAll(async () => {
      await cleanup();
      await client.end();
    });

    describe("upload", () => {
      it("reserves a row before the presigned URL exists, so no object can be unknown", async () => {
        const reservation = await service.reserveUpload(actor, {
          filename: `${TEST_PREFIX}reserved.png`,
          contentType: "image/png",
          byteSize: 100,
        });
        created.add(reservation.mediaId);

        const row = await store.findById(reservation.mediaId);
        expect(row?.status).toBe("pending");
        // The key the URL points at is already recorded.
        expect(
          (await store.objectKeysOf(reservation.mediaId))?.stagingKey,
        ).toBeTruthy();
      });

      it("stores a master, records its real dimensions, and clears the staging key", async () => {
        const asset = await upload(`${TEST_PREFIX}a.png`, await png(64, 32));
        created.add(asset.id);

        expect(asset.status).toBe("ready");
        expect(asset.width).toBe(64);
        expect(asset.height).toBe(32);
        expect(asset.mimeType).toBe("image/png");
        expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);

        const keys = await store.objectKeysOf(asset.id);
        expect(keys?.stagingKey).toBeNull();
        expect(keys?.objectKey).toMatch(
          new RegExp(`^${MEDIA_PREFIX}/${asset.id}/[0-9a-f]{16}\\.png$`),
        );
      });

      it("leaves no staging object behind once finalization succeeds", async () => {
        const asset = await upload(`${TEST_PREFIX}staging.png`);
        created.add(asset.id);
        const keys = await listAllKeys(`${MEDIA_PREFIX}/_incoming`);
        expect(keys.map((k) => k.key)).not.toContain(
          `${MEDIA_PREFIX}/_incoming/${asset.id}`,
        );
      });

      it("refuses a file whose bytes are not an image, whatever it claimed", async () => {
        const reservation = await service.reserveUpload(actor, {
          filename: `${TEST_PREFIX}fake.png`,
          contentType: "image/png",
          byteSize: 12,
        });
        created.add(reservation.mediaId);
        await fetch(reservation.uploadUrl, {
          method: "PUT",
          body: "not an image at all",
          headers: { "Content-Type": "image/png" },
        });

        await expect(
          service.completeUpload(actor, { mediaId: reservation.mediaId }),
        ).rejects.toThrow(CmsValidationError);
        // Still pending, so the sweep collects it. Never half-ready.
        expect((await store.findById(reservation.mediaId))?.status).toBe(
          "pending",
        );
      });

      it("refuses an unsupported format at reservation, before any bytes move", async () => {
        await expect(
          service.reserveUpload(actor, {
            filename: `${TEST_PREFIX}vector.svg`,
            contentType: "image/svg+xml",
            byteSize: 500,
          }),
        ).rejects.toThrow(CmsValidationError);
      });

      it("is idempotent: finalizing twice returns the same ready asset", async () => {
        const asset = await upload(`${TEST_PREFIX}twice.png`);
        created.add(asset.id);
        const again = await service.completeUpload(actor, {
          mediaId: asset.id,
        });
        expect(again.id).toBe(asset.id);
        expect(again.status).toBe("ready");
      });
    });

    describe("metadata", () => {
      it("refuses blank alt unless the image is declared decorative", async () => {
        const asset = await upload(`${TEST_PREFIX}alt.png`);
        created.add(asset.id);

        await expect(
          service.update(actor, {
            id: asset.id,
            expectedLockVersion: asset.lockVersion,
            patch: { defaultAlt: "  ", decorative: false },
          }),
        ).rejects.toThrow(CmsValidationError);

        const decorative = await service.update(actor, {
          id: asset.id,
          expectedLockVersion: asset.lockVersion,
          patch: { defaultAlt: "", decorative: true },
        });
        expect(decorative.decorative).toBe(true);
      });

      it("reports a stale edit as a conflict rather than overwriting", async () => {
        const asset = await upload(`${TEST_PREFIX}lock.png`);
        created.add(asset.id);
        await service.update(actor, {
          id: asset.id,
          expectedLockVersion: asset.lockVersion,
          patch: { defaultAlt: "Primera" },
        });
        await expect(
          service.update(actor, {
            id: asset.id,
            expectedLockVersion: asset.lockVersion,
            patch: { defaultAlt: "Segunda" },
          }),
        ).rejects.toThrow(CmsConflictError);
      });
    });

    describe("usage", () => {
      /** A real page, because usage rows have a foreign key to one. */
      /** A page and its working copy, inserted directly.
       *
       * Directly rather than through `CmsContentService` on purpose: these
       * tests are about the media library's view of stored revisions, and going
       * through the content service would drag its validator, its history and
       * its cache invalidation into a suite that measures none of them. What
       * they do need is a real `cms_page_revision` row, because usage is keyed
       * by revision now — a page with no revision references nothing. */
      async function page(slug: string, body: string, metadata: unknown = {}) {
        const [row] = await db
          .insert(schema.cmsPages)
          .values({
            section: "guias",
            slug: `${TEST_PREFIX}${slug}`,
            status: "draft",
          })
          .returning();
        const [revision] = await db
          .insert(schema.cmsPageRevisions)
          .values({
            pageId: row.id,
            kind: "wip",
            bodyMdx: body,
            title: "Página de prueba",
            description: "Descripción.",
            summary: "Resumen.",
            cta: "Probá Factura.",
            metadata: { keywords: [], categories: [], ...(metadata as object) },
          })
          .returning();
        await db
          .update(schema.cmsPages)
          .set({ wipRevisionId: revision.id })
          .where(eq(schema.cmsPages.id, row.id));
        return revision;
      }

      it("derives usage from a body and blocks the trash while it stands", async () => {
        const asset = await upload(`${TEST_PREFIX}used.png`);
        created.add(asset.id);
        await page("uses-image", `![Un medidor](${asset.permalink})`);

        await reconcileMediaUsage(db);

        expect(await store.isReferenced(asset.id)).toBe(true);
        await expect(service.trash(actor, { id: asset.id })).rejects.toThrow(
          CmsMediaInUseError,
        );
      });

      it("counts a preview id in page metadata as usage", async () => {
        const asset = await upload(`${TEST_PREFIX}preview.png`);
        created.add(asset.id);
        await page("uses-preview", "Sin imágenes en el cuerpo.", {
          previewMediaId: asset.id,
        });

        await reconcileMediaUsage(db);
        const usage = await store.usageOf(asset.id);
        expect(usage.map((u) => u.placement)).toEqual(["preview"]);
      });

      it("rebuilds to exactly what the incremental writer would have produced", async () => {
        const asset = await upload(`${TEST_PREFIX}rebuild.png`);
        created.add(asset.id);
        const row = await page(
          "rebuild",
          `![A](${asset.permalink})\n\n![B](${asset.permalink})`,
        );

        const expected = usageEntriesFor({
          id: row.id,
          bodyMdx: row.bodyMdx,
          metadata: row.metadata,
        });
        await store.replaceRevisionUsage({
          revisionId: row.id,
          entries: expected,
          now: new Date(),
        });
        const incremental = await store.usageOf(asset.id);

        await reconcileMediaUsage(db);
        expect(await store.usageOf(asset.id)).toEqual(incremental);
        // Twice in one body is one row with a count, not two rows.
        expect(incremental).toHaveLength(1);
        expect(incremental[0].occurrences).toBe(2);
      });

      it("separates 'never used' from 'no longer used' after a reference goes away", async () => {
        const asset = await upload(`${TEST_PREFIX}dropped.png`);
        created.add(asset.id);
        const row = await page("drops-image", `![A](${asset.permalink})`);
        await reconcileMediaUsage(db);

        expect((await store.findById(asset.id))?.firstUsedAt).not.toBeNull();

        // The editor removes it from the page. Nothing is deleted.
        await db
          .update(schema.cmsPageRevisions)
          .set({ bodyMdx: "Ya no hay imagen." })
          .where(eq(schema.cmsPageRevisions.id, row.id));
        await reconcileMediaUsage(db);

        const after = await store.findById(asset.id);
        expect(after?.status).toBe("ready");
        expect(after?.firstUsedAt).not.toBeNull();

        const neverUsed = await store.list({ usage: "never-used" });
        const noLonger = await store.list({ usage: "no-longer-used" });
        expect(neverUsed.map((a) => a.id)).not.toContain(asset.id);
        expect(noLonger.map((a) => a.id)).toContain(asset.id);
      });

      it("does not move the usage timestamps backwards on a rebuild", async () => {
        const asset = await upload(`${TEST_PREFIX}stamps.png`);
        created.add(asset.id);
        const row = await page("stamps", `![A](${asset.permalink})`);
        await reconcileMediaUsage(db);
        const first = (await store.findById(asset.id))?.firstUsedAt;

        await db
          .update(schema.cmsPageRevisions)
          .set({ bodyMdx: "sin imagen" })
          .where(eq(schema.cmsPageRevisions.id, row.id));
        await reconcileMediaUsage(db);

        expect((await store.findById(asset.id))?.firstUsedAt).toBe(first);
      });
    });

    describe("retained versions pin their media", () => {
      // The property cms.md promises: a version you can still restore
      // is a version whose images still exist. It is not a sweep that has to
      // remember to run — usage is keyed by revision, so it follows the copy,
      // and the moment retention prunes that copy the cascade releases it in
      // the same transaction.

      /** A page whose *published* revision references an image, plus a working
       * copy that does not. The shape that made the old page-keyed table wrong:
       * the page no longer mentions the image, and the live article still
       * does. */
      async function publishedThenDropped(permalink: string) {
        const [pageRow] = await db
          .insert(schema.cmsPages)
          .values({
            section: "guias",
            slug: `${TEST_PREFIX}pinned`,
            status: "published",
          })
          .returning();
        const common = {
          pageId: pageRow.id,
          title: "Página de prueba",
          description: "Descripción.",
          summary: "Resumen.",
          cta: "Probá Factura.",
          metadata: { keywords: [], categories: [] },
        };
        const [publication] = await db
          .insert(schema.cmsPageRevisions)
          .values({
            ...common,
            kind: "published",
            publicationNumber: 1,
            publishedAt: new Date(),
            bodyMdx: `![A](${permalink})`,
          })
          .returning();
        const [wip] = await db
          .insert(schema.cmsPageRevisions)
          .values({ ...common, kind: "wip", bodyMdx: "Ya no hay imagen." })
          .returning();
        await db
          .update(schema.cmsPages)
          .set({ publishedRevisionId: publication.id, wipRevisionId: wip.id })
          .where(eq(schema.cmsPages.id, pageRow.id));
        return { pageRow, publication, wip };
      }

      it("refuses the trash while a published version still references it", async () => {
        const asset = await upload(`${TEST_PREFIX}pinned.png`);
        created.add(asset.id);
        const { publication } = await publishedThenDropped(asset.permalink);
        await reconcileMediaUsage(db);

        expect(await store.isReferenced(asset.id)).toBe(true);
        await expect(service.trash(actor, { id: asset.id })).rejects.toThrow(
          CmsMediaInUseError,
        );

        // And the screen can say *which* copy is holding it — "the live
        // article uses this" and "a version nobody is reading uses this" are
        // very different answers.
        const usage = await store.usageOf(asset.id);
        expect(usage.map((reference) => reference.revisionId)).toEqual([
          publication.id,
        ]);
        expect(usage[0]).toMatchObject({ kind: "published", isLive: true });
      });

      it("releases it the moment the last retaining version is pruned", async () => {
        const asset = await upload(`${TEST_PREFIX}released.png`);
        created.add(asset.id);
        const { pageRow, publication } = await publishedThenDropped(
          asset.permalink,
        );
        await reconcileMediaUsage(db);
        expect(await store.isReferenced(asset.id)).toBe(true);

        // Retention deleting that publication: the pointer is cleared first,
        // exactly as `CmsContentService.publish` does it, and the usage row
        // goes with the revision through the cascade.
        await db
          .update(schema.cmsPages)
          .set({ publishedRevisionId: null, status: "draft" })
          .where(eq(schema.cmsPages.id, pageRow.id));
        await db
          .delete(schema.cmsPageRevisions)
          .where(eq(schema.cmsPageRevisions.id, publication.id));

        expect(await store.isReferenced(asset.id)).toBe(false);
        await expect(
          service.trash(actor, { id: asset.id }),
        ).resolves.toMatchObject({ status: "trashed" });
      });

      it("counts one page even when two of its versions use the image", async () => {
        // The library's number is "places a reader could meet this", so the
        // live article and the draft about to replace it are one page.
        const asset = await upload(`${TEST_PREFIX}twice.png`);
        created.add(asset.id);
        const { pageRow, wip } = await publishedThenDropped(asset.permalink);
        // Scoped to this revision by id. `where kind = 'wip'` would rewrite
        // every working copy in the database — including any the local
        // developer happens to have open — and the count this asserts on would
        // then depend on state the test does not own.
        await db
          .update(schema.cmsPageRevisions)
          .set({ bodyMdx: `![A](${asset.permalink})` })
          .where(eq(schema.cmsPageRevisions.id, wip.id));
        await reconcileMediaUsage(db);

        const listed = await store.list({ search: TEST_PREFIX });
        expect(listed.find((row) => row.id === asset.id)?.usageCount).toBe(1);
        expect((await store.usageOf(asset.id)).map((r) => r.pageId)).toEqual([
          pageRow.id,
          pageRow.id,
        ]);
      });
    });

    describe("trash and purge", () => {
      it("keeps the bytes while trashed, and restores on demand", async () => {
        const asset = await upload(`${TEST_PREFIX}trash.png`);
        created.add(asset.id);

        const trashed = await service.trash(actor, { id: asset.id });
        expect(trashed.status).toBe("trashed");
        expect(trashed.trashedAt).not.toBeNull();

        const keys = await store.objectKeysOf(asset.id);
        const objects = await listAllKeys(`${MEDIA_PREFIX}/${asset.id}`);
        expect(objects.map((o) => o.key)).toContain(keys!.objectKey);

        const restored = await service.restore(actor, { id: asset.id });
        expect(restored.status).toBe("ready");
      });

      it("deletes the object and keeps a tombstone when purged", async () => {
        const asset = await upload(`${TEST_PREFIX}purge.png`);
        created.add(asset.id);
        const keys = await store.objectKeysOf(asset.id);

        await service.trash(actor, { id: asset.id });
        await service.purgeNow(actor, { id: asset.id });

        expect(await listAllKeys(keys!.objectKey!)).toEqual([]);
        const tombstone = await store.findById(asset.id);
        expect(tombstone?.status).toBe("purged");
      });

      it("restores instead of deleting when a reference appeared while trashed", async () => {
        const asset = await upload(`${TEST_PREFIX}raced.png`);
        created.add(asset.id);
        await service.trash(actor, { id: asset.id });

        // The interleaving the grace period exists for: another editor puts the
        // image on a page while it sits in the trash.
        await page("races", `![A](${asset.permalink})`);
        await reconcileMediaUsage(db);

        const outcome = await purgeAsset({ id: asset.id, actorId: null });
        expect(outcome).toBe("restored");
        expect((await store.findById(asset.id))?.status).toBe("ready");

        const keys = await store.objectKeysOf(asset.id);
        expect((await listAllKeys(keys!.objectKey!)).length).toBe(1);
      });

      async function page(slug: string, body: string) {
        const [row] = await db
          .insert(schema.cmsPages)
          .values({
            section: "guias",
            slug: `${TEST_PREFIX}${slug}`,
            status: "draft",
          })
          .returning();
        const [revision] = await db
          .insert(schema.cmsPageRevisions)
          .values({
            pageId: row.id,
            kind: "wip",
            bodyMdx: body,
            title: "Página de prueba",
            description: "Descripción.",
            summary: "Resumen.",
            cta: "Probá Factura.",
            metadata: { keywords: [], categories: [] },
          })
          .returning();
        await db
          .update(schema.cmsPages)
          .set({ wipRevisionId: revision.id })
          .where(eq(schema.cmsPages.id, row.id));
        return revision;
      }
    });

    describe("collections", () => {
      it("groups media without touching the object key", async () => {
        const collection = await service.createCollection(actor, {
          name: `${TEST_PREFIX}Guías`,
        });
        const asset = await upload(
          `${TEST_PREFIX}filed.png`,
          undefined,
          collection.id,
        );
        created.add(asset.id);
        const keyBefore = (await store.objectKeysOf(asset.id))?.objectKey;

        const moved = await service.update(actor, {
          id: asset.id,
          expectedLockVersion: asset.lockVersion,
          patch: { collectionId: null },
        });

        expect(moved.collectionId).toBeNull();
        expect((await store.objectKeysOf(asset.id))?.objectKey).toBe(keyBefore);
      });

      it("counts the media in each collection", async () => {
        // A regression test for a silent bug: the count was a correlated
        // subquery whose outer column reference rendered unqualified, so
        // PostgreSQL resolved it against the inner table and every collection
        // reported zero. Nothing failed — the number was just always wrong.
        const collection = await service.createCollection(actor, {
          name: `${TEST_PREFIX}Contadas`,
        });
        for (const name of ["one", "two"]) {
          const asset = await upload(
            `${TEST_PREFIX}count-${name}.png`,
            undefined,
            collection.id,
          );
          created.add(asset.id);
        }

        const listed = await store.listCollections();
        expect(listed.find((item) => item.id === collection.id)?.count).toBe(2);
      });

      it("does not delete media when a collection is deleted", async () => {
        const collection = await service.createCollection(actor, {
          name: `${TEST_PREFIX}Temporal`,
        });
        const asset = await upload(
          `${TEST_PREFIX}orphan.png`,
          undefined,
          collection.id,
        );
        created.add(asset.id);

        await service.deleteCollection(actor, collection.id);

        const after = await store.findById(asset.id);
        expect(after?.status).toBe("ready");
        expect(after?.collectionId).toBeNull();
      });
    });
  });
}

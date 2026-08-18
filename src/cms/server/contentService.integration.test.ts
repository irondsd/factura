import { eq, like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  documentsFromDatabase,
  parseSnapshot,
  serializeSnapshot,
} from "@/content-system/adapters/database";
import { PostgresContentRepository } from "@/content-system/repository/postgres";
import { buildContentTree, ownSegment } from "@/content-system/hierarchy";
import type { ContentStatus, ValidationResult } from "@/content-system/types";
import type { CmsActor } from "../types";
import { CmsContentService } from "./contentService";
import {
  CmsConflictError,
  CmsSlugTakenError,
  CmsValidationError,
} from "./errors";
import { CmsPageStore } from "./store";
import { createTestDb, hasTestDatabase } from "./testDb";

// The Phase 2 gate: "Lifecycle behavior is proven at the repository layer
// before UI work." Proving it against a real PostgreSQL rather than a fake is
// the point — the visibility rules are `where` clauses and the concurrency
// guarantee is a single UPDATE's row count, and neither is exercised by a
// stub.
//
// Skipped when there is no local database (CI). `bun run test:db` runs them.

/** Every row this suite creates is named so, and only rows named so are ever
 * deleted. The local database also holds hand-made pages and, later, imported
 * guides; a suite that truncated the table would eat them. */
const TEST_PREFIX = "zz-cms-test-";

const metadata = {
  keywords: ["prueba", "cms", "factura"],
  categories: ["servicios"],
};

const draftInput = (slug: string) => ({
  section: "guias" as const,
  slug: `${TEST_PREFIX}${slug}`,
  title: "Página de prueba",
  description: "Descripción de prueba para la suite de integración del CMS.",
  summary: "Resumen de prueba.",
  cta: "Probá Factura.",
  body: "Cuerpo de prueba.\n",
  metadata,
});

// `describe.skip` still *evaluates* its callback to collect the tests inside it,
// so the connection below cannot be opened at suite level under a skip — the
// branch has to happen before the suite is registered at all. Vitest also
// refuses a file with no suites, hence the placeholder.
if (!hasTestDatabase()) {
  describe.skip("CMS content service against PostgreSQL", () => {
    it("needs a local database — run `bun run test:db`", () => {});
  });
} else {
  describe("CMS content service against PostgreSQL", () => {
    const { db, client } = createTestDb();
    const store = new CmsPageStore(db);
    const repository = new PostgresContentRepository(db);

    const actor: CmsActor = {
      userId: "",
      email: "cms-test@example.com",
      role: "admin",
    };

    /** A validator that accepts everything, so these tests measure lifecycle and
     * concurrency rather than Phase 4's rules. The two tests that care about
     * refusal install their own. */
    const permissive = (): ValidationResult => ({ ok: true, diagnostics: [] });

    const service = new CmsContentService(permissive, store);

    const cmsSchema = db._.fullSchema;

    async function cleanup() {
      await db
        .delete(cmsSchema.cmsPages)
        .where(like(cmsSchema.cmsPages.slug, `${TEST_PREFIX}%`));
    }

    beforeEach(async () => {
      await cleanup();
      // Authorship is a real foreign key, so the actor has to be a real account.
      // Reuse any existing local user rather than creating one — this suite
      // should not leave accounts behind.
      const user = await db.query.users.findFirst({ columns: { id: true } });
      if (!user) throw new Error("local database has no users to author as");
      actor.userId = user.id;
    });

    afterAll(async () => {
      await cleanup();
      await client.end();
    });

    describe("lifecycle visibility", () => {
      it("hides a draft from every public read", async () => {
        const page = await service.create(actor, draftInput("draft"));
        expect(page.status).toBe("draft");

        expect(await repository.getByPath("guias", [page.slug])).toBeNull();
        expect(
          (await repository.listPublished("guias")).map((s) => s.slug),
        ).not.toContain(page.slug);
        expect(
          (await repository.listPubliclyRenderable("guias")).map((s) => s.slug),
        ).not.toContain(page.slug);
      });

      it("renders a preview at its URL but keeps it out of listings", async () => {
        const page = await service.create(actor, draftInput("preview"));
        const previewed = await service.setStatus(actor, {
          id: page.id,
          status: "preview",
          expectedLockVersion: page.lockVersion,
        });

        expect(
          await repository.getByPath("guias", [previewed.slug]),
        ).not.toBeNull();
        expect(
          (await repository.listPublished("guias")).map((s) => s.slug),
        ).not.toContain(previewed.slug);
        // The one list it does belong to: callers that need to know a path
        // resolves, such as generateStaticParams.
        expect(
          (await repository.listPubliclyRenderable("guias")).map((s) => s.slug),
        ).toContain(previewed.slug);
      });

      it("renders and lists a published page", async () => {
        const page = await service.create(actor, draftInput("published"));
        const live = await service.setStatus(actor, {
          id: page.id,
          status: "published",
          expectedLockVersion: page.lockVersion,
        });

        expect(live.publishedAt).not.toBeNull();
        expect(await repository.getByPath("guias", [live.slug])).not.toBeNull();
        expect(
          (await repository.listPublished("guias")).map((s) => s.slug),
        ).toContain(live.slug);
      });

      it("removes an unpublished page from public reads immediately", async () => {
        const page = await service.create(actor, draftInput("unpublish"));
        const live = await service.setStatus(actor, {
          id: page.id,
          status: "published",
          expectedLockVersion: page.lockVersion,
        });
        const down = await service.setStatus(actor, {
          id: live.id,
          status: "draft",
          expectedLockVersion: live.lockVersion,
        });

        expect(down.status).toBe("draft");
        expect(await repository.getByPath("guias", [down.slug])).toBeNull();
        // Kept, not cleared: republishing must not move the dateline.
        expect(down.publishedAt).toBe(live.publishedAt);
      });

      it("keeps every status visible to the CMS", async () => {
        const draft = await service.create(actor, draftInput("cms-visible"));
        const listed = await service.list(actor, { search: TEST_PREFIX });
        expect(listed.map((s) => s.id)).toContain(draft.id);
        expect(await service.get(actor, draft.id)).toMatchObject({
          id: draft.id,
          status: "draft",
        });
      });

      it("refuses a duplicate slug", async () => {
        await service.create(actor, draftInput("dupe"));
        await expect(service.create(actor, draftInput("dupe"))).rejects.toThrow(
          CmsSlugTakenError,
        );
      });
    });

    describe("optimistic concurrency", () => {
      it("rejects a save made against a stale version", async () => {
        const page = await service.create(actor, draftInput("conflict"));

        // Two editors load the same page.
        const editorA = page.lockVersion;
        const editorB = page.lockVersion;

        await service.update(actor, {
          id: page.id,
          expectedLockVersion: editorA,
          patch: { title: "Guardado por A" },
        });

        await expect(
          service.update(actor, {
            id: page.id,
            expectedLockVersion: editorB,
            patch: { title: "Guardado por B" },
          }),
        ).rejects.toThrow(CmsConflictError);

        // A's work is intact: the losing save changed nothing at all.
        const after = await service.get(actor, page.id);
        expect(after.title).toBe("Guardado por A");
      });

      it("reports the version actually in the database", async () => {
        const page = await service.create(
          actor,
          draftInput("conflict-version"),
        );
        await service.update(actor, {
          id: page.id,
          expectedLockVersion: page.lockVersion,
          patch: { title: "Uno" },
        });

        const error = await service
          .update(actor, {
            id: page.id,
            expectedLockVersion: page.lockVersion,
            patch: { title: "Dos" },
          })
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(CmsConflictError);
        expect((error as CmsConflictError).expectedLockVersion).toBe(
          page.lockVersion,
        );
        expect((error as CmsConflictError).actualLockVersion).toBe(
          page.lockVersion + 1,
        );
      });

      it("increments the version on every accepted save", async () => {
        const page = await service.create(actor, draftInput("versions"));
        expect(page.lockVersion).toBe(1);

        const first = await service.update(actor, {
          id: page.id,
          expectedLockVersion: page.lockVersion,
          patch: { title: "Uno" },
        });
        expect(first.lockVersion).toBe(2);

        const second = await service.update(actor, {
          id: page.id,
          expectedLockVersion: first.lockVersion,
          patch: { title: "Dos" },
        });
        expect(second.lockVersion).toBe(3);
      });

      it("blocks a stale status transition too", async () => {
        const page = await service.create(actor, draftInput("stale-status"));
        await service.update(actor, {
          id: page.id,
          expectedLockVersion: page.lockVersion,
          patch: { body: "Cuerpo nuevo." },
        });

        await expect(
          service.setStatus(actor, {
            id: page.id,
            status: "published",
            expectedLockVersion: page.lockVersion,
          }),
        ).rejects.toThrow(CmsConflictError);

        const after = await service.get(actor, page.id);
        expect(after.status).toBe("draft");
      });
    });

    describe("timestamps", () => {
      it("moves the editorial timestamp on a content edit", async () => {
        const page = await service.create(actor, draftInput("edited"));
        const edited = await service.update(actor, {
          id: page.id,
          expectedLockVersion: page.lockVersion,
          patch: { body: "Cuerpo corregido." },
        });
        expect(Date.parse(edited.contentUpdatedAt)).toBeGreaterThanOrEqual(
          Date.parse(page.contentUpdatedAt),
        );
      });

      it("levels the editorial timestamp on a first publication", async () => {
        // Otherwise a page created now and published a moment later has
        // "updated" before "published", which the document validator rejects —
        // so every subsequent save of a published page failed.
        const page = await service.create(actor, draftInput("status-only"));
        const live = await service.setStatus(actor, {
          id: page.id,
          status: "published",
          expectedLockVersion: page.lockVersion,
        });
        expect(Date.parse(live.contentUpdatedAt)).toBeGreaterThanOrEqual(
          Date.parse(live.publishedAt as string),
        );
      });

      it("leaves the editorial timestamp alone when republishing", async () => {
        // Taking a page down and putting it back must not tell every reader
        // the article was rewritten today.
        const page = await service.create(actor, draftInput("republish"));
        const live = await service.setStatus(actor, {
          id: page.id,
          status: "published",
          expectedLockVersion: page.lockVersion,
        });
        const down = await service.setStatus(actor, {
          id: live.id,
          status: "draft",
          expectedLockVersion: live.lockVersion,
        });
        const again = await service.setStatus(actor, {
          id: down.id,
          status: "published",
          expectedLockVersion: down.lockVersion,
        });
        expect(again.contentUpdatedAt).toBe(live.contentUpdatedAt);
        expect(again.publishedAt).toBe(live.publishedAt);
      });

      it("keeps a published page saveable straight after publishing", async () => {
        // The end-to-end shape of the bug above: publish, then edit, and the
        // publish-level validation that save has to pass must not trip on the
        // timestamps the publish itself wrote.
        const page = await service.create(actor, draftInput("publish-edit"));
        const live = await service.setStatus(actor, {
          id: page.id,
          status: "published",
          expectedLockVersion: page.lockVersion,
        });
        const edited = await service.update(actor, {
          id: live.id,
          expectedLockVersion: live.lockVersion,
          patch: { body: "Cuerpo corregido tras publicar." },
        });
        expect(edited.body).toBe("Cuerpo corregido tras publicar.");
      });
    });

    describe("validation gate", () => {
      /** Fails only at publish level — the shape of a page with real editorial
       * problems (a too-long title, a missing FAQ) but no forbidden syntax. A
       * validator that failed at every level would be testing "grammar errors
       * block everything", which is a different rule. */
      const failsPublishOnly = ({
        level,
      }: {
        level: string;
      }): ValidationResult =>
        level === "publish"
          ? {
              ok: false,
              diagnostics: [
                { code: "test.rejected", severity: "error", message: "nope" },
              ],
            }
          : { ok: true, diagnostics: [] };

      it("refuses to publish content that does not validate", async () => {
        const page = await service.create(actor, draftInput("invalid-publish"));
        const strict = new CmsContentService(failsPublishOnly, store);

        await expect(
          strict.setStatus(actor, {
            id: page.id,
            status: "published",
            expectedLockVersion: page.lockVersion,
          }),
        ).rejects.toThrow(CmsValidationError);

        expect((await service.get(actor, page.id)).status).toBe("draft");
      });

      it("still lets an invalid page be taken down", async () => {
        const page = await service.create(actor, draftInput("rescue"));
        const live = await service.setStatus(actor, {
          id: page.id,
          status: "published",
          expectedLockVersion: page.lockVersion,
        });

        // The page is live and no longer passes publish validation. Unpublishing
        // is the recovery action: it drops to draft level and goes through.
        const strict = new CmsContentService(failsPublishOnly, store);
        const down = await strict.setStatus(actor, {
          id: live.id,
          status: "draft",
          expectedLockVersion: live.lockVersion,
        });
        expect(down.status).toBe("draft");
      });

      it("blocks a save that fails even at draft level", async () => {
        // The other half of the rule: ordinary editorial errors are allowed
        // through on a draft, but a grammar failure — forbidden syntax, in
        // Phase 3's terms — is refused at every level, and the previously saved
        // body survives.
        const page = await service.create(actor, draftInput("grammar"));
        const always = (): ValidationResult => ({
          ok: false,
          diagnostics: [
            { code: "test.forbidden", severity: "error", message: "no JS" },
          ],
        });
        const strict = new CmsContentService(always, store);

        await expect(
          strict.update(actor, {
            id: page.id,
            expectedLockVersion: page.lockVersion,
            patch: { body: "<script>alert(1)</script>" },
          }),
        ).rejects.toThrow(CmsValidationError);

        const after = await service.get(actor, page.id);
        expect(after.body).toBe(page.body);
        expect(after.lockVersion).toBe(page.lockVersion);
      });
    });

    describe("hierarchy", () => {
      // Exercised in `guias` deliberately. Guides are all flat today, but the
      // capability is uniform — if any of this only worked for statistics, a
      // per-section branch would have crept in.
      it("creates a child under a parent", async () => {
        const hub = await service.create(actor, draftInput("hub"));
        const child = await service.create(actor, {
          ...draftInput("hub/hija"),
          slug: `${hub.slug}/hija`,
          parentId: hub.id,
          sortOrder: 1,
          crumb: "Hija",
        });

        expect(child.parentId).toBe(hub.id);
        expect(child.slug).toBe(`${hub.slug}/hija`);
        expect(child.crumb).toBe("Hija");
      });

      it("refuses a child whose path does not sit under its parent", async () => {
        const hub = await service.create(actor, draftInput("hub2"));
        await expect(
          service.create(actor, {
            ...draftInput("otra-rama"),
            parentId: hub.id,
          }),
        ).rejects.toThrow(CmsValidationError);
      });

      it("refuses a nested path with no parent", async () => {
        await expect(
          service.create(actor, {
            ...draftInput("huerfana"),
            slug: `${TEST_PREFIX}sin-padre/huerfana`,
          }),
        ).rejects.toThrow(CmsValidationError);
      });

      it("refuses a parent in another section", async () => {
        const hub = await service.create(actor, draftInput("hub3"));
        await expect(
          service.create(actor, {
            ...draftInput("ajena"),
            section: "estadisticas",
            slug: `${hub.slug}/ajena`,
            parentId: hub.id,
          }),
        ).rejects.toThrow(CmsValidationError);
      });

      it("refuses to re-parent a page onto its own descendant", async () => {
        const hub = await service.create(actor, draftInput("hub4"));
        const child = await service.create(actor, {
          ...draftInput("hub4/hija"),
          slug: `${hub.slug}/hija`,
          parentId: hub.id,
        });

        await expect(
          service.update(actor, {
            id: hub.id,
            expectedLockVersion: hub.lockVersion,
            patch: { parentId: child.id },
          }),
        ).rejects.toThrow(CmsValidationError);
      });

      it("orders siblings by sortOrder, not alphabetically", async () => {
        const hub = await service.create(actor, draftInput("orden"));
        await service.create(actor, {
          ...draftInput("orden/zeta"),
          slug: `${hub.slug}/zeta`,
          parentId: hub.id,
          sortOrder: 1,
        });
        await service.create(actor, {
          ...draftInput("orden/alfa"),
          slug: `${hub.slug}/alfa`,
          parentId: hub.id,
          sortOrder: 2,
        });

        const listed = await service.list(actor, {
          search: `${TEST_PREFIX}orden/`,
        });
        expect(listed.map((s) => ownSegment(s.slug))).toEqual(["zeta", "alfa"]);
      });

      it("builds the tree the CMS list renders", async () => {
        const hub = await service.create(actor, draftInput("arbol"));
        const child = await service.create(actor, {
          ...draftInput("arbol/rama"),
          slug: `${hub.slug}/rama`,
          parentId: hub.id,
        });

        const pages = await service.list(actor, {
          search: `${TEST_PREFIX}arbol`,
        });
        const tree = buildContentTree(
          pages.map((p) => ({
            id: p.id,
            section: p.section,
            slug: p.slug,
            parentId: p.parentId,
            sortOrder: p.sortOrder,
          })),
        );
        expect(tree).toHaveLength(1);
        expect(tree[0].page.id).toBe(hub.id);
        expect(tree[0].children.map((c) => c.page.id)).toEqual([child.id]);
      });

      it("resolves a nested public path", async () => {
        const hub = await service.create(actor, draftInput("publica"));
        const child = await service.create(actor, {
          ...draftInput("publica/hija"),
          slug: `${hub.slug}/hija`,
          parentId: hub.id,
        });
        await service.setStatus(actor, {
          id: child.id,
          status: "published",
          expectedLockVersion: child.lockVersion,
        });

        // The slug is a materialised path, so this stays one indexed lookup
        // rather than a recursive walk.
        const found = await repository.getByPath(
          "guias",
          child.slug.split("/"),
        );
        expect(found?.id).toBe(child.id);
      });
    });

    describe("database adapter", () => {
      it("returns every state, unlike the public repository", async () => {
        // A collection validator has to see drafts: "this published page links to
        // a draft" is the finding it exists to produce.
        const draft = await service.create(actor, draftInput("adapter-draft"));
        const documents = await documentsFromDatabase("guias", db);
        expect(documents.map((d) => d.slug)).toContain(draft.slug);
        expect(
          (await repository.listPublished("guias")).map((s) => s.slug),
        ).not.toContain(draft.slug);
      });

      it("round-trips a snapshot", async () => {
        // CI has no database, so `validate:content` after cutover validates an
        // exported snapshot. It has to survive JSON.
        await service.create(actor, draftInput("adapter-snapshot"));
        const documents = await documentsFromDatabase("guias", db);
        expect(parseSnapshot(serializeSnapshot(documents))).toEqual(documents);
      });
    });

    describe("stored rows", () => {
      it("round-trips metadata through JSONB", async () => {
        const rich = {
          ...draftInput("metadata"),
          metadata: {
            keywords: ["uno", "dos", "tres"],
            categories: ["servicios", "leer-facturas"],
            faq: [{ q: "¿Pregunta?", a: "Respuesta." }],
            ogImage: { eyebrow: "Guía · Prueba", stat: "×9" },
            vendor: "Edesur",
          },
        };
        const page = await service.create(actor, rich);
        const read = await service.get(actor, page.id);
        expect(read.metadata).toEqual(rich.metadata);
      });

      it("stores the section/slug pair uniquely", async () => {
        const page = await service.create(actor, draftInput("unique"));
        const rows = await db
          .select()
          .from(cmsSchema.cmsPages)
          .where(eq(cmsSchema.cmsPages.slug, page.slug));
        expect(rows).toHaveLength(1);
      });
    });
  });
}

// Typed so a status added to the enum makes this file stop compiling rather
// than silently going untested above.
const _exhaustive: Record<ContentStatus, true> = {
  draft: true,
  preview: true,
  published: true,
};
void _exhaustive;

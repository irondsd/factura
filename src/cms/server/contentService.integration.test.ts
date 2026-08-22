import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { documentsFromDatabase } from "@/content-system/adapters/database";
import { PostgresContentRepository } from "@/content-system/repository/postgres";
import { relatedDocuments } from "@/content-system/document";
import { buildContentTree, ownSegment } from "@/content-system/hierarchy";
import type {
  ContentDocument,
  ContentStatus,
  ValidationResult,
} from "@/content-system/types";
import type { CmsActor } from "../types";
import { CmsContentService } from "./contentService";
import {
  CmsConflictError,
  CmsNotDeletableError,
  CmsNotFoundError,
  CmsSlugTakenError,
  CmsValidationError,
} from "./errors";
import { CmsPageHistoryStore } from "./historyStore";
import { loadPageHistory } from "./pageHistory";
import { CmsRevisionStore } from "./revisionStore";
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
    const revisions = new CmsRevisionStore(db);
    // The test connection, not the app singleton: these rows are written by
    // every mutation below and go with the page when it is cleaned up.
    const history = new CmsPageHistoryStore(db);
    const repository = new PostgresContentRepository(db);

    const actor: CmsActor = {
      userId: "",
      email: "cms-test@example.com",
      name: "CMS Test",
      role: "admin",
    };

    /** A validator that accepts everything, so these tests measure lifecycle and
     * concurrency rather than Phase 4's rules. The two tests that care about
     * refusal install their own. */
    const permissive = (): ValidationResult => ({ ok: true, diagnostics: [] });

    /** These publish real rows, and the public cache is not what they measure
     * — the real invalidator would go looking for a Next.js request context.
     * `invalidation.test.ts` pins which writes reach it. */
    const noInvalidation = () => {};

    const service = new CmsContentService(
      permissive,
      store,
      revisions,
      history,
      undefined,
      noInvalidation,
    );

    const cmsSchema = db._.fullSchema;

    /** The version the page is at right now. Every mutation bumps it — a save
     * included — so a suite that held one from three calls ago would be
     * testing the conflict path by accident. */
    const lockOf = async (id: string): Promise<number> =>
      (await service.getState(actor, id)).lockVersion;

    /** Save the working copy and answer with the document, which is what most
     * of the assertions below are about. */
    const save = async (
      id: string,
      patch: Parameters<typeof service.update>[1]["patch"],
    ) =>
      (
        await service.update(actor, {
          id,
          expectedLockVersion: await lockOf(id),
          patch,
        })
      ).document;

    /** Publish whatever is saved. */
    const publish = async (id: string) =>
      (
        await service.publish(actor, {
          id,
          expectedLockVersion: await lockOf(id),
        })
      ).document;

    /** Remove this suite's rows, in the order the foreign keys allow.
     *
     * Three steps rather than one delete, and each is a constraint doing its
     * job: the page's four pointers are `restrict`, so they are cleared before
     * anything is removed; `cms_page_revision.parent_id` is `restrict` too, so
     * every revision goes before the pages they hang off; and only then can the
     * pages themselves be deleted. A single `delete from cms_page` fails on the
     * second of those, which is exactly the protection production relies on. */
    async function cleanup() {
      const mine = like(cmsSchema.cmsPages.slug, `${TEST_PREFIX}%`);
      await db
        .update(cmsSchema.cmsPages)
        .set({
          publishedRevisionId: null,
          previewRevisionId: null,
          wipRevisionId: null,
          checkpointRevisionId: null,
        })
        .where(mine);
      await db
        .delete(cmsSchema.cmsPageRevisions)
        .where(
          inArray(
            cmsSchema.cmsPageRevisions.pageId,
            db
              .select({ id: cmsSchema.cmsPages.id })
              .from(cmsSchema.cmsPages)
              .where(mine),
          ),
        );
      await db.delete(cmsSchema.cmsPages).where(mine);
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

        const first = await save(page.id, { title: "Uno" });
        expect(first.lockVersion).toBe(2);

        const second = await save(page.id, { title: "Dos" });
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
        const edited = await save(page.id, { body: "Cuerpo corregido." });
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
        const edited = await save(live.id, {
          body: "Cuerpo corregido tras publicar.",
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
        const strict = new CmsContentService(
          failsPublishOnly,
          store,
          revisions,
          history,
          undefined,
          noInvalidation,
        );

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
        const strict = new CmsContentService(
          failsPublishOnly,
          store,
          revisions,
          history,
          undefined,
          noInvalidation,
        );
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
        const strict = new CmsContentService(
          always,
          store,
          revisions,
          history,
          undefined,
          noInvalidation,
        );

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

    describe("preview is absent from every discovery surface", () => {
      // cms.md Phase 6: "Prove preview content is absent from all list/discovery
      // repository calls." Enumerated one call at a time rather than asserted in
      // aggregate — a discovery surface added later that forgets the rule is
      // exactly what this is for.
      it("is renderable at its URL but in no published listing", async () => {
        const draft = await service.create(actor, draftInput("discovery"));
        const page = await service.setStatus(actor, {
          id: draft.id,
          status: "preview",
          expectedLockVersion: draft.lockVersion,
        });

        // Renders: the URL is shareable on purpose.
        expect(
          await repository.getByPath("guias", page.slug.split("/")),
        ).not.toBeNull();

        // Every listing the public site builds from — the index, the category
        // hubs, related guides, the sitemap, the feed, llms.txt, the OG routes
        // and IndexNow all read `listPublished`.
        const published = await repository.listPublished("guias");
        expect(published.map((s) => s.slug)).not.toContain(page.slug);

        // And it is absent from the related-guides ranking, because that is fed
        // from the published set.
        expect(
          relatedDocuments(page, published).map((s) => s.slug),
        ).not.toContain(page.slug);
      });

      it("appears in listPubliclyRenderable, which is not a listing", async () => {
        // The one call that includes it: "does this path resolve", for
        // generateStaticParams. Never feed it to a listing.
        const draft = await service.create(actor, draftInput("renderable"));
        const page = await service.setStatus(actor, {
          id: draft.id,
          status: "preview",
          expectedLockVersion: draft.lockVersion,
        });
        expect(
          (await repository.listPubliclyRenderable("guias")).map((s) => s.slug),
        ).toContain(page.slug);
      });

      it("keeps a draft out of even that", async () => {
        const draft = await service.create(actor, draftInput("draft-hidden"));
        expect(
          (await repository.listPubliclyRenderable("guias")).map((s) => s.slug),
        ).not.toContain(draft.slug);
        expect(
          await repository.getByPath("guias", draft.slug.split("/")),
        ).toBeNull();
      });

      it("never lists a page it would not render", async () => {
        // A listed page is a link a crawler follows; a listable-but-unrenderable
        // status would be a guaranteed 404 in the sitemap.
        await service.create(actor, draftInput("consistency"));
        const listed = await repository.listPublished("guias");
        const renderable = await repository.listPubliclyRenderable("guias");
        const renderableSlugs = new Set(renderable.map((s) => s.slug));
        for (const page of listed) {
          expect(renderableSlugs.has(page.slug)).toBe(true);
        }
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

    describe("deletion", () => {
      it("removes a draft from the database for good", async () => {
        const page = await service.create(actor, draftInput("borrable"));

        await service.delete(actor, {
          id: page.id,
          expectedLockVersion: page.lockVersion,
        });

        // Gone from the table, not merely hidden from a listing: this is the
        // one operation in the CMS with no archived copy behind it.
        expect(
          await db.query.cmsPages.findFirst({
            where: eq(cmsSchema.cmsPages.id, page.id),
          }),
        ).toBeUndefined();
        await expect(service.get(actor, page.id)).rejects.toBeInstanceOf(
          CmsNotFoundError,
        );
      });

      it("refuses to delete a published page", async () => {
        const page = await service.create(actor, draftInput("publicada"));
        const live = await service.setStatus(actor, {
          id: page.id,
          status: "published",
          expectedLockVersion: page.lockVersion,
        });

        await expect(
          service.delete(actor, {
            id: live.id,
            expectedLockVersion: live.lockVersion,
          }),
        ).rejects.toBeInstanceOf(CmsNotDeletableError);
        expect(await service.get(actor, live.id)).toBeTruthy();
      });

      it("refuses to delete a page that others hang off", async () => {
        // The foreign key is `restrict`, so the database would refuse this
        // anyway — the service refuses first so the answer names the children
        // instead of a constraint.
        const hub = await service.create(actor, draftInput("hub-borrable"));
        await service.create(actor, {
          ...draftInput("hub-borrable/hija"),
          slug: `${hub.slug}/hija`,
          parentId: hub.id,
        });

        await expect(
          service.delete(actor, {
            id: hub.id,
            expectedLockVersion: hub.lockVersion,
          }),
        ).rejects.toBeInstanceOf(CmsNotDeletableError);
        expect(await service.get(actor, hub.id)).toBeTruthy();
      });

      it("refuses to delete a page that moved since it was read", async () => {
        const page = await service.create(actor, draftInput("movida"));
        await service.update(actor, {
          id: page.id,
          expectedLockVersion: page.lockVersion,
          patch: { title: "Otro título" },
        });

        await expect(
          service.delete(actor, {
            id: page.id,
            expectedLockVersion: page.lockVersion,
          }),
        ).rejects.toBeInstanceOf(CmsConflictError);
        expect(await service.get(actor, page.id)).toBeTruthy();
      });
    });

    describe("page history", () => {
      it("records the whole life of a page, newest first", async () => {
        const page = await service.create(actor, draftInput("history"));
        await save(page.id, { title: "Otro título" });
        await publish(page.id);

        const entries = await loadPageHistory(
          (await store.findById(page.id))!,
          history,
        );

        expect(
          entries.map((entry) => [entry.action, entry.did, entry.inferred]),
        ).toEqual([
          ["status", "publicó la página", false],
          ["saved", "guardó cambios", false],
          ["created", "creó la página", false],
        ]);
        // Every row is attributed, and the fallback never fires for a page
        // whose creation is on the record.
        expect(new Set(entries.map((entry) => entry.who)).size).toBe(1);
      });

      it("goes with the page when the page is deleted", async () => {
        // `page_id` cascades. A draft is removed for good, and history of a row
        // that no longer exists would be unreachable rows accumulating forever.
        const page = await service.create(actor, draftInput("history-gone"));
        expect(await history.listForPage(page.id)).toHaveLength(1);

        await service.delete(actor, {
          id: page.id,
          expectedLockVersion: page.lockVersion,
        });

        expect(await history.listForPage(page.id)).toEqual([]);
      });
    });

    describe("revisions in the database", () => {
      // The half of §14 that only a real PostgreSQL can prove: the partial
      // unique indexes, the `restrict` foreign keys, the check constraints, and
      // the fact that a public read resolves a pointer rather than a row.
      // `workingCopy.test.ts` covers the decisions; this covers the schema that
      // makes them enforceable.

      /** A public document with the page's optimistic-concurrency counter
       * dropped.
       *
       * `lockVersion` lives on `cms_page` and moves on every accepted write —
       * a working-copy save included, because it is the CMS's single
       * concurrency token. So it is the one field of a public read that
       * legitimately changes while the published *document* does not, and
       * comparing it would make "the live page did not change" impossible to
       * state. Everything a reader can see is still compared. */
      const published = (document: ContentDocument | null) =>
        document && { ...document, lockVersion: 0 };

      const revisionsOf = (pageId: string) =>
        db
          .select()
          .from(cmsSchema.cmsPageRevisions)
          .where(eq(cmsSchema.cmsPageRevisions.pageId, pageId));

      it("keeps the published revision byte-for-byte while the draft changes", async () => {
        const page = await service.create(actor, draftInput("rev-stable"));
        await publish(page.id);
        const before = published(
          await repository.getByPath("guias", [page.slug]),
        );

        await save(page.id, { body: "Un borrador a medio escribir.\n" });
        await save(page.id, { title: "Título provisional" });

        expect(
          published(await repository.getByPath("guias", [page.slug])),
        ).toEqual(before);
      });

      it("refuses a second working copy for the same page", async () => {
        // The partial unique index. This is the invariant two concurrent saves
        // race on, and only the database can settle that race.
        const page = await service.create(actor, draftInput("rev-one-wip"));
        const [wip] = await revisionsOf(page.id);

        await expect(
          db.insert(cmsSchema.cmsPageRevisions).values({
            pageId: page.id,
            kind: "wip",
            bodyMdx: wip.bodyMdx,
            title: wip.title,
            description: wip.description,
            summary: wip.summary,
            cta: wip.cta,
            metadata: wip.metadata,
          }),
        ).rejects.toThrow();
      });

      it("refuses a working copy carrying a publication number", async () => {
        // The check constraint. A `wip` with a number would be counted by the
        // retention sweep, and pruned or kept for the wrong reasons.
        const page = await service.create(actor, draftInput("rev-number"));
        const [wip] = await revisionsOf(page.id);

        await expect(
          db
            .update(cmsSchema.cmsPageRevisions)
            .set({ publicationNumber: 9 })
            .where(eq(cmsSchema.cmsPageRevisions.id, wip.id)),
        ).rejects.toThrow();
      });

      it("refuses to delete a revision the page still points at", async () => {
        // `restrict`, in the direction that matters: a live publication deleted
        // out from under its pointer would leave a published page with no body.
        const page = await service.create(actor, draftInput("rev-restrict"));
        await publish(page.id);
        const [publication] = await revisionsOf(page.id);

        await expect(
          db
            .delete(cmsSchema.cmsPageRevisions)
            .where(eq(cmsSchema.cmsPageRevisions.id, publication.id)),
        ).rejects.toThrow();
      });

      it("numbers publications monotonically and keeps only four", async () => {
        const page = await service.create(actor, draftInput("rev-retention"));
        await publish(page.id);
        for (let i = 2; i <= 6; i++) {
          await save(page.id, { body: `Versión ${i}.\n` });
          await publish(page.id);
        }

        const publications = (await revisionsOf(page.id))
          .filter((revision) => revision.kind === "published")
          .map((revision) => revision.publicationNumber)
          .sort((a, b) => (a ?? 0) - (b ?? 0));
        expect(publications).toEqual([3, 4, 5, 6]);

        // And the page is still serving the newest one.
        const live = await repository.getByPath("guias", [page.slug]);
        expect(live?.body).toBe("Versión 6.\n");
      });

      it("leaves one working copy and one checkpoint after a run of saves", async () => {
        const page = await service.create(actor, draftInput("rev-compress"));
        await publish(page.id);
        for (let i = 0; i < 6; i++) {
          await save(page.id, { body: `Guardado ${i}.\n` });
        }

        const kinds = (await revisionsOf(page.id))
          .map((revision) => revision.kind)
          .sort();
        expect(kinds).toEqual(["checkpoint", "published", "wip"]);
      });

      it("clears the working copy and the checkpoint when publishing", async () => {
        const page = await service.create(actor, draftInput("rev-publish"));
        await publish(page.id);
        await save(page.id, { body: "Uno.\n" });
        await save(page.id, { body: "Dos.\n" });
        await publish(page.id);

        const row = await db.query.cmsPages.findFirst({
          where: eq(cmsSchema.cmsPages.id, page.id),
        });
        expect(row?.wipRevisionId).toBeNull();
        expect(row?.checkpointRevisionId).toBeNull();
        expect(row?.publishedRevisionId).not.toBeNull();
      });

      it("serves the promoted snapshot, not the latest save, while in preview", async () => {
        const page = await service.create(actor, draftInput("rev-preview"));
        await service.promotePreview(actor, {
          id: page.id,
          expectedLockVersion: await lockOf(page.id),
        });
        const promoted = published(
          await repository.getByPath("guias", [page.slug]),
        );

        await save(page.id, { body: "Algo que nadie debería ver todavía.\n" });

        expect(
          published(await repository.getByPath("guias", [page.slug])),
        ).toEqual(promoted);
        expect((await service.getState(actor, page.id)).previewIsStale).toBe(
          true,
        );
      });

      it("restores an old publication into the working copy without moving the live page", async () => {
        const page = await service.create(actor, draftInput("rev-restore"));
        await publish(page.id);
        const original = (await revisionsOf(page.id))[0];

        await save(page.id, { body: "Reescrito.\n" });
        await publish(page.id);
        const liveBefore = published(
          await repository.getByPath("guias", [page.slug]),
        );

        await service.restoreVersion(actor, {
          id: page.id,
          revisionId: original.id,
          expectedLockVersion: await lockOf(page.id),
        });

        expect(
          published(await repository.getByPath("guias", [page.slug])),
        ).toEqual(liveBefore);
        expect((await service.get(actor, page.id)).body).toBe(original.bodyMdx);
      });

      it("takes every revision with the page when it is deleted", async () => {
        const page = await service.create(actor, draftInput("rev-delete"));
        await publish(page.id);
        await save(page.id, { body: "Uno.\n" });
        await service.unpublish(actor, {
          id: page.id,
          expectedLockVersion: await lockOf(page.id),
        });
        expect((await revisionsOf(page.id)).length).toBeGreaterThan(1);

        await service.delete(actor, {
          id: page.id,
          expectedLockVersion: await lockOf(page.id),
        });
        expect(await revisionsOf(page.id)).toEqual([]);
      });

      it("validates a publication candidate against the other pages' public versions", async () => {
        // Collection validation has to see the candidate as the page's
        // prospective public document while everything else contributes what it
        // is actually serving — and the page's own live version must not
        // collide with its own candidate.
        const page = await service.create(actor, draftInput("rev-collection"));
        await publish(page.id);
        await save(page.id, { title: "Un título distinto" });

        const result = await service.validateOnly(actor, {
          id: page.id,
          level: "publish",
        });
        expect(result.ok).toBe(true);
      });
    });

    describe("metadata is checked before it is written", () => {
      // The failure this closes: draft-level validation is grammar-only, so a
      // metadata blob the mapper cannot read back used to be written and only
      // then rejected — leaving a row that broke the section list, the editor
      // and the public repository for everyone, with no screen left to fix it
      // from.
      const bad = {
        keywords: [],
        categories: [],
        previewMediaId: "portada.jpg",
      };

      it("refuses a create whose metadata does not match the schema", async () => {
        await expect(
          service.create(actor, {
            ...draftInput("bad-create"),
            metadata: bad,
          }),
        ).rejects.toBeInstanceOf(CmsValidationError);
      });

      it("writes no row when it refuses a create", async () => {
        await service
          .create(actor, { ...draftInput("bad-create-row"), metadata: bad })
          .catch(() => {});
        const rows = await db
          .select()
          .from(cmsSchema.cmsPages)
          .where(eq(cmsSchema.cmsPages.slug, `${TEST_PREFIX}bad-create-row`));
        expect(rows).toEqual([]);
      });

      it("refuses a draft save whose metadata does not match the schema", async () => {
        const page = await service.create(actor, draftInput("bad-save"));
        await expect(
          service.update(actor, {
            id: page.id,
            expectedLockVersion: page.lockVersion,
            patch: { metadata: bad },
          }),
        ).rejects.toBeInstanceOf(CmsValidationError);
      });

      it("leaves the stored metadata untouched when it refuses", async () => {
        const page = await service.create(actor, draftInput("bad-save-keeps"));
        await service
          .update(actor, {
            id: page.id,
            expectedLockVersion: page.lockVersion,
            patch: { metadata: bad },
          })
          .catch(() => {});
        const read = await service.get(actor, page.id);
        expect(read.metadata).toEqual(metadata);
        expect(read.lockVersion).toBe(page.lockVersion);
      });

      it("names the offending field, so the editor can point at it", async () => {
        const page = await service.create(actor, draftInput("bad-field"));
        const error = await service
          .update(actor, {
            id: page.id,
            expectedLockVersion: page.lockVersion,
            patch: { metadata: bad },
          })
          .catch((cause: unknown) => cause);
        expect(error).toBeInstanceOf(CmsValidationError);
        expect(
          (error as CmsValidationError).diagnostics.map((d) => d.field),
        ).toContain("previewMediaId");
      });

      it("keeps the CMS list readable when a row is damaged anyway", async () => {
        // A hand-edited row or a schema change without a backfill still gets
        // past the gate above. The console has to survive it, because the
        // console is where it gets repaired.
        const page = await service.create(actor, draftInput("damaged"));
        await db
          .update(cmsSchema.cmsPageRevisions)
          .set({ metadata: { keywords: "not an array" } })
          .where(eq(cmsSchema.cmsPageRevisions.pageId, page.id));

        const listed = await service.list(actor, { section: "guias" });
        const damaged = listed.find((row) => row.id === page.id);
        expect(damaged?.metadataError).toBeTruthy();
        expect(damaged?.title).toBe(page.title);

        // And it still opens, which is the whole point.
        const opened = await service.get(actor, page.id);
        expect(opened.metadataError).toBeTruthy();
        expect(opened.metadata).toEqual({});
      });

      it("refuses to serve a damaged row publicly", async () => {
        // The other half of the same decision: lenient for the editor, strict
        // for a reader, who would otherwise get a page with its metadata
        // silently missing.
        const page = await service.create(actor, draftInput("damaged-public"));
        await publish(page.id);
        await db
          .update(cmsSchema.cmsPageRevisions)
          .set({ metadata: { keywords: "not an array" } })
          .where(eq(cmsSchema.cmsPageRevisions.pageId, page.id));

        await expect(
          repository.getByPath("guias", [page.slug]),
        ).rejects.toThrow(/invalid metadata/);
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

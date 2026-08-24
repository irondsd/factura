import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { like } from "drizzle-orm";
import { cmsCategories } from "@/db/schema";
import type { CmsActor } from "@/cms/types";
import { createTestDb, hasTestDatabase } from "@/cms/server/testDb";
import { CmsCategoryService } from "./service";
import { CmsCategoryStore } from "./store";

const PREFIX = "category-integration-";

if (!hasTestDatabase()) {
  describe.skip("CMS category SQL integration", () => {
    it("needs a local database — run `bun run test:db`", () => {});
  });
} else {
  describe("CMS category SQL integration", () => {
    const { db, client } = createTestDb();
    const store = new CmsCategoryStore(db);
    const service = new CmsCategoryService(
      store,
      () => new Date(),
      () => {},
    );
    let actor: CmsActor;

    const cleanup = () =>
      db.delete(cmsCategories).where(like(cmsCategories.key, `${PREFIX}%`));

    beforeEach(async () => {
      await cleanup();
      const member = await db.query.cmsMembers.findFirst();
      if (!member) throw new Error("local database has no cms_member row");
      actor = {
        userId: member.userId,
        email: null,
        name: null,
        role: member.role,
        source: "browser",
      };
    });

    afterAll(async () => {
      await cleanup();
      await client.end();
    });

    const create = (section: "guias" | "estadisticas") =>
      service.create(actor, {
        section,
        slug: `${PREFIX}mercado`,
        label: "Categoría de integración",
        title: "Categoría de integración del CMS",
        description:
          "Una categoría temporal que verifica el almacenamiento del CMS.",
      });

    it("stores the same key as separate rows in separate sections", async () => {
      const guide = await create("guias");
      const statistic = await create("estadisticas");

      expect(guide.key).toBe(`${PREFIX}mercado`);
      expect(statistic.key).toBe(`${PREFIX}mercado`);
      expect(guide.id).not.toBe(statistic.id);
    });

    it("renames without changing the metadata key and resolves the old slug", async () => {
      const category = await create("guias");
      const renamed = await service.rename(actor, {
        id: category.id,
        expectedLockVersion: category.lockVersion,
        slug: `${PREFIX}precios`,
      });

      expect(renamed.key).toBe(`${PREFIX}mercado`);
      expect(renamed.slug).toBe(`${PREFIX}precios`);
      expect(renamed.redirects).toEqual([`${PREFIX}mercado`]);
      await expect(
        store.redirectFor("guias", `${PREFIX}mercado`),
      ).resolves.toMatchObject({ id: category.id, slug: `${PREFIX}precios` });
    });

    it("retires an unused category instead of erasing its historical key", async () => {
      const category = await create("guias");
      await service.retire(actor, {
        id: category.id,
        expectedLockVersion: category.lockVersion,
      });

      await expect(store.list("guias")).resolves.not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: category.id })]),
      );
      await expect(store.findById(category.id)).resolves.toMatchObject({
        key: `${PREFIX}mercado`,
        retiredAt: expect.any(String),
      });
    });
  });
}

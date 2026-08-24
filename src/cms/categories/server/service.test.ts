import { describe, expect, it } from "vitest";
import type { ContentCategory } from "@/content-system/categories/types";
import type { ContentSection } from "@/content-system/types";
import type { CmsActor } from "@/cms/types";
import { CmsCategoryInUseError, CmsForbiddenError } from "@/cms/server/errors";
import { CmsCategoryService } from "./service";
import type { CategoryUsage, CmsCategoryStore } from "./store";

const human: CmsActor = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "editor@example.com",
  name: "Editor",
  role: "editor",
  source: "browser",
};

const agent: CmsActor = { ...human, source: "mcp" };

function fakeCategories() {
  const categories = new Map<string, ContentCategory>();
  const redirects = new Map<string, string>();
  const usage = new Map<string, CategoryUsage[]>();
  const expired: ContentSection[] = [];
  let next = 0;
  const now = new Date("2026-08-23T12:00:00.000Z");

  const store = {
    transaction: async <T>(body: (bound: CmsCategoryStore) => Promise<T>) =>
      body(store as unknown as CmsCategoryStore),
    list: async (section: ContentSection) =>
      [...categories.values()].filter(
        (category) => category.section === section && !category.retiredAt,
      ),
    findById: async (id: string) => categories.get(id) ?? null,
    findByKey: async (section: ContentSection, key: string) =>
      [...categories.values()].find(
        (category) => category.section === section && category.key === key,
      ) ?? null,
    findBySlug: async (section: ContentSection, slug: string) =>
      [...categories.values()].find(
        (category) => category.section === section && category.slug === slug,
      ) ?? null,
    insert: async (input: {
      section: ContentSection;
      key: string;
      slug: string;
      label: string;
      title: string;
      description: string;
      sortOrder: number;
      actorId: string;
    }) => {
      const id = `00000000-0000-0000-0000-${String(++next).padStart(12, "0")}`;
      const category: ContentCategory = {
        id,
        section: input.section,
        key: input.key,
        slug: input.slug,
        label: input.label,
        title: input.title,
        description: input.description,
        sortOrder: input.sortOrder,
        lockVersion: 1,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        retiredAt: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      categories.set(id, category);
      return category;
    },
    updateWithLock: async (input: {
      id: string;
      expectedLockVersion: number;
      patch: Partial<Omit<ContentCategory, "retiredAt">> & {
        retiredAt?: string | null | Date;
        retiredBy?: string | null;
      };
      actorId: string;
    }) => {
      const category = categories.get(input.id);
      if (!category || category.lockVersion !== input.expectedLockVersion)
        return null;
      const updated: ContentCategory = {
        ...category,
        ...input.patch,
        retiredAt:
          input.patch.retiredAt instanceof Date
            ? input.patch.retiredAt.toISOString()
            : (input.patch.retiredAt ?? category.retiredAt),
        lockVersion: category.lockVersion + 1,
        updatedBy: input.actorId,
        updatedAt: now.toISOString(),
      };
      categories.set(updated.id, updated);
      return updated;
    },
    dropRedirect: async (section: ContentSection, slug: string) => {
      redirects.delete(`${section}:${slug}`);
    },
    addRedirect: async (input: {
      section: ContentSection;
      fromSlug: string;
      categoryId: string;
    }) => {
      redirects.set(`${input.section}:${input.fromSlug}`, input.categoryId);
    },
    redirectsForCategory: async (id: string) =>
      [...redirects.entries()]
        .filter(([, categoryId]) => categoryId === id)
        .map(([address]) => address.split(":").slice(1).join(":")),
    usage: async (section: ContentSection, key: string) =>
      usage.get(`${section}:${key}`) ?? [],
    lockVersionOf: async (id: string) =>
      categories.get(id)?.lockVersion ?? null,
  };

  return {
    service: new CmsCategoryService(
      store as unknown as CmsCategoryStore,
      () => now,
      (section) => expired.push(section),
    ),
    categories,
    redirects,
    usage,
    expired,
  };
}

const input = (section: ContentSection) => ({
  section,
  label: "Mercado y precios",
  title: "Mercado y precios de la vivienda",
  description: "Precios y cambios del mercado de vivienda en Argentina.",
});

describe("CMS category service", () => {
  it("creates identical keys as independent records in different sections", async () => {
    const fake = fakeCategories();
    const statistics = await fake.service.create(human, input("estadisticas"));
    const research = await fake.service.create(human, input("investigaciones"));

    expect(statistics.key).toBe("mercado-y-precios");
    expect(research.key).toBe("mercado-y-precios");
    expect(statistics.id).not.toBe(research.id);
  });

  it("lets an agent create and edit category copy", async () => {
    const fake = fakeCategories();
    const created = await fake.service.create(agent, input("noticias"));
    const updated = await fake.service.update(agent, {
      id: created.id,
      expectedLockVersion: created.lockVersion,
      patch: { label: "Precios" },
    });

    expect(created.slug).toBe("mercado-y-precios");
    expect(updated.label).toBe("Precios");
    expect(fake.expired).toEqual(["noticias", "noticias"]);
  });

  it("refuses an agent-supplied slug even during creation", async () => {
    const fake = fakeCategories();
    await expect(
      fake.service.create(agent, {
        ...input("guias"),
        slug: "elegido-a-mano",
      }),
    ).rejects.toBeInstanceOf(CmsForbiddenError);
  });

  it("reserves slug changes and deletion for humans", async () => {
    const fake = fakeCategories();
    const created = await fake.service.create(human, input("guias"));

    await expect(
      fake.service.rename(agent, {
        id: created.id,
        expectedLockVersion: created.lockVersion,
        slug: "precios",
      }),
    ).rejects.toBeInstanceOf(CmsForbiddenError);
    await expect(
      fake.service.retire(agent, {
        id: created.id,
        expectedLockVersion: created.lockVersion,
      }),
    ).rejects.toBeInstanceOf(CmsForbiddenError);
  });

  it("leaves a one-hop redirect when a human changes the slug", async () => {
    const fake = fakeCategories();
    const created = await fake.service.create(human, input("guias"));
    const renamed = await fake.service.rename(human, {
      id: created.id,
      expectedLockVersion: created.lockVersion,
      slug: "precios",
    });

    expect(renamed.slug).toBe("precios");
    expect(renamed.key).toBe("mercado-y-precios");
    expect(renamed.redirects).toEqual(["mercado-y-precios"]);
  });

  it("refuses to retire a category while a current page uses it", async () => {
    const fake = fakeCategories();
    const created = await fake.service.create(human, input("estadisticas"));
    fake.usage.set("estadisticas:mercado-y-precios", [
      {
        id: "22222222-2222-2222-2222-222222222222",
        section: "estadisticas",
        slug: "precio-m2-caba",
        title: "Precio del metro cuadrado en CABA",
      },
    ]);

    await expect(
      fake.service.retire(human, {
        id: created.id,
        expectedLockVersion: created.lockVersion,
      }),
    ).rejects.toBeInstanceOf(CmsCategoryInUseError);
    expect(fake.categories.get(created.id)?.retiredAt).toBeNull();
  });
});

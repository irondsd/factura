import { describe, expect, it } from "vitest";
import type { ContentAuthor } from "@/content-system/authors/types";
import type { ContentSection } from "@/content-system/types";
import type { CmsActor } from "@/cms/types";
import {
  CmsAuthorNameTakenError,
  CmsAuthorSlugTakenError,
  CmsForbiddenError,
  CmsValidationError,
} from "@/cms/server/errors";
import { CmsAuthorService } from "./service";
import type { AuthorUsage, CmsAuthorStore } from "./store";

const human: CmsActor = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "editor@example.com",
  name: "Editor",
  role: "editor",
  source: "browser",
};

const agent: CmsActor = { ...human, source: "mcp" };

function fakeAuthors() {
  const authors = new Map<string, ContentAuthor>();
  const usage = new Map<string, AuthorUsage[]>();
  const expired: ContentSection[] = [];
  let next = 0;
  const now = new Date("2026-08-25T12:00:00.000Z");

  const store = {
    list: async () =>
      [...authors.values()].sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
      ),
    findById: async (id: string) => authors.get(id) ?? null,
    findByName: async (name: string, options: { exceptId?: string } = {}) =>
      [...authors.values()].find(
        (author) =>
          author.name.toLowerCase() === name.toLowerCase() &&
          author.id !== options.exceptId,
      ) ?? null,
    findBySlug: async (slug: string, options: { exceptId?: string } = {}) =>
      [...authors.values()].find(
        (author) => author.slug === slug && author.id !== options.exceptId,
      ) ?? null,
    insert: async (input: {
      values: Omit<
        ContentAuthor,
        "id" | "createdBy" | "updatedBy" | "createdAt" | "updatedAt"
      >;
      actorId: string;
    }) => {
      const id = `00000000-0000-0000-0000-${String(++next).padStart(12, "0")}`;
      const author: ContentAuthor = {
        id,
        ...input.values,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      authors.set(id, author);
      return author;
    },
    update: async (input: {
      id: string;
      patch: Partial<ContentAuthor>;
      actorId: string;
    }) => {
      const current = authors.get(input.id);
      if (!current) return null;
      const saved = {
        ...current,
        ...input.patch,
        updatedBy: input.actorId,
        updatedAt: now.toISOString(),
      };
      authors.set(input.id, saved);
      return saved;
    },
    usage: async (id: string) => usage.get(id) ?? [],
    byPortrait: async () => [],
  };

  const service = new CmsAuthorService(
    store as unknown as CmsAuthorStore,
    () => now,
    (section) => expired.push(section),
  );
  return { service, store, authors, usage, expired };
}

describe("CmsAuthorService", () => {
  it("creates an author, deriving the address from the name", async () => {
    const { service } = fakeAuthors();
    const author = await service.create(human, {
      name: "Konstantin Mednikov",
      tagline: "10 años construyendo sitios web",
      jobTitle: "Fundador de Factura",
    });

    expect(author.name).toBe("Konstantin Mednikov");
    expect(author.slug).toBe("konstantin-mednikov");
    expect(author.tagline).toBe("10 años construyendo sitios web");
    // Not asked for, so not invented.
    expect(author.about).toBeNull();
    expect(author.imageMediaId).toBeNull();
  });

  it("keeps the address empty when one is explicitly not given", async () => {
    const { service } = fakeAuthors();
    // `null` is a decision — "no address" — and differs from omitting the
    // field, which asks the service to derive one from the name.
    const author = await service.create(human, {
      name: "Ana Pérez",
      slug: null,
    });
    expect(author.slug).toBeNull();
  });

  it("refuses a second author with the same name, whatever the casing", async () => {
    const { service } = fakeAuthors();
    await service.create(human, { name: "Ana Pérez" });
    await expect(
      service.create(human, { name: "ana pérez" }),
    ).rejects.toBeInstanceOf(CmsAuthorNameTakenError);
  });

  it("refuses a second author at the same address", async () => {
    const { service } = fakeAuthors();
    await service.create(human, { name: "Ana Pérez", slug: "ana" });
    await expect(
      service.create(human, { name: "Ana Beltrán", slug: "ana" }),
    ).rejects.toBeInstanceOf(CmsAuthorSlugTakenError);
  });

  it("refuses an address that is not a URL segment", async () => {
    const { service } = fakeAuthors();
    await expect(
      service.create(human, { name: "Ana Pérez", slug: "Ana Pérez!" }),
    ).rejects.toBeInstanceOf(CmsValidationError);
  });

  it("refuses a blank name", async () => {
    const { service } = fakeAuthors();
    await expect(service.create(human, { name: "   " })).rejects.toBeInstanceOf(
      CmsValidationError,
    );
  });

  it("lets an author keep their own name and address while editing", async () => {
    const { service } = fakeAuthors();
    const author = await service.create(human, {
      name: "Ana Pérez",
      slug: "ana-perez",
    });
    const saved = await service.update(human, {
      id: author.id,
      patch: {
        name: "Ana Pérez",
        slug: "ana-perez",
        jobTitle: "Analista de datos",
      },
    });
    expect(saved.jobTitle).toBe("Analista de datos");
  });

  it("clears an optional field when it is emptied", async () => {
    const { service } = fakeAuthors();
    const author = await service.create(human, {
      name: "Ana Pérez",
      jobTitle: "Analista de datos",
    });
    const saved = await service.update(human, {
      id: author.id,
      patch: { jobTitle: "  " },
    });
    expect(saved.jobTitle).toBeNull();
  });

  it("expires every section's public cache, because a byline is on all of them", async () => {
    const { service, expired } = fakeAuthors();
    const author = await service.create(human, { name: "Ana Pérez" });
    expired.length = 0;

    await service.update(human, {
      id: author.id,
      patch: { name: "Ana Pérez Beltrán" },
    });
    expect([...expired].sort()).toEqual([
      "estadisticas",
      "guias",
      "investigaciones",
      "noticias",
    ]);
  });

  it("keeps agents out of the list itself", async () => {
    const { service } = fakeAuthors();
    // Crediting someone is a page edit and goes through the content service.
    // Deciding a person exists does not.
    await expect(
      service.create(agent, { name: "Ana Pérez" }),
    ).rejects.toBeInstanceOf(CmsForbiddenError);
  });

  it("counts the pages that credit someone", async () => {
    const { service, usage, authors } = fakeAuthors();
    const author = await service.create(human, { name: "Ana Pérez" });
    usage.set(author.id, [
      {
        id: "page-1",
        section: "guias",
        slug: "como-leer-la-factura",
        title: "Cómo leer la factura",
        roles: ["author", "factChecker"],
      },
    ]);

    const [listed] = await service.list();
    expect(listed.usageCount).toBe(1);
    expect(authors.size).toBe(1);
  });
});

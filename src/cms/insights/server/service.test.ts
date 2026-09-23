import { describe, expect, it, vi } from "vitest";
import type { ContentInsight } from "@/content-system/insights/types";
import type { CmsActor } from "@/cms/types";
import {
  CmsForbiddenError,
  CmsNotFoundError,
  CmsValidationError,
} from "@/cms/server/errors";

// The service's default collaborators reach the database; every one of them is
// injected below, so these modules only need to import cleanly.
vi.mock("@/cms/server/service", () => ({ cmsContentService: {} }));
vi.mock("@/cms/server/store", () => ({ cmsPageStore: {} }));
vi.mock("@/cms/categories/server/store", () => ({ cmsCategoryStore: {} }));
vi.mock("@/cms/server/invalidation", () => ({
  revalidatePublicInsights: () => {},
}));
vi.mock("./store", () => ({ cmsInsightStore: {} }));

import { CmsInsightService } from "./service";
import type { CmsInsightStore } from "./store";

const editor: CmsActor = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "editor@example.com",
  name: "Editor",
  role: "editor",
};

const PAGE = "22222222-2222-2222-2222-222222222222";

function fake() {
  const rows = new Map<string, ContentInsight>();
  let next = 0;
  let expired = 0;
  const now = new Date("2026-09-23T12:00:00.000Z");
  const store = {
    list: async () => [...rows.values()],
    findById: async (id: string) => rows.get(id) ?? null,
    insert: async ({
      values,
      actorId,
    }: {
      values: object;
      actorId: string;
    }) => {
      const row = {
        id: `i${++next}`,
        ...values,
        createdBy: actorId,
        updatedBy: actorId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      } as ContentInsight;
      rows.set(row.id, row);
      return row;
    },
    update: async ({ id, values }: { id: string; values: object }) => {
      const current = rows.get(id);
      if (!current) return null;
      const saved = { ...current, ...values };
      rows.set(id, saved);
      return saved;
    },
    delete: async (id: string) => rows.delete(id),
  };
  const service = new CmsInsightService(
    store as unknown as CmsInsightStore,
    async (id) => id === PAGE,
    () => now,
    () => {
      expired++;
    },
  );
  return { service, rows, expired: () => expired };
}

const input = {
  pageId: PAGE,
  title: "  Nueva York cayó 15,3 % en agosto ",
  body: "Apenas la segunda caída de su historia.",
  date: "2026-08-31",
  onHomepage: true,
};

describe("CmsInsightService", () => {
  it("creates a trimmed insight and expires the rails", async () => {
    const { service, expired } = fake();
    const created = await service.create(editor, input);
    expect(created.title).toBe("Nueva York cayó 15,3 % en agosto");
    expect(created.onHomepage).toBe(true);
    expect(expired()).toBe(1);
  });

  it("refuses a page that does not exist", async () => {
    const { service } = fake();
    await expect(
      service.create(editor, { ...input, pageId: "nope" }),
    ).rejects.toBeInstanceOf(CmsValidationError);
  });

  it("refuses a day that does not exist", async () => {
    const { service } = fake();
    await expect(
      service.create(editor, { ...input, date: "2026-02-30" }),
    ).rejects.toBeInstanceOf(CmsValidationError);
  });

  it("refuses a blank or overlong title", async () => {
    const { service } = fake();
    await expect(
      service.create(editor, { ...input, title: "  " }),
    ).rejects.toBeInstanceOf(CmsValidationError);
    await expect(
      service.create(editor, { ...input, title: "x".repeat(200) }),
    ).rejects.toBeInstanceOf(CmsValidationError);
  });

  it("edits and deletes, reporting a missing row as not found", async () => {
    const { service, rows } = fake();
    const created = await service.create(editor, input);
    const saved = await service.update(editor, created.id, {
      ...input,
      onHomepage: false,
    });
    expect(saved.onHomepage).toBe(false);

    await service.delete(editor, created.id);
    expect(rows.size).toBe(0);
    await expect(service.delete(editor, created.id)).rejects.toBeInstanceOf(
      CmsNotFoundError,
    );
  });

  it("refuses a role that may not author", async () => {
    const { service } = fake();
    await expect(
      service.create({ ...editor, role: "viewer" as never }, input),
    ).rejects.toBeInstanceOf(CmsForbiddenError);
  });
});

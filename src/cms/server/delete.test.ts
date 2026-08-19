import { describe, expect, it } from "vitest";
import type {
  ContentDocument,
  ContentStatus,
  ContentSummary,
} from "@/content-system/types";
import type { CmsActor } from "../types";
import { CmsContentService } from "./contentService";
import {
  CmsConflictError,
  CmsNotDeletableError,
  CmsNotFoundError,
} from "./errors";
import type { CmsPageStore } from "./store";

// The guards on the one destructive operation in the CMS.
//
// `contentService.delete` is the only place a `cms_page` row can be removed, so
// every reason it may refuse is worth pinning: a published page is never one
// click from gone, a page that others hang off is never orphaned, and a page
// that moved under the editor is never deleted unseen. Without a database
// here — the question is which check fires, not what SQL does, and
// `contentService.integration.test.ts` covers the same ground against the real
// foreign key.

const PAGE_ID = "22222222-2222-2222-2222-222222222222";

const actor: CmsActor = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "editor@example.com",
  role: "editor",
};

function documentAt(status: ContentStatus): ContentDocument {
  return {
    id: PAGE_ID,
    section: "guias",
    slug: "una-guia",
    status,
    body: "Cuerpo.\n",
    title: "Una guía",
    titleTag: null,
    description: "Descripción.",
    summary: "Resumen.",
    cta: "Probá Factura.",
    canonicalSlug: null,
    parentId: null,
    sortOrder: 0,
    crumb: null,
    metadata: { keywords: [], categories: [] },
    publishedAt: status === "published" ? "2026-01-01T12:00:00.000Z" : null,
    contentUpdatedAt: "2026-01-01T12:00:00.000Z",
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
    createdBy: actor.userId,
    updatedBy: actor.userId,
    lockVersion: 1,
  };
}

/** A child of the page under test, as the section list would return it. */
function childSummary(slug: string): ContentSummary {
  const { body, ...summary } = documentAt("draft");
  void body;
  return {
    ...summary,
    id: `child-${slug}`,
    slug: `una-guia/${slug}`,
    parentId: PAGE_ID,
  };
}

/** A store that answers reads and records whether the delete was reached. */
function fakeStore(
  current: ContentDocument | null,
  options: { children?: ContentSummary[]; deletes?: boolean } = {},
) {
  const deleted: string[] = [];
  return {
    deleted,
    store: {
      findById: async () => current,
      list: async () => options.children ?? [],
      lockVersionOf: async () => current?.lockVersion ?? null,
      deleteWithLock: async (input: { id: string }) => {
        deleted.push(input.id);
        return options.deletes ?? true;
      },
    } as unknown as CmsPageStore,
  };
}

const permissive = () => ({ ok: true as const, diagnostics: [] });

const at = (version = 1) => ({ id: PAGE_ID, expectedLockVersion: version });

describe("deleting a page", () => {
  it("deletes a childless draft at the expected version", async () => {
    const { store, deleted } = fakeStore(documentAt("draft"));
    const service = new CmsContentService(permissive, store);

    await service.delete(actor, at());
    expect(deleted).toEqual([PAGE_ID]);
  });

  it("refuses a published page", async () => {
    // Unpublishing first is one extra click, and it keeps "this is live" and
    // "this is gone" two separate decisions — the public URL and its cached
    // copy outlive the row.
    const { store, deleted } = fakeStore(documentAt("published"));
    const service = new CmsContentService(permissive, store);

    await expect(service.delete(actor, at())).rejects.toBeInstanceOf(
      CmsNotDeletableError,
    );
    expect(deleted).toEqual([]);
  });

  it("refuses a page in preview", async () => {
    const { store, deleted } = fakeStore(documentAt("preview"));
    const service = new CmsContentService(permissive, store);

    await expect(service.delete(actor, at())).rejects.toBeInstanceOf(
      CmsNotDeletableError,
    );
    expect(deleted).toEqual([]);
  });

  it("refuses a page other pages hang off, and says how many", async () => {
    const { store, deleted } = fakeStore(documentAt("draft"), {
      children: [childSummary("uno"), childSummary("dos")],
    });
    const service = new CmsContentService(permissive, store);

    await expect(service.delete(actor, at())).rejects.toThrow(/2 páginas/);
    expect(deleted).toEqual([]);
  });

  it("refuses a version the editor no longer holds", async () => {
    const { store, deleted } = fakeStore(documentAt("draft"));
    const service = new CmsContentService(permissive, store);

    await expect(service.delete(actor, at(0))).rejects.toBeInstanceOf(
      CmsConflictError,
    );
    expect(deleted).toEqual([]);
  });

  it("reports a conflict when the row moved between the read and the delete", async () => {
    // The version is checked twice: once from the row in hand, and once in the
    // DELETE's own WHERE clause. Only the second one closes the race.
    const { store } = fakeStore(documentAt("draft"), { deletes: false });
    const service = new CmsContentService(permissive, store);

    await expect(service.delete(actor, at())).rejects.toBeInstanceOf(
      CmsConflictError,
    );
  });

  it("reports a page that is already gone as not found", async () => {
    const { store, deleted } = fakeStore(null);
    const service = new CmsContentService(permissive, store);

    await expect(service.delete(actor, at())).rejects.toBeInstanceOf(
      CmsNotFoundError,
    );
    expect(deleted).toEqual([]);
  });
});

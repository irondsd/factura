import { describe, expect, it, vi } from "vitest";
import type { ContentDocument } from "@/content-system/types";
import type { CmsActor } from "../types";
import { CmsContentService } from "./contentService";
import type { CmsPageEventInsert, CmsPageHistoryStore } from "./historyStore";
import type { CmsPageStore } from "./store";

// That every accepted mutation leaves a line in «Historia», and that a failure
// to write that line never turns a save the editor already made into an error.
//
// The recording lives in the service rather than in the browser actions on
// purpose (cms.md §2.2): the CMS MCP calls the same methods, so an agent's edit
// has to show up in the same trail without a second implementation. That is
// only true if it is written here, which is what these tests hold in place.

const PAGE_ID = "22222222-2222-2222-2222-222222222222";

const actor: CmsActor = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "editor@example.com",
  name: "Editor",
  role: "editor",
};

const agent: CmsActor = { ...actor, source: "mcp" };

function documentAt(status: ContentDocument["status"]): ContentDocument {
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

function fakeStore(current: ContentDocument) {
  const store = {
    findById: async () => current,
    findBySlug: async () => null,
    list: async () => [],
    lockVersionOf: async () => current.lockVersion,
    insert: async () => current,
    updateWithLock: async () => current,
    deleteWithLock: async () => true,
    // These suites are about *decisions* — who may write, what gets recorded,
    // what expires — not about atomicity, so the fake runs the body inline
    // against itself. The real transaction is proven in
    // `src/cms/media/server/media.integration.test.ts`.
    transaction: async (body: (s: unknown, tx: unknown) => Promise<unknown>) =>
      body(store, null),
  };
  return store as unknown as CmsPageStore;
}

/** A history store that keeps what it was asked to write, or refuses to. */
function fakeHistory(options: { fails?: boolean } = {}) {
  const recorded: CmsPageEventInsert[] = [];
  return {
    recorded,
    history: {
      record: async (input: CmsPageEventInsert) => {
        if (options.fails) throw new Error("no database");
        recorded.push(input);
      },
    } as unknown as CmsPageHistoryStore,
  };
}

const permissive = () => ({ ok: true as const, diagnostics: [] });

/** The real invalidator needs a Next.js request context these tests have not
 * got. `invalidation.test.ts` is where its decisions are pinned. */
const noInvalidation = () => {};

const createInput = {
  section: "guias" as const,
  slug: "una-guia",
  title: "Una guía",
  description: "Descripción.",
  summary: "Resumen.",
  cta: "Probá Factura.",
  body: "Cuerpo.\n",
  metadata: { keywords: [], categories: [] },
};

describe("recording page history", () => {
  it("records a creation", async () => {
    const { history, recorded } = fakeHistory();
    const service = new CmsContentService(
      permissive,
      fakeStore(documentAt("draft")),
      history,
    );

    await service.create(actor, createInput);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      pageId: PAGE_ID,
      actorId: actor.userId,
      action: "created",
      source: "browser",
    });
  });

  it("records a save", async () => {
    const { history, recorded } = fakeHistory();
    const service = new CmsContentService(
      permissive,
      fakeStore(documentAt("draft")),
      history,
    );

    await service.update(actor, {
      id: PAGE_ID,
      expectedLockVersion: 1,
      patch: { title: "Otro título" },
    });

    expect(recorded).toMatchObject([{ action: "saved", pageId: PAGE_ID }]);
  });

  it("records both sides of a status change", async () => {
    // The target state alone cannot tell "despublicó" from "volvió a
    // borrador", and the timeline says which.
    const { history, recorded } = fakeHistory();
    const service = new CmsContentService(
      permissive,
      fakeStore(documentAt("published")),
      history,
      undefined,
      noInvalidation,
    );

    await service.setStatus(actor, {
      id: PAGE_ID,
      status: "draft",
      expectedLockVersion: 1,
    });

    expect(recorded).toMatchObject([
      { action: "status", fromStatus: "published", toStatus: "draft" },
    ]);
  });

  it("marks an agent's edit as one", async () => {
    const { history, recorded } = fakeHistory();
    const service = new CmsContentService(
      permissive,
      fakeStore(documentAt("draft")),
      history,
    );

    await service.update(agent, {
      id: PAGE_ID,
      expectedLockVersion: 1,
      patch: { title: "Otro título" },
    });

    expect(recorded[0].source).toBe("mcp");
  });

  it("records nothing for a refused mutation", async () => {
    const { history, recorded } = fakeHistory();
    const service = new CmsContentService(
      permissive,
      fakeStore(documentAt("draft")),
      history,
    );

    await expect(
      service.update(actor, {
        id: PAGE_ID,
        expectedLockVersion: 7,
        patch: { title: "Otro título" },
      }),
    ).rejects.toThrow();
    expect(recorded).toEqual([]);
  });

  it("does not fail a save whose history row could not be written", async () => {
    // The page is already committed by then. Reporting an error would tell the
    // editor their work was lost when it was not.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { history } = fakeHistory({ fails: true });
    const service = new CmsContentService(
      permissive,
      fakeStore(documentAt("draft")),
      history,
    );

    await expect(
      service.update(actor, {
        id: PAGE_ID,
        expectedLockVersion: 1,
        patch: { title: "Otro título" },
      }),
    ).resolves.toMatchObject({ id: PAGE_ID });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

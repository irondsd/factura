import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentDocument } from "@/content-system/types";
import type { CmsActor } from "../types";
import { CmsContentService } from "./contentService";
import { CmsForbiddenError } from "./errors";
import type { CmsPageHistoryStore } from "./historyStore";
import type { CmsPageStore } from "./store";

// That the content service *asks* the policy, for every operation the policy
// claims to cover.
//
// Both roles may do everything in iteration 1, so no fixture can observe a
// refusal by choosing a role — which is exactly how `canAuthor` ended up with
// no call site at all and `canPublish` ended up guarding only half of what its
// own comment describes. The policy is mocked instead, so these tests pin the
// call sites; `auth/policy.test.ts` pins what the rules say.

const { canAuthor, canPublish } = vi.hoisted(() => ({
  canAuthor: vi.fn(() => true),
  canPublish: vi.fn(() => true),
}));

vi.mock("../auth/policy", () => ({ canAuthor, canPublish }));

const actor: CmsActor = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "editor@example.com",
  role: "editor",
};

function documentAt(status: ContentDocument["status"]): ContentDocument {
  return {
    id: "22222222-2222-2222-2222-222222222222",
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

/** A store that answers reads and records writes. Nothing here needs a
 * database: the question is whether the write is reached at all. */
function fakeStore(current: ContentDocument) {
  const writes: string[] = [];
  return {
    writes,
    store: {
      findById: async () => current,
      findBySlug: async () => null,
      list: async () => [],
      lockVersionOf: async () => current.lockVersion,
      insert: async () => {
        writes.push("insert");
        return current;
      },
      updateWithLock: async () => {
        writes.push("update");
        return current;
      },
      deleteWithLock: async () => {
        writes.push("delete");
        return true;
      },
    } as unknown as CmsPageStore,
  };
}

const permissive = () => ({ ok: true as const, diagnostics: [] });

/** History recording is not what these tests are about, and the real store
 * would go looking for a database. `history.test.ts` pins what gets written. */
const noHistory = { record: async () => {} } as unknown as CmsPageHistoryStore;

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

beforeEach(() => {
  canAuthor.mockReturnValue(true);
  canPublish.mockReturnValue(true);
  vi.clearAllMocks();
});

describe("authoring", () => {
  it("refuses a create when the actor may not author", async () => {
    canAuthor.mockReturnValue(false);
    const { store, writes } = fakeStore(documentAt("draft"));
    const service = new CmsContentService(permissive, store, noHistory);

    await expect(service.create(actor, createInput)).rejects.toBeInstanceOf(
      CmsForbiddenError,
    );
    expect(writes).toEqual([]);
  });

  it("refuses a save when the actor may not author", async () => {
    canAuthor.mockReturnValue(false);
    const { store, writes } = fakeStore(documentAt("draft"));
    const service = new CmsContentService(permissive, store, noHistory);

    await expect(
      service.update(actor, {
        id: documentAt("draft").id,
        expectedLockVersion: 1,
        patch: { title: "Otro título" },
      }),
    ).rejects.toBeInstanceOf(CmsForbiddenError);
    expect(writes).toEqual([]);
  });

  it("refuses a delete when the actor may not author", async () => {
    // Deleting is gated on authoring rather than on publishing because only a
    // draft can be deleted — nothing public is at stake, and an actor who may
    // not edit a draft has no business removing it either.
    canAuthor.mockReturnValue(false);
    const { store, writes } = fakeStore(documentAt("draft"));
    const service = new CmsContentService(permissive, store, noHistory);

    await expect(
      service.delete(actor, {
        id: documentAt("draft").id,
        expectedLockVersion: 1,
      }),
    ).rejects.toBeInstanceOf(CmsForbiddenError);
    expect(writes).toEqual([]);
  });

  it("lets an authorised actor through", async () => {
    const { store, writes } = fakeStore(documentAt("draft"));
    const service = new CmsContentService(permissive, store, noHistory);

    await service.create(actor, createInput);
    expect(canAuthor).toHaveBeenCalledWith(actor);
    expect(writes).toEqual(["insert"]);
  });
});

describe("publishing", () => {
  it("refuses to publish when the actor may not", async () => {
    canPublish.mockReturnValue(false);
    const { store, writes } = fakeStore(documentAt("draft"));
    const service = new CmsContentService(permissive, store, noHistory);

    await expect(
      service.setStatus(actor, {
        id: documentAt("draft").id,
        status: "published",
        expectedLockVersion: 1,
      }),
    ).rejects.toBeInstanceOf(CmsForbiddenError);
    expect(writes).toEqual([]);
  });

  it("refuses to UNpublish when the actor may not publish", async () => {
    // The half that was missing: only the transition *into* published consulted
    // the policy, so taking a live page down was open to everyone regardless of
    // how the role was configured.
    canPublish.mockReturnValue(false);
    const { store, writes } = fakeStore(documentAt("published"));
    const service = new CmsContentService(permissive, store, noHistory);

    await expect(
      service.setStatus(actor, {
        id: documentAt("published").id,
        status: "draft",
        expectedLockVersion: 1,
      }),
    ).rejects.toBeInstanceOf(CmsForbiddenError);
    expect(writes).toEqual([]);
  });

  it("does not ask the publish policy about draft → preview", async () => {
    // A preview is not publication: it is excluded from every listing and
    // carries `noindex, nofollow`. Gating it on `canPublish` would make the
    // toggle mean more than it says.
    canPublish.mockReturnValue(false);
    const { store, writes } = fakeStore(documentAt("draft"));
    const service = new CmsContentService(permissive, store, noHistory);

    await service.setStatus(actor, {
      id: documentAt("draft").id,
      status: "preview",
      expectedLockVersion: 1,
    });
    expect(writes).toEqual(["update"]);
  });
});

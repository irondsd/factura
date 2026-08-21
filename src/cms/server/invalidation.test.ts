import { describe, expect, it, vi } from "vitest";
import type {
  ContentDocument,
  ContentSection,
  ContentStatus,
} from "@/content-system/types";
import type { CmsActor } from "../types";
import { CmsContentService } from "./contentService";
import type { CmsPageHistoryStore } from "./historyStore";
import type { CmsPageStore } from "./store";

// When a write expires the public cache, and — the part worth pinning — when it
// does not (cms.md Task 4).
//
// Invalidating on every write would work and would be wrong: the public cache
// holds nothing about a draft, so a draft's save has nothing to expire, and an
// unconditional `revalidateTag` would throw away the whole section's cached
// pages every time someone typed a paragraph into an unpublished one. The rule
// is public *visibility*, which is why `preview` counts and `draft` does not.
//
// What the tag reaches once it is expired is Next's business and is not
// asserted here; `./invalidation.ts` is four lines over `revalidateTag`.

const PAGE_ID = "22222222-2222-2222-2222-222222222222";

const actor: CmsActor = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "editor@example.com",
  name: "Editor",
  role: "editor",
};

function documentAt(
  status: ContentStatus,
  section: ContentSection = "guias",
): ContentDocument {
  return {
    id: PAGE_ID,
    section,
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
    publishedAt: status === "draft" ? null : "2026-01-01T12:00:00.000Z",
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
    insert: async () => documentAt("draft"),
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

const permissive = () => ({ ok: true as const, diagnostics: [] });
const noHistory = { record: async () => {} } as unknown as CmsPageHistoryStore;

/** The service under test, plus the sections it asked to expire. */
function serviceFor(current: ContentDocument) {
  const expired: ContentSection[] = [];
  const service = new CmsContentService(
    permissive,
    fakeStore(current),
    noHistory,
    () => new Date("2026-02-01T00:00:00.000Z"),
    (section) => expired.push(section),
  );
  return { service, expired };
}

const save = (service: CmsContentService) =>
  service.update(actor, {
    id: PAGE_ID,
    expectedLockVersion: 1,
    patch: { body: "Cuerpo nuevo.\n" },
  });

const moveTo = (service: CmsContentService, status: ContentStatus) =>
  service.setStatus(actor, { id: PAGE_ID, status, expectedLockVersion: 1 });

describe("saving", () => {
  it("expires the section after editing a published page", async () => {
    const { service, expired } = serviceFor(documentAt("published"));
    await save(service);
    expect(expired).toEqual(["guias"]);
  });

  it("expires the section after editing a preview page", async () => {
    // Not published, but its URL is deliberately shareable and its rendered
    // copy is cached like any other — whoever holds the link is reading the
    // saved page, not a private draft.
    const { service, expired } = serviceFor(documentAt("preview"));
    await save(service);
    expect(expired).toEqual(["guias"]);
  });

  it("expires nothing after editing a draft", async () => {
    // The point of the whole rule: a draft is a 404 at its public URL and is
    // in no listing, so nothing cached is now wrong.
    const { service, expired } = serviceFor(documentAt("draft"));
    await save(service);
    expect(expired).toEqual([]);
  });

  it("expires the section the page belongs to, not guides", async () => {
    const { service, expired } = serviceFor(
      documentAt("published", "estadisticas"),
    );
    await save(service);
    expect(expired).toEqual(["estadisticas"]);
  });

  it("expires nothing when the save changed nothing", async () => {
    const { service, expired } = serviceFor(documentAt("published"));
    await service.update(actor, {
      id: PAGE_ID,
      expectedLockVersion: 1,
      patch: {},
    });
    expect(expired).toEqual([]);
  });

  it("expires nothing when the save was refused", async () => {
    // A stale save never reached the database, so the cached copy is still
    // the right one.
    const { service, expired } = serviceFor(documentAt("published"));
    await expect(
      service.update(actor, {
        id: PAGE_ID,
        expectedLockVersion: 7,
        patch: { body: "Cuerpo nuevo.\n" },
      }),
    ).rejects.toThrow();
    expect(expired).toEqual([]);
  });
});

describe("status transitions", () => {
  it("expires the section on publication", async () => {
    const { service, expired } = serviceFor(documentAt("draft"));
    await moveTo(service, "published");
    expect(expired).toEqual(["guias"]);
  });

  it("expires the section on unpublication", async () => {
    // The direction that has to work even though the page is now invisible:
    // the cached copy of a withdrawn page is exactly what must not be served.
    const { service, expired } = serviceFor(documentAt("published"));
    await moveTo(service, "draft");
    expect(expired).toEqual(["guias"]);
  });

  it("expires the section when a draft first gets a preview URL", async () => {
    // Nothing about the page is cached yet — the cached 404 of its path is,
    // and that is what this clears.
    const { service, expired } = serviceFor(documentAt("draft"));
    await moveTo(service, "preview");
    expect(expired).toEqual(["guias"]);
  });

  it("expires the section when a preview is taken back to draft", async () => {
    const { service, expired } = serviceFor(documentAt("preview"));
    await moveTo(service, "draft");
    expect(expired).toEqual(["guias"]);
  });
});

describe("creating", () => {
  it("expires nothing", async () => {
    // A new page is always a draft (§8), so there is never anything to expire.
    const { service, expired } = serviceFor(documentAt("draft"));
    await service.create(actor, {
      section: "guias",
      slug: "otra-guia",
      title: "Otra guía",
      description: "Descripción.",
      summary: "Resumen.",
      cta: "Probá Factura.",
      body: "Cuerpo.\n",
      metadata: { keywords: [], categories: [] },
    });
    expect(expired).toEqual([]);
  });
});

describe("a failing invalidation", () => {
  it("does not fail the save it follows", async () => {
    // The row is committed by then. Reporting an error would tell the editor
    // their work was lost when it was not; the fallback is the TTL that was
    // the only mechanism before Task 4.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const service = new CmsContentService(
      permissive,
      fakeStore(documentAt("published")),
      noHistory,
      () => new Date("2026-02-01T00:00:00.000Z"),
      () => {
        throw new Error("no request context");
      },
    );

    await expect(save(service)).resolves.toBeTruthy();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

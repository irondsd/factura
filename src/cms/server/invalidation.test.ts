import { describe, expect, it, vi } from "vitest";
import type { CmsActor } from "../types";
import { CmsContentService } from "./contentService";
import { createFakeCms, seedPage } from "./testFakes";

// When a write expires the public cache, and — the part worth pinning — when it
// does not (cms.md).
//
// Invalidating on every write would work and would be wrong, and revisions made
// the rule sharper rather than looser: a save now writes a `wip` revision that
// no public pointer can reach, so **no save ever expires anything**, whatever
// state the page is in. Only the operations that move a public pointer do:
// publishing, promoting a public preview, taking a page down.
//
// The one that is easy to get wrong is `draft → preview`/`published`, where the
// invalidation is not about a stale *page* but a stale **absence** — the path
// 404'd until a moment ago, and that 404 is cached under the same tag.
//
// What the tag reaches once it is expired is Next's business and is not
// asserted here; `./invalidation.ts` is four lines over `revalidateTag`.

const actor: CmsActor = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "editor@example.com",
  name: "Editor",
  role: "editor",
};

/** A page with one publication behind it and no working copy — the state most
 * of these start from, because it is the one where a save is most tempting to
 * invalidate on. */
async function publishedPage(fake: ReturnType<typeof createFakeCms>) {
  const page = await seedPage(fake, actor);
  const state = await fake.service.getState(actor, page.id);
  await fake.service.publish(actor, {
    id: page.id,
    expectedLockVersion: state.lockVersion,
  });
  fake.expired.length = 0;
  return page.id;
}

const lockOf = async (
  fake: ReturnType<typeof createFakeCms>,
  id: string,
): Promise<number> => (await fake.service.getState(actor, id)).lockVersion;

describe("saving", () => {
  it("expires nothing after editing a published page", async () => {
    // The property the whole feature exists for: the live publication is
    // untouched, so nothing cached is now wrong.
    const fake = createFakeCms();
    const id = await publishedPage(fake);
    await fake.service.update(actor, {
      id,
      expectedLockVersion: await lockOf(fake, id),
      patch: { body: "Cuerpo nuevo.\n" },
    });
    expect(fake.expired).toEqual([]);
  });

  it("expires nothing after editing a page in public preview", async () => {
    // The shareable preview is a promoted snapshot, not the working copy —
    // whoever holds the link keeps seeing exactly what was promoted.
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    await fake.service.promotePreview(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });
    fake.expired.length = 0;

    await fake.service.update(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
      patch: { body: "Cuerpo nuevo.\n" },
    });
    expect(fake.expired).toEqual([]);
  });

  it("expires nothing after editing a draft", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    fake.expired.length = 0;
    await fake.service.update(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
      patch: { body: "Cuerpo nuevo.\n" },
    });
    expect(fake.expired).toEqual([]);
  });

  it("expires nothing when the save was refused", async () => {
    const fake = createFakeCms();
    const id = await publishedPage(fake);
    await expect(
      fake.service.update(actor, {
        id,
        expectedLockVersion: 99,
        patch: { body: "Cuerpo nuevo.\n" },
      }),
    ).rejects.toThrow();
    expect(fake.expired).toEqual([]);
  });
});

describe("publication", () => {
  it("expires the section when a draft is published", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    await fake.service.publish(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });
    expect(fake.expired).toEqual(["guias"]);
  });

  it("expires the section the page belongs to, not guides", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor, {
      section: "estadisticas",
      slug: "un-dato",
    });
    await fake.service.publish(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });
    expect(fake.expired).toEqual(["estadisticas"]);
  });

  it("expires the section when a saved change is published", async () => {
    const fake = createFakeCms();
    const id = await publishedPage(fake);
    await fake.service.update(actor, {
      id,
      expectedLockVersion: await lockOf(fake, id),
      patch: { body: "Cuerpo nuevo.\n" },
    });
    expect(fake.expired).toEqual([]);

    await fake.service.publish(actor, {
      id,
      expectedLockVersion: await lockOf(fake, id),
    });
    expect(fake.expired).toEqual(["guias"]);
  });

  it("expires nothing when publishing would change nothing", async () => {
    // No publication was filed, so no reader's copy became stale. Expiring
    // anyway would throw the section's cache away for a click that did nothing.
    const fake = createFakeCms();
    const id = await publishedPage(fake);
    const result = await fake.service.publish(actor, {
      id,
      expectedLockVersion: await lockOf(fake, id),
    });
    expect(result.noChange).toBe(true);
    expect(fake.expired).toEqual([]);
  });
});

describe("public preview and unpublication", () => {
  it("expires the section when a draft first gets a public preview", async () => {
    // Nothing about the page is cached yet — the cached 404 of its path is,
    // and that is what this clears.
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    await fake.service.promotePreview(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });
    expect(fake.expired).toEqual(["guias"]);
  });

  it("expires the section when the public preview is refreshed", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    await fake.service.promotePreview(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });
    fake.expired.length = 0;

    await fake.service.update(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
      patch: { body: "Otro cuerpo.\n" },
    });
    await fake.service.promotePreview(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });
    expect(fake.expired).toEqual(["guias"]);
  });

  it("expires the section on unpublication", async () => {
    // The direction that has to work even though the page is now invisible:
    // the cached copy of a withdrawn page is exactly what must not be served.
    const fake = createFakeCms();
    const id = await publishedPage(fake);
    await fake.service.unpublish(actor, {
      id,
      expectedLockVersion: await lockOf(fake, id),
    });
    expect(fake.expired).toEqual(["guias"]);
  });

  it("expires the section when a preview is taken back to draft", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    await fake.service.promotePreview(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });
    fake.expired.length = 0;
    await fake.service.unpublish(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });
    expect(fake.expired).toEqual(["guias"]);
  });
});

describe("private operations", () => {
  it("expire nothing: create, restore and discard", async () => {
    // None of the three moves a public pointer. Restore in particular: it
    // replaces the working copy with an old publication, and a reader must not
    // notice.
    const fake = createFakeCms();
    const id = await publishedPage(fake);
    const versions = await fake.service.listVersions(actor, id);
    const publication = versions.versions.find(
      (version) => version.kind === "published",
    );

    await fake.service.update(actor, {
      id,
      expectedLockVersion: await lockOf(fake, id),
      patch: { body: "Cuerpo nuevo.\n" },
    });
    await fake.service.restoreVersion(actor, {
      id,
      revisionId: publication!.revisionId,
      expectedLockVersion: await lockOf(fake, id),
    });
    await fake.service.discardWip(actor, {
      id,
      expectedLockVersion: await lockOf(fake, id),
    });
    expect(fake.expired).toEqual([]);
  });
});

describe("a failing invalidation", () => {
  it("does not fail the publication it follows", async () => {
    // The rows are committed by then. Reporting an error would tell the editor
    // their publication failed when it did not; the fallback is the TTL that
    // was the only mechanism before on-demand invalidation existed.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    const broken = new CmsContentService(
      () => ({ ok: true, diagnostics: [] }),
      fake.store,
      fake.revisions,
      undefined,
      () => fake.now(),
      () => {
        throw new Error("no request context");
      },
    );

    await expect(
      broken.publish(actor, {
        id: page.id,
        expectedLockVersion: (await fake.service.getState(actor, page.id))
          .lockVersion,
      }),
    ).resolves.toBeTruthy();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

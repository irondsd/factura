import { describe, expect, it, vi } from "vitest";
import type { CmsActor } from "../types";
import { CmsContentService } from "./contentService";
import type { CmsPageHistoryStore } from "./historyStore";
import { actionsOf, createFakeCms, seedPage } from "./testFakes";

// That every accepted mutation leaves a line in «Historial», that the six kinds
// of change are told apart, and that a failure to write that line never turns a
// save the editor already made into an error.
//
// The recording lives in the service rather than in the browser actions on
// purpose (cms.md §2.2): the CMS MCP calls the same methods, so an agent's edit
// has to show up in the same trail without a second implementation. That is
// only true if it is written here, which is what these tests hold in place.

const actor: CmsActor = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "editor@example.com",
  name: "Editor",
  role: "editor",
};

const agent: CmsActor = { ...actor, source: "mcp" };

const lockOf = async (
  fake: ReturnType<typeof createFakeCms>,
  id: string,
): Promise<number> => (await fake.service.getState(actor, id)).lockVersion;

describe("recording page history", () => {
  it("records a creation", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);

    expect(fake.events).toHaveLength(1);
    expect(fake.events[0]).toMatchObject({
      pageId: page.id,
      actorId: actor.userId,
      action: "created",
      source: "browser",
    });
  });

  it("records a save", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    await fake.service.update(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
      patch: { title: "Otro título" },
    });
    expect(actionsOf(fake)).toEqual(["created", "saved"]);
  });

  it("records both sides of a status change", async () => {
    // The target state alone cannot tell "despublicó" from "volvió a
    // borrador", and the timeline says which.
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    await fake.service.publish(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });
    await fake.service.unpublish(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });

    expect(fake.events.at(-1)).toMatchObject({
      action: "status",
      fromStatus: "published",
      toStatus: "draft",
    });
  });

  it("tells restoring, discarding and promoting apart from an ordinary save", async () => {
    // Three actions that would all be «guardó cambios» without their own
    // names, and all three mean something different to whoever reads the
    // timeline next (cms.md §14.7.3).
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    await fake.service.promotePreview(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });
    await fake.service.publish(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });

    const versions = await fake.service.listVersions(actor, page.id);
    const publication = versions.versions.find(
      (version) => version.kind === "published",
    )!;
    await fake.service.restoreVersion(actor, {
      id: page.id,
      revisionId: publication.revisionId,
      expectedLockVersion: await lockOf(fake, page.id),
    });
    await fake.service.discardWip(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });

    expect(actionsOf(fake)).toEqual([
      "created",
      "preview_promoted",
      "status",
      "restored",
      "discarded",
    ]);
  });

  it("marks an agent's edit as one", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    await fake.service.update(agent, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
      patch: { title: "Otro título" },
    });
    expect(fake.events.at(-1)?.source).toBe("mcp");
  });

  it("records nothing for a refused mutation", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    fake.events.length = 0;

    await expect(
      fake.service.update(actor, {
        id: page.id,
        expectedLockVersion: 99,
        patch: { title: "Otro título" },
      }),
    ).rejects.toThrow();
    expect(fake.events).toEqual([]);
  });

  it("does not fail a save whose history row could not be written", async () => {
    // The revision is already committed by then. Reporting an error would tell
    // the editor their work was lost when it was not.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);

    const brokenHistory = {
      record: async () => {
        throw new Error("no database");
      },
      actorsById: async () => new Map(),
    } as unknown as CmsPageHistoryStore;

    const service = new CmsContentService(
      () => ({ ok: true, diagnostics: [] }),
      fake.store,
      fake.revisions,
      brokenHistory,
      () => fake.now(),
      () => {},
    );

    await expect(
      service.update(actor, {
        id: page.id,
        expectedLockVersion: await lockOf(fake, page.id),
        patch: { title: "Otro título" },
      }),
    ).resolves.toMatchObject({ document: { id: page.id } });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

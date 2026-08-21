import { describe, expect, it } from "vitest";
import type { ContentDocument } from "@/content-system/types";
import { CHECKPOINT_WINDOW_MS } from "../revisions";
import type { CmsActor } from "../types";
import {
  CmsConflictError,
  CmsNoWorkingCopyError,
  CmsRevisionNotFoundError,
} from "./errors";
import { createFakeCms, kindsOf, seedPage, type FakeCms } from "./testFakes";

// The working-copy lifecycle (cms.md §14.5): what a save writes, when a
// checkpoint rotates, what publishing promotes and prunes, and what restore and
// discard leave behind.
//
// Against the in-memory stores in `./testFakes`, which model the partial unique
// indexes and the `restrict` foreign keys — so "there is only ever one working
// copy" and "a pointed-at revision cannot be deleted" fail here rather than in
// production. Atomicity and concurrency are the integration suite's job.

const actor: CmsActor = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "editor@example.com",
  name: null,
  role: "editor",
};
const other: CmsActor = {
  ...actor,
  userId: "33333333-3333-3333-3333-333333333333",
};

const lockOf = async (fake: FakeCms, id: string): Promise<number> =>
  (await fake.service.getState(actor, id)).lockVersion;

const save = async (fake: FakeCms, id: string, body: string) =>
  fake.service.update(actor, {
    id,
    expectedLockVersion: await lockOf(fake, id),
    patch: { body },
  });

const publish = async (fake: FakeCms, id: string) =>
  fake.service.publish(actor, {
    id,
    expectedLockVersion: await lockOf(fake, id),
  });

/** A page with one publication and no working copy — the state an editor most
 * often opens, and the one where a save is riskiest. */
async function published(fake: FakeCms): Promise<ContentDocument> {
  const page = await seedPage(fake, actor);
  await publish(fake, page.id);
  return page;
}

describe("saving a working copy", () => {
  it("creates the page's first copy as a working copy, not a publication", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    expect(kindsOf(fake, page.id)).toEqual(["wip"]);
    expect(fake.pageRow(page.id)?.publishedRevisionId).toBeNull();
  });

  it("lazily creates a working copy after a publication consumed the last one", async () => {
    // Opening the editor writes nothing; the *save* is what creates the copy,
    // and it records the publication it was started from.
    const fake = createFakeCms();
    const page = await published(fake);
    expect(kindsOf(fake, page.id)).toEqual(["published"]);

    const result = await save(fake, page.id, "Cuerpo nuevo.\n");
    expect(result.created).toBe(true);
    expect(kindsOf(fake, page.id)).toEqual(["published", "wip"]);
    expect(result.document.body).toBe("Cuerpo nuevo.\n");

    const state = await fake.service.getState(actor, page.id);
    expect(state.wipBasedOnRevisionId).toBe(
      fake.pageRow(page.id)?.publishedRevisionId,
    );
  });

  it("leaves the live publication byte-for-byte untouched", async () => {
    // The whole feature. The document a public read would resolve has to be
    // the one that was published, not the one being typed.
    const fake = createFakeCms();
    const page = await published(fake);
    const before = fake
      .revisionRows(page.id)
      .find((revision) => revision.kind === "published");

    await save(fake, page.id, "Un borrador a medio escribir.\n");

    const after = fake
      .revisionRows(page.id)
      .find((revision) => revision.kind === "published");
    expect(after).toEqual(before);
    expect(fake.pageRow(page.id)?.status).toBe("published");
  });

  it("updates the working copy in place rather than adding another", async () => {
    const fake = createFakeCms();
    const page = await published(fake);
    const first = await save(fake, page.id, "Uno.\n");
    const second = await save(fake, page.id, "Dos.\n");

    expect(second.wipRevisionId).toBe(first.wipRevisionId);
    expect(second.created).toBe(false);
    expect(
      fake.revisionRows(page.id).filter((r) => r.kind === "wip"),
    ).toHaveLength(1);
  });

  it("bumps the page lock even though it writes no page column", async () => {
    // The page lock is the CMS's single concurrency token. A save that did not
    // move it would let a second editor keep holding a version that is no
    // longer current.
    const fake = createFakeCms();
    const page = await published(fake);
    const before = await lockOf(fake, page.id);
    await save(fake, page.id, "Uno.\n");
    expect(await lockOf(fake, page.id)).toBe(before + 1);
  });

  it("refuses a stale save without touching the shared copy", async () => {
    const fake = createFakeCms();
    const page = await published(fake);
    await save(fake, page.id, "De la primera pestaña.\n");

    await expect(
      fake.service.update(other, {
        id: page.id,
        expectedLockVersion: 1,
        patch: { body: "De la segunda pestaña.\n" },
      }),
    ).rejects.toBeInstanceOf(CmsConflictError);

    const wip = fake.revisionRows(page.id).find((r) => r.kind === "wip");
    expect(wip?.body).toBe("De la primera pestaña.\n");
  });

  it("records media usage against the working copy it wrote", async () => {
    const fake = createFakeCms();
    const page = await published(fake);
    fake.usageWrites.length = 0;
    const result = await save(fake, page.id, "Uno.\n");
    expect(fake.usageWrites).toEqual([result.wipRevisionId]);
  });
});

describe("the 24-hour checkpoint", () => {
  it("takes no checkpoint when the working copy is created", async () => {
    // There is nothing to preserve: the copy did not exist a moment ago.
    const fake = createFakeCms();
    const page = await published(fake);
    await save(fake, page.id, "Uno.\n");
    expect(kindsOf(fake, page.id)).toEqual(["published", "wip"]);
  });

  it("preserves the pre-save state on the second save", async () => {
    const fake = createFakeCms();
    const page = await published(fake);
    await save(fake, page.id, "Uno.\n");
    await save(fake, page.id, "Dos.\n");

    const checkpoint = fake
      .revisionRows(page.id)
      .find((revision) => revision.kind === "checkpoint");
    expect(checkpoint?.body).toBe("Uno.\n");
  });

  it("compresses a run of saves to one working copy and one checkpoint", async () => {
    // Ten saves in an hour is one editing session. Storage holds the state
    // before it and the latest — not ten intermediate bodies.
    const fake = createFakeCms();
    const page = await published(fake);
    for (let i = 0; i < 10; i++) {
      fake.setNow(
        new Date(`2026-02-01T${String(12 + i).padStart(2, "0")}:00:00.000Z`),
      );
      await save(fake, page.id, `Versión ${i}.\n`);
    }

    expect(kindsOf(fake, page.id)).toEqual(["checkpoint", "published", "wip"]);
    const checkpoint = fake
      .revisionRows(page.id)
      .find((revision) => revision.kind === "checkpoint");
    // The state before the window, not the one immediately before the last save.
    expect(checkpoint?.body).toBe("Versión 0.\n");
  });

  it("rotates the checkpoint once the window has elapsed", async () => {
    const start = new Date("2026-02-01T12:00:00.000Z");
    const fake = createFakeCms({ now: start });
    const page = await published(fake);
    await save(fake, page.id, "Uno.\n");
    await save(fake, page.id, "Dos.\n");

    fake.setNow(new Date(start.getTime() + CHECKPOINT_WINDOW_MS + 1000));
    await save(fake, page.id, "Tres.\n");

    const checkpoints = fake
      .revisionRows(page.id)
      .filter((revision) => revision.kind === "checkpoint");
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].body).toBe("Dos.\n");
  });

  it("attributes the checkpoint to whoever wrote the copy, not to whoever triggered the rotation", async () => {
    const fake = createFakeCms();
    const page = await published(fake);
    await save(fake, page.id, "Uno.\n");

    await fake.service.update(other, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
      patch: { body: "Dos.\n" },
    });

    const checkpoint = fake
      .revisionRows(page.id)
      .find((revision) => revision.kind === "checkpoint");
    expect(checkpoint?.updatedBy).toBe(actor.userId);
  });
});

describe("publishing", () => {
  it("promotes the working copy, clears it, and points the page at the new publication", async () => {
    const fake = createFakeCms();
    const page = await published(fake);
    await save(fake, page.id, "Uno.\n");
    await save(fake, page.id, "Dos.\n");
    expect(kindsOf(fake, page.id)).toEqual(["checkpoint", "published", "wip"]);

    const result = await publish(fake, page.id);
    expect(result.noChange).toBe(false);
    expect(result.publicationNumber).toBe(2);
    expect(result.document.body).toBe("Dos.\n");
    // The working copy and its checkpoint are gone; two publications remain.
    expect(kindsOf(fake, page.id)).toEqual(["published", "published"]);

    const live = fake.pageRow(page.id)?.publishedRevisionId;
    expect(
      fake.revisionRows(page.id).find((r) => r.id === live)?.publicationNumber,
    ).toBe(2);
  });

  it("keeps exactly the current publication plus three previous", async () => {
    const fake = createFakeCms();
    const page = await published(fake);
    for (let i = 2; i <= 6; i++) {
      await save(fake, page.id, `Versión ${i}.\n`);
      await publish(fake, page.id);
    }

    const publications = fake
      .revisionRows(page.id)
      .filter((revision) => revision.kind === "published")
      .map((revision) => revision.publicationNumber)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(publications).toEqual([3, 4, 5, 6]);
  });

  it("never prunes the publication the page is serving", async () => {
    const fake = createFakeCms();
    const page = await published(fake);
    for (let i = 2; i <= 8; i++) {
      await save(fake, page.id, `Versión ${i}.\n`);
      await publish(fake, page.id);
    }
    const live = fake.pageRow(page.id)?.publishedRevisionId;
    expect(fake.revisionRows(page.id).some((r) => r.id === live)).toBe(true);
  });

  it("refuses to file a duplicate when the working copy matches the live version", async () => {
    // A second publication saying nothing would consume a retention slot and
    // push the oldest publication out for no reason.
    const fake = createFakeCms();
    const page = await published(fake);
    const before = fake.revisionRows(page.id);

    const result = await publish(fake, page.id);
    expect(result.noChange).toBe(true);
    expect(fake.revisionRows(page.id)).toEqual(before);
  });

  it("leaves the working copy in place after a no-change publication", async () => {
    // Removing it is «Descartar borrador», a separate decision — the editor may
    // have saved something they still mean to change.
    const fake = createFakeCms();
    const page = await published(fake);
    const live = fake.revisionRows(page.id)[0];
    await save(fake, page.id, live.body);

    const result = await publish(fake, page.id);
    expect(result.noChange).toBe(true);
    expect(kindsOf(fake, page.id)).toContain("wip");
  });

  it("re-exposes the retained publication when republishing with nothing new", async () => {
    // No duplicate revision, and the editorial dates do not move: the article
    // was not rewritten, it was taken down and put back.
    const fake = createFakeCms();
    const page = await published(fake);
    const live = fake.revisionRows(page.id)[0];

    await fake.service.unpublish(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });
    const result = await publish(fake, page.id);

    expect(result.noChange).toBe(true);
    expect(fake.pageRow(page.id)?.publishedRevisionId).toBe(live.id);
    expect(fake.revisionRows(page.id)).toHaveLength(1);
  });

  it("refuses to publish a page that has neither a working copy nor a publication", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    await fake.service.promotePreview(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });
    await fake.service.discardWip(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });

    await expect(publish(fake, page.id)).rejects.toBeInstanceOf(
      CmsNoWorkingCopyError,
    );
  });

  it("keeps the page's first publication date across a republication", async () => {
    const fake = createFakeCms({ now: new Date("2026-01-01T12:00:00.000Z") });
    const page = await published(fake);
    const first = fake.pageRow(page.id)?.publishedAt;

    fake.setNow(new Date("2026-06-01T12:00:00.000Z"));
    await save(fake, page.id, "Uno.\n");
    await publish(fake, page.id);

    expect(fake.pageRow(page.id)?.publishedAt).toEqual(first);
  });
});

describe("the public preview", () => {
  it("freezes the working copy and keeps it editable", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    await fake.service.promotePreview(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });

    expect(fake.pageRow(page.id)?.status).toBe("preview");
    expect(kindsOf(fake, page.id)).toEqual(["preview", "wip"]);
  });

  it("does not follow later saves until it is explicitly refreshed", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    await fake.service.promotePreview(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });
    const promoted = fake
      .revisionRows(page.id)
      .find((revision) => revision.kind === "preview");

    fake.setNow(new Date("2026-02-02T12:00:00.000Z"));
    await save(fake, page.id, "Algo que nadie debería ver todavía.\n");

    expect(
      fake
        .revisionRows(page.id)
        .find((revision) => revision.kind === "preview"),
    ).toEqual(promoted);
    const state = await fake.service.getState(actor, page.id);
    expect(state.previewIsStale).toBe(true);
  });

  it("replaces the snapshot when refreshed, keeping only one", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    await fake.service.promotePreview(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });
    fake.setNow(new Date("2026-02-02T12:00:00.000Z"));
    await save(fake, page.id, "Nuevo.\n");
    await fake.service.promotePreview(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });

    const previews = fake
      .revisionRows(page.id)
      .filter((revision) => revision.kind === "preview");
    expect(previews).toHaveLength(1);
    expect(previews[0].body).toBe("Nuevo.\n");
    expect((await fake.service.getState(actor, page.id)).previewIsStale).toBe(
      false,
    );
  });

  it("is removed by publishing", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    await fake.service.promotePreview(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });
    await publish(fake, page.id);
    expect(kindsOf(fake, page.id)).toEqual(["published"]);
  });

  it("is removed when the page goes back to draft, and the working copy is not", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    await fake.service.promotePreview(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });
    await fake.service.unpublish(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });

    expect(kindsOf(fake, page.id)).toEqual(["wip"]);
    expect(fake.pageRow(page.id)?.status).toBe("draft");
  });
});

describe("restoring", () => {
  it("copies a publication into the working copy without touching the live page", async () => {
    const fake = createFakeCms();
    const page = await published(fake);
    const original = fake.revisionRows(page.id)[0];

    await save(fake, page.id, "Reescrito.\n");
    await publish(fake, page.id);
    const liveBefore = fake.pageRow(page.id)?.publishedRevisionId;

    await fake.service.restoreVersion(actor, {
      id: page.id,
      revisionId: original.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });

    const wip = fake.revisionRows(page.id).find((r) => r.kind === "wip");
    expect(wip?.body).toBe(original.body);
    expect(wip?.basedOnRevisionId).toBe(original.id);
    expect(fake.pageRow(page.id)?.publishedRevisionId).toBe(liveBefore);
    expect(fake.pageRow(page.id)?.status).toBe("published");
  });

  it("restores every authored field, not just the Markdown", async () => {
    const fake = createFakeCms();
    const page = await published(fake);
    const original = fake.revisionRows(page.id)[0];

    await fake.service.update(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
      patch: {
        title: "Otro título",
        crumb: "Corto",
        sortOrder: 5,
        metadata: { keywords: ["otra"], categories: ["servicios"] },
      },
    });
    await publish(fake, page.id);

    await fake.service.restoreVersion(actor, {
      id: page.id,
      revisionId: original.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });

    const wip = fake.revisionRows(page.id).find((r) => r.kind === "wip")!;
    expect(wip.title).toBe(original.title);
    expect(wip.crumb).toBe(original.crumb);
    expect(wip.sortOrder).toBe(original.sortOrder);
    expect(wip.metadata).toEqual(original.metadata);
  });

  it("keeps the pre-restore working copy as the checkpoint even inside the window", async () => {
    // The restore itself has to be undoable — it is a bigger replacement than
    // a save, and the 24-hour rule would otherwise swallow it.
    const fake = createFakeCms();
    const page = await published(fake);
    const original = fake.revisionRows(page.id)[0];
    await save(fake, page.id, "Trabajo en curso.\n");

    await fake.service.restoreVersion(actor, {
      id: page.id,
      revisionId: original.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });

    const checkpoint = fake
      .revisionRows(page.id)
      .find((revision) => revision.kind === "checkpoint");
    expect(checkpoint?.body).toBe("Trabajo en curso.\n");
  });

  it("refuses a revision belonging to another page", async () => {
    // Indistinguishable from "no such revision": an id from another page must
    // not be confirmed as real.
    const fake = createFakeCms();
    const mine = await published(fake);
    const theirs = await seedPage(fake, actor, { slug: "otra-guia" });
    const theirRevision = fake.revisionRows(theirs.id)[0];

    await expect(
      fake.service.restoreVersion(actor, {
        id: mine.id,
        revisionId: theirRevision.id,
        expectedLockVersion: await lockOf(fake, mine.id),
      }),
    ).rejects.toBeInstanceOf(CmsRevisionNotFoundError);
  });

  it("refuses to restore the working copy onto itself", async () => {
    // A no-op that would still rotate the checkpoint, losing the very state it
    // was protecting.
    const fake = createFakeCms();
    const page = await published(fake);
    const wip = (await save(fake, page.id, "Uno.\n")).wipRevisionId;

    await expect(
      fake.service.restoreVersion(actor, {
        id: page.id,
        revisionId: wip,
        expectedLockVersion: await lockOf(fake, page.id),
      }),
    ).rejects.toBeInstanceOf(CmsRevisionNotFoundError);
  });

  it("refuses a version the editor no longer holds", async () => {
    const fake = createFakeCms();
    const page = await published(fake);
    const original = fake.revisionRows(page.id)[0];

    await expect(
      fake.service.restoreVersion(actor, {
        id: page.id,
        revisionId: original.id,
        expectedLockVersion: 99,
      }),
    ).rejects.toBeInstanceOf(CmsConflictError);
  });
});

describe("discarding", () => {
  it("removes the working copy and its checkpoint and nothing else", async () => {
    const fake = createFakeCms();
    const page = await published(fake);
    await save(fake, page.id, "Uno.\n");
    await save(fake, page.id, "Dos.\n");

    await fake.service.discardWip(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });

    expect(kindsOf(fake, page.id)).toEqual(["published"]);
    expect(fake.pageRow(page.id)?.status).toBe("published");
    expect(fake.pageRow(page.id)?.wipRevisionId).toBeNull();
    expect(fake.pageRow(page.id)?.checkpointRevisionId).toBeNull();
  });

  it("refuses when there is nothing to discard", async () => {
    const fake = createFakeCms();
    const page = await published(fake);
    await expect(
      fake.service.discardWip(actor, {
        id: page.id,
        expectedLockVersion: await lockOf(fake, page.id),
      }),
    ).rejects.toBeInstanceOf(CmsNoWorkingCopyError);
  });

  it("refuses when the working copy is the page's only content", async () => {
    // Discarding it would leave a page that cannot be read at all. That is
    // «Eliminar esta página», which has its own guards.
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    await expect(
      fake.service.discardWip(actor, {
        id: page.id,
        expectedLockVersion: await lockOf(fake, page.id),
      }),
    ).rejects.toThrow(/sin contenido/);
  });
});

describe("the version list", () => {
  it("lists the working copy, the checkpoint and the publications, newest first", async () => {
    const fake = createFakeCms();
    const page = await published(fake);
    await save(fake, page.id, "Uno.\n");
    await publish(fake, page.id);
    await save(fake, page.id, "Dos.\n");
    await save(fake, page.id, "Tres.\n");

    const versions = await fake.service.listVersions(actor, page.id);
    expect(versions.versions.map((version) => version.kind)).toEqual([
      "wip",
      "checkpoint",
      "published",
      "published",
    ]);
    expect(
      versions.versions
        .filter((version) => version.kind === "published")
        .map((version) => version.publicationNumber),
    ).toEqual([2, 1]);
  });

  it("marks the live publication and names it as the comparison baseline", async () => {
    const fake = createFakeCms();
    const page = await published(fake);
    const versions = await fake.service.listVersions(actor, page.id);

    expect(versions.baselineRevisionId).toBe(
      fake.pageRow(page.id)?.publishedRevisionId,
    );
    expect(versions.baselineIsLive).toBe(true);
    expect(versions.versions.filter((v) => v.isLive)).toHaveLength(1);
  });

  it("does not call the baseline live once the page is unpublished", async () => {
    const fake = createFakeCms();
    const page = await published(fake);
    await fake.service.unpublish(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });

    const versions = await fake.service.listVersions(actor, page.id);
    expect(versions.baselineRevisionId).not.toBeNull();
    expect(versions.baselineIsLive).toBe(false);
    expect(versions.versions.some((version) => version.isLive)).toBe(false);
  });
});

describe("comparison", () => {
  it("compares the working copy against the live publication by default", async () => {
    const fake = createFakeCms();
    const page = await published(fake);
    await save(fake, page.id, "Cuerpo reescrito.\n");

    const comparison = await fake.service.compareVersion(actor, {
      id: page.id,
    });
    expect(comparison.baseline?.isLive).toBe(true);
    expect(comparison.candidate.kind).toBe("wip");
    expect(comparison.diff?.identical).toBe(false);
    expect(comparison.diff?.bodyAdded).toBeGreaterThan(0);
  });

  it("compares an old publication against the same baseline", async () => {
    const fake = createFakeCms();
    const page = await published(fake);
    const original = fake.revisionRows(page.id)[0];
    await save(fake, page.id, "Reescrito.\n");
    await publish(fake, page.id);

    const comparison = await fake.service.compareVersion(actor, {
      id: page.id,
      revisionId: original.id,
    });
    expect(comparison.candidate.revisionId).toBe(original.id);
    expect(comparison.baseline?.revisionId).toBe(
      fake.pageRow(page.id)?.publishedRevisionId,
    );
  });

  it("has no baseline for a page that has never been published", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    const comparison = await fake.service.compareVersion(actor, {
      id: page.id,
    });
    expect(comparison.baseline).toBeNull();
    expect(comparison.diff).toBeNull();
  });

  it("produces no diff when the candidate is the baseline", async () => {
    const fake = createFakeCms();
    const page = await published(fake);
    const live = fake.pageRow(page.id)!.publishedRevisionId!;
    const comparison = await fake.service.compareVersion(actor, {
      id: page.id,
      revisionId: live,
    });
    expect(comparison.diff).toBeNull();
  });

  it("writes nothing", async () => {
    const fake = createFakeCms();
    const page = await published(fake);
    await save(fake, page.id, "Uno.\n");
    const before = JSON.stringify(fake.revisionRows(page.id));
    const events = fake.events.length;

    await fake.service.compareVersion(actor, { id: page.id });

    expect(JSON.stringify(fake.revisionRows(page.id))).toEqual(before);
    expect(fake.events).toHaveLength(events);
  });
});

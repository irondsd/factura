import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CmsActor } from "../types";
import { CmsForbiddenError } from "./errors";
import { createFakeCms, seedPage, type FakeCms } from "./testFakes";

// That the content service *asks* the policy, for every operation the policy
// claims to cover.
//
// Both roles may do everything in iteration 1, so no fixture can observe a
// refusal by choosing a role — which is exactly how `canAuthor` ended up with
// no call site at all and `canPublish` ended up guarding only half of what its
// own comment describes. The policy is mocked instead, so these tests pin the
// call sites; `auth/policy.test.ts` pins what the rules say.
//
// The assertion after every refusal is that nothing was written. A guard that
// throws after the insert is not a guard.

const { canAuthor, canPublish } = vi.hoisted(() => ({
  canAuthor: vi.fn(() => true),
  canPublish: vi.fn(() => true),
}));

vi.mock("../auth/policy", () => ({ canAuthor, canPublish }));

const actor: CmsActor = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "editor@example.com",
  name: null,
  role: "editor",
};

const lockOf = async (fake: FakeCms, id: string): Promise<number> =>
  (await fake.service.getState(actor, id)).lockVersion;

/** A page and the exact state of its stored copies, so a refusal can be shown
 * to have changed nothing. */
async function snapshot(fake: FakeCms, id: string) {
  return JSON.stringify({
    page: fake.pageRow(id),
    revisions: fake.revisionRows(id),
  });
}

beforeEach(() => {
  canAuthor.mockReturnValue(true);
  canPublish.mockReturnValue(true);
  vi.clearAllMocks();
});

describe("authoring", () => {
  it("refuses a create when the actor may not author", async () => {
    const fake = createFakeCms();
    canAuthor.mockReturnValue(false);
    await expect(seedPage(fake, actor)).rejects.toBeInstanceOf(
      CmsForbiddenError,
    );
    expect(fake.revisionRows("")).toEqual([]);
  });

  it("refuses a save when the actor may not author", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    const before = await snapshot(fake, page.id);

    canAuthor.mockReturnValue(false);
    await expect(
      fake.service.update(actor, {
        id: page.id,
        expectedLockVersion: await lockOf(fake, page.id).catch(() => 1),
        patch: { title: "Otro título" },
      }),
    ).rejects.toBeInstanceOf(CmsForbiddenError);
    expect(await snapshot(fake, page.id)).toEqual(before);
  });

  it("refuses a restore when the actor may not author", async () => {
    // Restoring writes the working copy, so it is an authoring decision — not
    // a publishing one, because nothing public moves.
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    await fake.service.publish(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });
    const versions = await fake.service.listVersions(actor, page.id);
    const publication = versions.versions[0];
    const before = await snapshot(fake, page.id);

    canAuthor.mockReturnValue(false);
    await expect(
      fake.service.restoreVersion(actor, {
        id: page.id,
        revisionId: publication.revisionId,
        expectedLockVersion: await lockOf(fake, page.id),
      }),
    ).rejects.toBeInstanceOf(CmsForbiddenError);
    expect(await snapshot(fake, page.id)).toEqual(before);
  });

  it("refuses a discard when the actor may not author", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    const before = await snapshot(fake, page.id);

    canAuthor.mockReturnValue(false);
    await expect(
      fake.service.discardWip(actor, {
        id: page.id,
        expectedLockVersion: await lockOf(fake, page.id),
      }),
    ).rejects.toBeInstanceOf(CmsForbiddenError);
    expect(await snapshot(fake, page.id)).toEqual(before);
  });

  it("refuses a delete when the actor may not author", async () => {
    // Deleting is gated on authoring rather than on publishing because only a
    // draft can be deleted — nothing public is at stake, and an actor who may
    // not edit a draft has no business removing it either.
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);

    canAuthor.mockReturnValue(false);
    await expect(
      fake.service.delete(actor, {
        id: page.id,
        expectedLockVersion: await lockOf(fake, page.id),
      }),
    ).rejects.toBeInstanceOf(CmsForbiddenError);
    expect(fake.pageRow(page.id)).toBeDefined();
  });

  it("lets an authorised actor through", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    expect(canAuthor).toHaveBeenCalledWith(actor);
    expect(fake.revisionRows(page.id)).toHaveLength(1);
  });
});

describe("publishing", () => {
  it("refuses to publish when the actor may not", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    const before = await snapshot(fake, page.id);

    canPublish.mockReturnValue(false);
    await expect(
      fake.service.setStatus(actor, {
        id: page.id,
        status: "published",
        expectedLockVersion: await lockOf(fake, page.id),
      }),
    ).rejects.toBeInstanceOf(CmsForbiddenError);
    expect(await snapshot(fake, page.id)).toEqual(before);
  });

  it("refuses to UNpublish when the actor may not publish", async () => {
    // The half that was missing once: only the transition *into* published
    // consulted the policy, so taking a live page down was open to everyone
    // regardless of how the role was configured.
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    await fake.service.publish(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });
    const before = await snapshot(fake, page.id);

    canPublish.mockReturnValue(false);
    await expect(
      fake.service.setStatus(actor, {
        id: page.id,
        status: "draft",
        expectedLockVersion: await lockOf(fake, page.id),
      }),
    ).rejects.toBeInstanceOf(CmsForbiddenError);
    expect(await snapshot(fake, page.id)).toEqual(before);
  });

  it("does not ask the publish policy about draft → public preview", async () => {
    // A preview is not publication: it is excluded from every listing and
    // carries `noindex, nofollow`. Gating it on `canPublish` would make the
    // toggle mean more than it says.
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);

    canPublish.mockReturnValue(false);
    await fake.service.setStatus(actor, {
      id: page.id,
      status: "preview",
      expectedLockVersion: await lockOf(fake, page.id),
    });
    expect(fake.pageRow(page.id)?.status).toBe("preview");
    expect(fake.pageRow(page.id)?.previewRevisionId).toBeTruthy();
  });

  it("does not ask the publish policy about an ordinary save on a live page", async () => {
    // The whole point of the working copy: editing a published article is an
    // authoring decision, because nothing a reader can see moves.
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    await fake.service.publish(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });

    canPublish.mockReturnValue(false);
    await expect(
      fake.service.update(actor, {
        id: page.id,
        expectedLockVersion: await lockOf(fake, page.id),
        patch: { body: "Cuerpo nuevo.\n" },
      }),
    ).resolves.toMatchObject({ created: true });
  });
});

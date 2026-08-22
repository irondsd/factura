import { describe, expect, it } from "vitest";
import type { CmsActor } from "../types";
import {
  CmsConflictError,
  CmsSlugTakenError,
  CmsValidationError,
} from "./errors";
import { actionsOf, createFakeCms, seedPage, type FakeCms } from "./testFakes";

// Moving a page's address (cms.md).
//
// The rules that matter are the ones a rename can get wrong quietly: a child
// left at an address its mother no longer owns, an old URL that 404s the day
// after a rename, and a redirect still standing where a live page now is. Each
// has a test here; the pure planning is `src/cms/rename.test.ts`.

const actor: CmsActor = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "editor@example.com",
  name: "Editor",
  role: "editor",
};

const lockOf = async (fake: FakeCms, id: string): Promise<number> =>
  (await fake.service.getState(actor, id)).lockVersion;

const rename = async (fake: FakeCms, id: string, slug: string) =>
  fake.service.rename(actor, {
    id,
    expectedLockVersion: await lockOf(fake, id),
    slug,
  });

const publish = async (fake: FakeCms, id: string) =>
  fake.service.publish(actor, {
    id,
    expectedLockVersion: await lockOf(fake, id),
  });

/** A child of `parent`, created through the service so the hierarchy rules run. */
const seedChild = (fake: FakeCms, parentId: string, slug: string) =>
  fake.service.create(actor, {
    section: "guias",
    slug,
    title: "Una hija",
    description: "Descripción de prueba para la suite del CMS.",
    summary: "Resumen de prueba.",
    cta: "Probá Factura.",
    body: "Cuerpo de prueba.\n",
    metadata: { keywords: ["prueba"], categories: ["servicios"] },
    parentId,
  });

describe("renaming a page", () => {
  it("moves the address", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor, { slug: "vieja" });

    const result = await rename(fake, page.id, "nueva");

    expect(result.document.slug).toBe("nueva");
    expect(fake.pageRow(page.id)?.slug).toBe("nueva");
  });

  it("preserves an address a reader could have linked to", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor, { slug: "vieja" });
    await publish(fake, page.id);

    const result = await rename(fake, page.id, "nueva");

    expect(result.redirects).toEqual(["vieja"]);
    expect(fake.redirectRows()).toEqual({ "guias:vieja": page.id });
  });

  it("leaves nothing behind for a page that was never public", async () => {
    // A draft's old path never resolved for anybody. A redirect from it would
    // be a row that can only ever answer a request nobody made.
    const fake = createFakeCms();
    const page = await seedPage(fake, actor, { slug: "vieja" });

    const result = await rename(fake, page.id, "nueva");

    expect(result.redirects).toEqual([]);
    expect(fake.redirectRows()).toEqual({});
  });

  it("carries the children with it, redirects and all", async () => {
    const fake = createFakeCms();
    const hub = await seedPage(fake, actor, { slug: "hub" });
    const child = await seedChild(fake, hub.id, "hub/uno");
    await publish(fake, hub.id);
    await publish(fake, child.id);

    const result = await rename(fake, hub.id, "centro");

    expect(result.moves).toEqual([
      { from: "hub", to: "centro" },
      { from: "hub/uno", to: "centro/uno" },
    ]);
    expect(fake.pageRow(child.id)?.slug).toBe("centro/uno");
    expect(fake.redirectRows()).toEqual({
      "guias:hub": hub.id,
      "guias:hub/uno": child.id,
    });
  });

  it("drops the redirect when a page takes an old address back", async () => {
    // Otherwise the page would be live at an address that also redirects away
    // from itself, and which of the two wins would depend on query order.
    const fake = createFakeCms();
    const page = await seedPage(fake, actor, { slug: "vieja" });
    await publish(fake, page.id);
    await rename(fake, page.id, "nueva");

    await rename(fake, page.id, "vieja");

    expect(fake.redirectRows()).toEqual({ "guias:nueva": page.id });
  });

  it("refuses an address another page holds", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor, { slug: "vieja" });
    await seedPage(fake, actor, { slug: "ocupada" });

    await expect(rename(fake, page.id, "ocupada")).rejects.toBeInstanceOf(
      CmsSlugTakenError,
    );
  });

  it("refuses to move a child out from under its mother", async () => {
    // `slug` and `parent_id` are two representations of one placement, and the
    // invariant between them is what every breadcrumb and index trusts. Moving
    // a child to a top-level path would break it silently.
    const fake = createFakeCms();
    const hub = await seedPage(fake, actor, { slug: "hub" });
    const child = await seedChild(fake, hub.id, "hub/uno");

    await expect(rename(fake, child.id, "suelta")).rejects.toBeInstanceOf(
      CmsValidationError,
    );
    expect(fake.pageRow(child.id)?.slug).toBe("hub/uno");
  });

  it("refuses a version the editor no longer holds", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor, { slug: "vieja" });
    const stale = await lockOf(fake, page.id);
    await fake.service.update(actor, {
      id: page.id,
      expectedLockVersion: stale,
      patch: { title: "Otro título" },
    });

    await expect(
      fake.service.rename(actor, {
        id: page.id,
        expectedLockVersion: stale,
        slug: "nueva",
      }),
    ).rejects.toBeInstanceOf(CmsConflictError);
  });

  it("leaves the working copy alone", async () => {
    // A rename is not an edit. Unsaved prose in the working copy has to survive
    // one, or moving a page would be a way to lose work.
    const fake = createFakeCms();
    const page = await seedPage(fake, actor, { slug: "vieja" });
    await publish(fake, page.id);
    await fake.service.update(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
      patch: { body: "Borrador sin publicar.\n" },
    });

    await rename(fake, page.id, "nueva");

    const state = await fake.service.getState(actor, page.id);
    expect(state.hasWip).toBe(true);
    expect(state.document.body).toBe("Borrador sin publicar.\n");
    expect(state.status).toBe("published");
  });

  it("expires the public cache for a page a reader can see", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor, { slug: "vieja" });
    await publish(fake, page.id);
    fake.expired.length = 0;

    await rename(fake, page.id, "nueva");

    expect(fake.expired).toEqual(["guias"]);
  });

  it("expires nothing for a draft", async () => {
    // Both addresses 404 before and after. There is nothing cached to be wrong.
    const fake = createFakeCms();
    const page = await seedPage(fake, actor, { slug: "vieja" });
    fake.expired.length = 0;

    await rename(fake, page.id, "nueva");

    expect(fake.expired).toEqual([]);
  });

  it("records the move in the page's activity", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor, { slug: "vieja" });

    await rename(fake, page.id, "nueva");

    expect(actionsOf(fake)).toEqual(["created", "renamed"]);
  });

  it("clears a redirect when a new page is created at that address", async () => {
    // The other way a redirect could end up shadowing a live page.
    const fake = createFakeCms();
    const page = await seedPage(fake, actor, { slug: "vieja" });
    await publish(fake, page.id);
    await rename(fake, page.id, "nueva");
    expect(fake.redirectRows()).toEqual({ "guias:vieja": page.id });

    await seedPage(fake, actor, { slug: "vieja" });

    expect(fake.redirectRows()).toEqual({});
  });
});

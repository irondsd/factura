import { describe, expect, it } from "vitest";
import type { CmsActor } from "../types";
import {
  CmsConflictError,
  CmsNotDeletableError,
  CmsNotFoundError,
} from "./errors";
import { createFakeCms, seedPage, type FakeCms } from "./testFakes";

// The one destructive operation in the CMS, and the guards that keep
// "archive by status" intact rather than discarding it (cms.md §4.2, §13).
//
// Three refusals and one permission. The refusals are what matter: a published
// page has a public URL and a cached copy that outlives the row; a page others
// hang off would orphan them; a version the editor no longer holds means
// somebody else has been working here.
//
// Since revisions, deleting also takes every stored version with it — working
// copy, checkpoint, public preview and all four publications — which is the
// last assertion below and the reason the confirmation copy says so.

const actor: CmsActor = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "editor@example.com",
  name: null,
  role: "editor",
};

const lockOf = async (fake: FakeCms, id: string): Promise<number> =>
  (await fake.service.getState(actor, id)).lockVersion;

describe("deleting a page", () => {
  it("deletes a childless draft at the expected version", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);

    await fake.service.delete(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });
    expect(fake.pageRow(page.id)).toBeUndefined();
  });

  it("takes every stored version with it", async () => {
    // The confirmation says «también se eliminan las versiones guardadas», and
    // this is what makes that true rather than aspirational. A page left with
    // orphaned revisions would keep pinning the images they reference forever.
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    await fake.service.publish(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });
    await fake.service.update(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
      patch: { body: "Cuerpo nuevo.\n" },
    });
    await fake.service.unpublish(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });
    expect(fake.revisionRows(page.id).length).toBeGreaterThan(1);

    await fake.service.delete(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });
    expect(fake.revisionRows(page.id)).toEqual([]);
  });

  it("refuses a published page", async () => {
    // Unpublishing first is one extra click, and it keeps "this is live" and
    // "this is gone" two separate decisions — the public URL and its cached
    // copy outlive the row.
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    await fake.service.publish(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });

    await expect(
      fake.service.delete(actor, {
        id: page.id,
        expectedLockVersion: await lockOf(fake, page.id),
      }),
    ).rejects.toBeInstanceOf(CmsNotDeletableError);
    expect(fake.pageRow(page.id)).toBeDefined();
  });

  it("refuses a page in public preview", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);
    await fake.service.promotePreview(actor, {
      id: page.id,
      expectedLockVersion: await lockOf(fake, page.id),
    });

    await expect(
      fake.service.delete(actor, {
        id: page.id,
        expectedLockVersion: await lockOf(fake, page.id),
      }),
    ).rejects.toBeInstanceOf(CmsNotDeletableError);
    expect(fake.pageRow(page.id)).toBeDefined();
  });

  it("refuses a page other pages hang off, and says how many", async () => {
    const fake = createFakeCms();
    const parent = await seedPage(fake, actor, { slug: "una-guia" });
    for (const child of ["uno", "dos"]) {
      await fake.service.create(actor, {
        section: "guias",
        slug: `una-guia/${child}`,
        parentId: parent.id,
        title: `Hija ${child}`,
        description: "Descripción de prueba para la suite del CMS.",
        summary: "Resumen de prueba.",
        cta: "Probá Factura.",
        body: "Cuerpo de prueba.\n",
        metadata: { keywords: ["prueba"], categories: ["servicios"] },
      });
    }

    await expect(
      fake.service.delete(actor, {
        id: parent.id,
        expectedLockVersion: await lockOf(fake, parent.id),
      }),
    ).rejects.toThrow(/2 páginas/);
    expect(fake.pageRow(parent.id)).toBeDefined();
  });

  it("refuses a version the editor no longer holds", async () => {
    const fake = createFakeCms();
    const page = await seedPage(fake, actor);

    await expect(
      fake.service.delete(actor, { id: page.id, expectedLockVersion: 99 }),
    ).rejects.toBeInstanceOf(CmsConflictError);
    expect(fake.pageRow(page.id)).toBeDefined();
  });

  it("reports a page that is already gone as not found", async () => {
    const fake = createFakeCms();
    await expect(
      fake.service.delete(actor, {
        id: "44444444-4444-4444-4444-444444444444",
        expectedLockVersion: 1,
      }),
    ).rejects.toBeInstanceOf(CmsNotFoundError);
  });
});

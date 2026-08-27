import { describe, expect, it } from "vitest";
import { CONTENT_SECTIONS } from "@/content-system/types";
import type { CmsActor } from "../../types";
import type { MediaAsset } from "../types";
import { CmsMediaService } from "./service";
import type { CmsMediaStore } from "./store";

// Which media edits reach a reader, and which are library bookkeeping (cms.md).
//
// The distinction is not cosmetic. An image's bytes are immutable — a
// replacement is a new id at a new URL — so the only part of a media row a
// visitor ever sees is the alt decision that `MediaRef` carries
// (`@/content-system/media/repository`). Everything else on the row is for the
// people running the library.
//
// It matters more than it used to: the public reads have no TTL underneath them
// any more, so an expiry the CMS fails to make is not a wait, it is permanent.
// The converse is just as real in the other direction — expiring all four
// sections because somebody filed an image into a collection would regenerate
// the site for a change nobody can see.

const actor: CmsActor = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "editor@example.com",
  name: "Editor",
  role: "editor",
};

const asset: MediaAsset = {
  id: "22222222-2222-2222-2222-222222222222",
  status: "ready",
  collectionId: null,
  originalFilename: "factura.png",
  displayName: "Factura",
  mimeType: "image/png",
  byteSize: 1024,
  width: 40,
  height: 24,
  sha256: "abc",
  defaultAlt: "Una factura de luz",
  decorative: false,
  attribution: null,
  firstUsedAt: null,
  lastReferencedAt: null,
  lockVersion: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  trashedAt: null,
  permalink: "/media/22222222-2222-2222-2222-222222222222/factura.png",
  src: "https://media.example/factura.png",
};

/** Only the three methods `update` reaches. A real store needs a database, and
 * what is under test here is a decision, not a query. */
function fakeStore(): CmsMediaStore {
  return {
    findById: async () => asset,
    updateWithLock: async ({ patch }: { patch: Partial<MediaAsset> }) => ({
      ...asset,
      ...patch,
      lockVersion: asset.lockVersion + 1,
    }),
    lockVersionOf: async () => asset.lockVersion,
  } as unknown as CmsMediaStore;
}

function serviceWithSpy() {
  const expired: string[] = [];
  const service = new CmsMediaService(
    fakeStore(),
    () => new Date("2026-01-02T00:00:00.000Z"),
    undefined,
    (section) => expired.push(section),
  );
  return { service, expired };
}

const edit = (patch: Record<string, unknown>) => ({
  id: asset.id,
  expectedLockVersion: asset.lockVersion,
  patch,
});

describe("a media edit a reader can see", () => {
  it("expires every section when the alt text changes", async () => {
    const { service, expired } = serviceWithSpy();
    await service.update(actor, edit({ defaultAlt: "Otra factura" }));
    // All four, not one: the same image can illustrate a guide and a research
    // page, and can be an author's portrait, which has no page of its own.
    expect(expired).toEqual([...CONTENT_SECTIONS]);
  });

  it("expires every section when the decorative flag changes", async () => {
    const { service, expired } = serviceWithSpy();
    await service.update(actor, edit({ defaultAlt: "", decorative: true }));
    expect(expired).toEqual([...CONTENT_SECTIONS]);
  });
});

describe("a media edit no reader can see", () => {
  it("expires nothing when the asset is renamed in the library", async () => {
    const { service, expired } = serviceWithSpy();
    await service.update(actor, edit({ displayName: "Factura de Edesur" }));
    expect(expired).toEqual([]);
  });

  it("expires nothing when the credit or the collection changes", async () => {
    const { service, expired } = serviceWithSpy();
    await service.update(
      actor,
      edit({ attribution: "Foto: Redacción", collectionId: "col-1" }),
    );
    expect(expired).toEqual([]);
  });
});

describe("a failing invalidation", () => {
  it("does not fail the save it follows", async () => {
    // Same rule as pages and authors: the row is already committed, so a cache
    // failure is logged, not reported as a refused edit.
    const service = new CmsMediaService(
      fakeStore(),
      () => new Date("2026-01-02T00:00:00.000Z"),
      undefined,
      () => {
        throw new Error("no request context");
      },
    );
    await expect(
      service.update(actor, edit({ defaultAlt: "Sigue guardando" })),
    ).resolves.toMatchObject({ defaultAlt: "Sigue guardando" });
  });
});

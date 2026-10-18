import { describe, expect, it } from "vitest";
import { CONTENT_SECTIONS } from "@/content-system/types";
import type { CmsActor } from "../../types";
import type { PublicCacheScope } from "@/cms/server/invalidation";
import type { CmsAuthorStore } from "../../authors/server/store";
import type { MediaAsset, MediaUsageRef } from "../types";
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
// The converse is just as real in the other direction: every route a refresh
// reaches is an ISR write, whether or not it changed. So an edit refreshes the
// pages that show the image and nothing else — not the four sections, which
// is what one morning of alt text on fresh uploads used to cost (~4k units).

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

/** Only the methods `update` reaches. A real store needs a database, and what
 * is under test here is a decision, not a query. */
function fakeStore(usage: Partial<MediaUsageRef>[] = []): CmsMediaStore {
  return {
    findById: async () => asset,
    updateWithLock: async ({ patch }: { patch: Partial<MediaAsset> }) => ({
      ...asset,
      ...patch,
      lockVersion: asset.lockVersion + 1,
    }),
    lockVersionOf: async () => asset.lockVersion,
    usageOf: async () =>
      usage.map((ref) => ({
        pageId: "p",
        revisionId: "r",
        kind: "published",
        publicationNumber: 1,
        section: "guias",
        slug: "una-guia",
        title: "Una guía",
        status: "published",
        isLive: true,
        placement: "body",
        occurrences: 1,
        ...ref,
      })),
  } as unknown as CmsMediaStore;
}

function fakeAuthors(portraitOf: string[] = []): CmsAuthorStore {
  return {
    byPortrait: async () =>
      portraitOf.map((name) => ({ id: name, name, imageMediaId: asset.id })),
  } as unknown as CmsAuthorStore;
}

type Expiry = [string, readonly string[] | "all", PublicCacheScope];

function serviceWithSpy(
  usage: Partial<MediaUsageRef>[] = [],
  portraitOf: string[] = [],
) {
  const expired: Expiry[] = [];
  const service = new CmsMediaService(
    fakeStore(usage),
    () => new Date("2026-01-02T00:00:00.000Z"),
    fakeAuthors(portraitOf),
    (section, slugs, scope) =>
      expired.push([section, slugs ?? "all", scope ?? "listings"]),
  );
  return { service, expired };
}

const edit = (patch: Record<string, unknown>) => ({
  id: asset.id,
  expectedLockVersion: asset.lockVersion,
  patch,
});

describe("a media edit a reader can see", () => {
  it("refreshes only the page whose live copy embeds the image", async () => {
    const { service, expired } = serviceWithSpy([{ slug: "una-guia" }]);
    await service.update(actor, edit({ defaultAlt: "Otra factura" }));
    expect(expired).toEqual([["guias", ["una-guia"], "page"]]);
  });

  it("refreshes the listings too when it is a page's preview image", async () => {
    // The card in the index, the category hubs and the home teasers draws it.
    const { service, expired } = serviceWithSpy([
      { slug: "una-guia", placement: "preview" },
    ]);
    await service.update(actor, edit({ defaultAlt: "", decorative: true }));
    expect(expired).toEqual([["guias", ["una-guia"], "listings"]]);
  });

  it("refreshes a public preview that embeds it, and nothing listed", async () => {
    const { service, expired } = serviceWithSpy([
      {
        slug: "en-revision",
        kind: "preview",
        status: "preview",
        isLive: false,
        placement: "preview",
      },
    ]);
    await service.update(actor, edit({ defaultAlt: "Otra factura" }));
    expect(expired).toEqual([["guias", ["en-revision"], "page"]]);
  });

  it("names each section once, with every page in it", async () => {
    const { service, expired } = serviceWithSpy([
      { slug: "una-guia" },
      { slug: "otra-guia" },
      { section: "estadisticas", slug: "precios" },
    ]);
    await service.update(actor, edit({ defaultAlt: "Otra factura" }));
    expect(expired).toEqual([
      ["guias", ["una-guia", "otra-guia"], "page"],
      ["estadisticas", ["precios"], "page"],
    ]);
  });

  it("refreshes every section for an author's portrait", async () => {
    // Which pages an author signed lives in page metadata, not in usage rows.
    const { service, expired } = serviceWithSpy([], ["Autora"]);
    await service.update(actor, edit({ defaultAlt: "Retrato" }));
    expect(expired.map(([section]) => section)).toEqual([...CONTENT_SECTIONS]);
  });
});

describe("a media edit no reader can see", () => {
  it("refreshes nothing when no public page uses the image", async () => {
    // The usual case: alt text is written right after an upload.
    const { service, expired } = serviceWithSpy();
    await service.update(actor, edit({ defaultAlt: "Recién subida" }));
    expect(expired).toEqual([]);
  });

  it("refreshes nothing when only drafts and old publications use it", async () => {
    const { service, expired } = serviceWithSpy([
      { kind: "wip", isLive: false },
      { kind: "published", isLive: false, publicationNumber: 2 },
      { kind: "checkpoint", status: "draft", isLive: false },
    ]);
    await service.update(actor, edit({ defaultAlt: "Otra factura" }));
    expect(expired).toEqual([]);
  });

  it("expires nothing when the asset is renamed in the library", async () => {
    const { service, expired } = serviceWithSpy([{ slug: "una-guia" }]);
    await service.update(actor, edit({ displayName: "Factura de Edesur" }));
    expect(expired).toEqual([]);
  });

  it("expires nothing when the credit or the collection changes", async () => {
    const { service, expired } = serviceWithSpy([{ slug: "una-guia" }]);
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
      fakeStore([{ slug: "una-guia" }]),
      () => new Date("2026-01-02T00:00:00.000Z"),
      fakeAuthors(),
      () => {
        throw new Error("no request context");
      },
    );
    await expect(
      service.update(actor, edit({ defaultAlt: "Sigue guardando" })),
    ).resolves.toMatchObject({ defaultAlt: "Sigue guardando" });
  });
});

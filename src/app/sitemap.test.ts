import { describe, expect, it, vi } from "vitest";

// The categories and the pages come from two separately cached queries, so the
// suite hands the sitemap a pair that disagrees: a category the category query
// calls non-empty, with nothing in the page list carrying its key. That is the
// shape that took a build down — `Math.max()` over no timestamps is `-Infinity`
// and serialising a `Date` built from it throws.
const guide = (slug: string, categories: string[], contentUpdatedAt: string) =>
  ({
    slug,
    contentUpdatedAt,
    canonicalSlug: null,
    metadata: { categories },
  }) as never;

const page = (slug: string, categoryKeys: string[], updated: string) => ({
  slug: [slug],
  meta: { categoryKeys, updated },
});

const location = (
  slug: string,
  updatedAt: string,
  pageUpdates: string[],
) =>
  ({
    slug,
    updatedAt,
    pages: pageUpdates.map((contentUpdatedAt) => ({ contentUpdatedAt })),
  }) as never;

const guides = vi.hoisted(() => vi.fn());
const guideCategories = vi.hoisted(() => vi.fn());
const listed = vi.hoisted(() => vi.fn());
const contentCategories = vi.hoisted(() => vi.fn());
const locations = vi.hoisted(() => vi.fn());

vi.mock("@/content-system/repository/guias", () => ({
  publishedGuides: guides,
  nonEmptyCategories: guideCategories,
}));

vi.mock("@/content-system/repository/categories", () => ({
  nonEmptyContentCategories: contentCategories,
}));

vi.mock("@/content-system/repository/locations", () => ({
  nonEmptyContentLocations: locations,
}));

vi.mock("@/content/sections", () => ({
  SECTIONS: [{ id: "estadisticas", listed }],
}));

import sitemap from "./sitemap";

const entry = (
  entries: Awaited<ReturnType<typeof sitemap>>,
  url: string,
): (typeof entries)[number] => {
  const found = entries.find((e) => e.url === url);
  if (!found) throw new Error(`no sitemap entry for ${url}`);
  return found;
};

describe("sitemap", () => {
  it("dates a category hub by the newest page it lists", async () => {
    locations.mockResolvedValue([]);
    guides.mockResolvedValue([
      guide("una", ["luz"], "2026-03-01T00:00:00.000Z"),
      guide("otra", ["luz"], "2026-05-02T00:00:00.000Z"),
    ]);
    guideCategories.mockResolvedValue([{ key: "luz", slug: "luz" }]);
    listed.mockResolvedValue([
      page("a", ["caba"], "2026-01-10T00:00:00.000Z"),
      page("b", ["caba"], "2026-07-20T00:00:00.000Z"),
    ]);
    contentCategories.mockResolvedValue([{ key: "caba", slug: "caba" }]);

    const entries = await sitemap();

    expect(
      entry(entries, "https://factura.uno/guias/categoria/luz").lastModified,
    ).toEqual(new Date("2026-05-02T00:00:00.000Z"));
    expect(
      entry(entries, "https://factura.uno/estadisticas/categoria/caba")
        .lastModified,
    ).toEqual(new Date("2026-07-20T00:00:00.000Z"));
  });

  it("omits lastModified for a category with no listed pages", async () => {
    locations.mockResolvedValue([]);
    guides.mockResolvedValue([
      guide("una", ["luz"], "2026-03-01T00:00:00.000Z"),
    ]);
    guideCategories.mockResolvedValue([
      { key: "luz", slug: "luz" },
      { key: "gas", slug: "gas" },
    ]);
    listed.mockResolvedValue([page("a", ["caba"], "2026-01-10T00:00:00.000Z")]);
    contentCategories.mockResolvedValue([
      { key: "caba", slug: "caba" },
      { key: "pba", slug: "pba" },
    ]);

    const entries = await sitemap();

    // The hub is still a real page — it is listed, just undated.
    expect(entry(entries, "https://factura.uno/guias/categoria/gas")).toEqual({
      url: "https://factura.uno/guias/categoria/gas",
      lastModified: undefined,
      changeFrequency: "weekly",
      priority: 0.65,
    });
    expect(
      entry(entries, "https://factura.uno/estadisticas/categoria/pba")
        .lastModified,
    ).toBeUndefined();
    // The whole point: serialising the result must not throw.
    expect(() => JSON.stringify(entries)).not.toThrow();
  });

  it("omits lastModified for an empty index rather than inventing one", async () => {
    locations.mockResolvedValue([]);
    guides.mockResolvedValue([]);
    guideCategories.mockResolvedValue([]);
    listed.mockResolvedValue([]);
    contentCategories.mockResolvedValue([]);

    const entries = await sitemap();

    expect(
      entry(entries, "https://factura.uno/guias").lastModified,
    ).toBeUndefined();
    expect(
      entry(entries, "https://factura.uno/estadisticas").lastModified,
    ).toBeUndefined();
    expect(
      entries.some((item) => item.url === "https://factura.uno/ubicacion"),
    ).toBe(false);
  });

  it("dates location surfaces by registry edits as well as their content", async () => {
    guides.mockResolvedValue([]);
    guideCategories.mockResolvedValue([]);
    listed.mockResolvedValue([]);
    contentCategories.mockResolvedValue([]);
    locations.mockResolvedValue([
      location("caba", "2026-08-20T00:00:00.000Z", [
        "2026-06-01T00:00:00.000Z",
      ]),
      location("mendoza", "2026-03-01T00:00:00.000Z", [
        "2026-07-10T00:00:00.000Z",
      ]),
    ]);

    const entries = await sitemap();

    expect(
      entry(entries, "https://factura.uno/ubicacion").lastModified,
    ).toEqual(new Date("2026-08-20T00:00:00.000Z"));
    expect(
      entry(entries, "https://factura.uno/ubicacion/caba").lastModified,
    ).toEqual(new Date("2026-08-20T00:00:00.000Z"));
    expect(
      entry(entries, "https://factura.uno/ubicacion/mendoza").lastModified,
    ).toEqual(new Date("2026-07-10T00:00:00.000Z"));
  });
});

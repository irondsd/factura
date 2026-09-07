import { describe, expect, it } from "vitest";
import type { AuthorRef } from "@/content-system/authors/types";
import { buildCmsFilterOptions, filterOptionLabel } from "./listFilterOptions";
import {
  CMS_MISSING_AUTHOR,
  CMS_MISSING_CATEGORY,
  CMS_MISSING_FACT_CHECKER,
  CMS_MISSING_LOCATION,
} from "./listQuery";
import type { CmsContentSummary } from "./types";

const page = (
  id: string,
  metadata: Partial<CmsContentSummary["metadata"]> = {},
): CmsContentSummary =>
  ({
    id,
    slug: id,
    parentId: null,
    sortOrder: 0,
    section: "guias",
    status: "published",
    hasWip: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    metadata: { keywords: [], categories: [], locations: [], ...metadata },
  }) as CmsContentSummary;

const author = (id: string, name: string): [string, AuthorRef] => [
  id,
  { id, name, slug: null, jobTitle: null, tagline: null, image: null },
];

const registry = [
  { key: "tarifas", label: "Tarifas" },
  { key: "subsidios", label: "Subsidios" },
  { key: "medidores", label: "Medidores" },
];

const locations = [
  { key: "caba", label: "CABA" },
  { key: "santa-fe", label: "Santa Fe" },
];

describe("buildCmsFilterOptions", () => {
  it("offers only the choices the section actually uses", () => {
    const options = buildCmsFilterOptions({
      pages: [
        page("a", { categories: ["tarifas"], locations: ["caba"] }),
        page("b", { categories: ["tarifas"] }),
        page("c"),
      ],
      categories: registry,
      locations,
      authors: new Map(),
    });

    // «Subsidios» and «Medidores» exist in the registry and could only ever
    // return an empty list here, so they are not offered. Empty metadata is a
    // real choice, though, and must remain available separately from «any».
    expect(options.categories).toEqual([
      { value: CMS_MISSING_CATEGORY, label: "Sin categoría", count: 1 },
      { value: "tarifas", label: "Tarifas", count: 2 },
    ]);
    expect(options.locations).toEqual([
      { value: CMS_MISSING_LOCATION, label: "Sin ubicación", count: 2 },
      { value: "caba", label: "CABA", count: 1 },
    ]);
    expect(options.authors).toEqual([
      { value: CMS_MISSING_AUTHOR, label: "Sin autor", count: 3 },
    ]);
  });

  it("keeps the registry's own order rather than reordering by usage", () => {
    const options = buildCmsFilterOptions({
      pages: [
        page("a", { categories: ["medidores"] }),
        page("b", { categories: ["tarifas"] }),
        page("c", { categories: ["tarifas"] }),
      ],
      categories: registry,
      locations,
      authors: new Map(),
    });
    expect(options.categories.map((option) => option.value)).toEqual([
      CMS_MISSING_CATEGORY,
      "tarifas",
      "medidores",
    ]);
  });

  it("separates the two credit roles and names each person", () => {
    const options = buildCmsFilterOptions({
      pages: [
        page("a", { authorId: "d", factCheckerId: "j" }),
        page("b", { authorId: "j" }),
      ],
      categories: registry,
      locations,
      authors: new Map([author("d", "Daria"), author("j", "Julián")]),
    });

    expect(options.authors).toEqual([
      { value: CMS_MISSING_AUTHOR, label: "Sin autor", count: 0 },
      { value: "d", label: "Daria", count: 1 },
      { value: "j", label: "Julián", count: 1 },
    ]);
    expect(options.factCheckers).toEqual([
      { value: CMS_MISSING_FACT_CHECKER, label: "Sin verificador", count: 1 },
      { value: "j", label: "Julián", count: 1 },
    ]);
  });

  it("falls back to the id for a credit nothing resolves", () => {
    // A deleted author row must not take the filter down with it: the pages
    // still name the id, so the id is what the option says.
    const options = buildCmsFilterOptions({
      pages: [page("a", { authorId: "gone" })],
      categories: registry,
      locations,
      authors: new Map(),
    });
    expect(options.authors).toEqual([
      { value: CMS_MISSING_AUTHOR, label: "Sin autor", count: 0 },
      { value: "gone", label: "gone", count: 1 },
    ]);
    expect(options.factCheckers).toEqual([
      { value: CMS_MISSING_FACT_CHECKER, label: "Sin verificador", count: 1 },
    ]);
  });

  it("counts a page once per key even if its metadata repeats one", () => {
    const options = buildCmsFilterOptions({
      pages: [page("a", { categories: ["tarifas", "tarifas"] })],
      categories: registry,
      locations,
      authors: new Map(),
    });
    expect(
      options.categories.find((option) => option.value === "tarifas")?.count,
    ).toBe(1);
  });

  it("ignores a key the registry no longer knows", () => {
    const options = buildCmsFilterOptions({
      pages: [page("a", { categories: ["retirada"] })],
      categories: registry,
      locations,
      authors: new Map(),
    });
    expect(options.categories).toEqual([]);
  });
});

describe("filterOptionLabel", () => {
  it("shows the raw key when no option matches it", () => {
    expect(filterOptionLabel([], "hand-edited")).toBe("hand-edited");
  });

  it("keeps the labels for an empty state from a hand-edited URL", () => {
    expect(filterOptionLabel([], CMS_MISSING_AUTHOR)).toBe("Sin autor");
    expect(filterOptionLabel([], CMS_MISSING_FACT_CHECKER)).toBe(
      "Sin verificador",
    );
  });
});

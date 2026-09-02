import { describe, expect, it } from "vitest";
import type { ContentSummary } from "@/content-system/types";
import {
  activeCmsFilterKeys,
  clearedCmsFilters,
  cmsListHref,
  DEFAULT_CMS_SORT,
  filterContentRows,
  hasUnpublishedChanges,
  parseCmsListQuery,
  sortedContentRows,
  toggleSort,
  withoutCmsFilter,
} from "./listQuery";
import type { CmsContentSummary } from "./types";

const page = (
  id: string,
  overrides: Partial<ContentSummary> = {},
): ContentSummary =>
  ({
    id,
    slug: id,
    parentId: null,
    sortOrder: 0,
    section: "guias",
    status: "published",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }) as ContentSummary;

describe("parseCmsListQuery", () => {
  it("defaults to the most recently edited first", () => {
    expect(parseCmsListQuery({}).sort).toEqual(DEFAULT_CMS_SORT);
  });

  it("falls back to the default rather than failing on a bad column", () => {
    // A hand-edited URL should still show the list.
    expect(parseCmsListQuery({ orden: "titulo", dir: "sideways" })).toEqual({
      status: undefined,
      sort: { column: "editada", direction: "desc" },
    });
  });

  it("reads a sorted, filtered list", () => {
    expect(
      parseCmsListQuery({
        estado: "draft",
        orden: "creada",
        dir: "asc",
      }),
    ).toEqual({
      status: "draft",
      sort: { column: "creada", direction: "asc" },
    });
  });

  it("ignores the `q` a bookmark from the old per-section search still carries", () => {
    // Searching moved to the header (`src/cms/search.ts`). A saved URL should
    // still open its section rather than 404 or filter by a parameter nothing
    // reads any more.
    expect(
      parseCmsListQuery({ estado: "draft", q: "edesur" } as never),
    ).toEqual({
      status: "draft",
      sort: DEFAULT_CMS_SORT,
    });
  });
});

describe("cmsListHref", () => {
  it("leaves the default sort out of the URL", () => {
    expect(cmsListHref("/cms/guias", { sort: DEFAULT_CMS_SORT })).toBe(
      "/cms/guias",
    );
  });

  it("carries a filter and a non-default sort together", () => {
    expect(
      cmsListHref("/cms/guias", {
        status: "draft",
        sort: { column: "creada", direction: "asc" },
      }),
    ).toBe("/cms/guias?estado=draft&orden=creada&dir=asc");
  });
});

describe("toggleSort", () => {
  it("opens a new column newest-first", () => {
    expect(
      toggleSort({ column: "editada", direction: "asc" }, "creada"),
    ).toEqual({ column: "creada", direction: "desc" });
  });

  it("flips the direction of the column already sorted", () => {
    expect(
      toggleSort({ column: "creada", direction: "desc" }, "creada"),
    ).toEqual({ column: "creada", direction: "asc" });
  });
});

describe("sortedContentRows", () => {
  const a = page("a", { updatedAt: "2026-03-01T00:00:00.000Z" });
  const b = page("b", { updatedAt: "2026-05-01T00:00:00.000Z" });
  const c = page("c", { updatedAt: "2026-04-01T00:00:00.000Z" });

  it("puts the most recent edit on top", () => {
    const rows = sortedContentRows([a, b, c], {
      column: "editada",
      direction: "desc",
    });
    expect(rows.map((row) => row.id)).toEqual(["b", "c", "a"]);
  });

  it("reverses on ascending", () => {
    const rows = sortedContentRows([a, b, c], {
      column: "editada",
      direction: "asc",
    });
    expect(rows.map((row) => row.id)).toEqual(["a", "c", "b"]);
  });

  it("sorts by creation independently of edits", () => {
    const rows = sortedContentRows(
      [
        page("old", {
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        }),
        page("new", {
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        }),
      ],
      { column: "creada", direction: "desc" },
    );
    expect(rows.map((row) => row.id)).toEqual(["new", "old"]);
  });

  it("keeps children under their parent", () => {
    // Sorting reorders siblings; it does not flatten the tree, or the indent
    // would be describing a shape that is no longer on screen.
    const hub = page("hub", {
      slug: "hub",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const child = page("child", {
      slug: "hub/child",
      parentId: "hub",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    const other = page("other", {
      slug: "other",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });

    const rows = sortedContentRows([hub, child, other], {
      column: "editada",
      direction: "desc",
    });
    expect(rows.map((row) => row.id)).toEqual(["other", "hub", "child"]);
  });

  it("breaks ties by slug so the order is stable", () => {
    const rows = sortedContentRows([page("zeta"), page("alfa")], {
      column: "editada",
      direction: "desc",
    });
    expect(rows.map((row) => row.id)).toEqual(["alfa", "zeta"]);
  });
});

// ── filters ─────────────────────────────────────────────────────────────────

const row = (
  id: string,
  overrides: Partial<CmsContentSummary> = {},
): CmsContentSummary =>
  ({
    ...page(id),
    hasWip: false,
    metadata: { keywords: [], categories: [], locations: [] },
    ...overrides,
  }) as CmsContentSummary;

describe("parseCmsListQuery filters", () => {
  it("reads every facet out of the query string", () => {
    expect(
      parseCmsListQuery({
        estado: "preview",
        autor: "daria",
        verificador: "julian",
        categoria: "tarifas",
        ubicacion: "caba",
        cambios: "si",
      }),
    ).toEqual({
      status: "preview",
      authorId: "daria",
      factCheckerId: "julian",
      category: "tarifas",
      location: "caba",
      unpublishedChanges: true,
      sort: DEFAULT_CMS_SORT,
    });
  });

  it("treats a blank or unknown `cambios` as no opinion", () => {
    expect(
      parseCmsListQuery({ cambios: "" }).unpublishedChanges,
    ).toBeUndefined();
    expect(
      parseCmsListQuery({ cambios: "quizás" }).unpublishedChanges,
    ).toBeUndefined();
    expect(parseCmsListQuery({ cambios: "no" }).unpublishedChanges).toBe(false);
  });

  it("drops an empty or absurdly long key rather than filtering by it", () => {
    expect(parseCmsListQuery({ autor: "   " }).authorId).toBeUndefined();
    expect(
      parseCmsListQuery({ categoria: "x".repeat(200) }).category,
    ).toBeUndefined();
  });
});

describe("cmsListHref", () => {
  it("round-trips every facet", () => {
    const query = parseCmsListQuery({
      estado: "draft",
      autor: "daria",
      verificador: "julian",
      categoria: "tarifas",
      ubicacion: "caba",
      cambios: "no",
      orden: "creada",
      dir: "asc",
    });
    const href = cmsListHref("/cms/guias", query);
    const params = Object.fromEntries(
      new URLSearchParams(href.split("?")[1]).entries(),
    );
    expect(parseCmsListQuery(params)).toEqual(query);
  });

  it("leaves an unfiltered, default-sorted list as the plain address", () => {
    expect(cmsListHref("/cms/guias", parseCmsListQuery({}))).toBe("/cms/guias");
  });
});

describe("filterContentRows", () => {
  it("keeps everything when nothing is filtered", () => {
    const pages = [row("a"), row("b")];
    expect(filterContentRows(pages, parseCmsListQuery({}))).toHaveLength(2);
  });

  it("ANDs the facets", () => {
    const pages = [
      row("both", {
        status: "published",
        metadata: {
          keywords: [],
          categories: ["tarifas"],
          locations: [],
          authorId: "daria",
        },
      } as Partial<CmsContentSummary>),
      row("wrong-author", {
        status: "published",
        metadata: {
          keywords: [],
          categories: ["tarifas"],
          locations: [],
          authorId: "julian",
        },
      } as Partial<CmsContentSummary>),
      row("wrong-category", {
        status: "published",
        metadata: {
          keywords: [],
          categories: ["subsidios"],
          locations: [],
          authorId: "daria",
        },
      } as Partial<CmsContentSummary>),
    ];

    const kept = filterContentRows(
      pages,
      parseCmsListQuery({ autor: "daria", categoria: "tarifas" }),
    );
    expect(kept.map((p) => p.id)).toEqual(["both"]);
  });

  it("matches a location among several", () => {
    const pages = [
      row("caba", {
        metadata: {
          keywords: [],
          categories: [],
          locations: ["buenos-aires", "caba"],
        },
      }),
      row("santa-fe", {
        metadata: { keywords: [], categories: [], locations: ["santa-fe"] },
      }),
    ];
    expect(
      filterContentRows(pages, parseCmsListQuery({ ubicacion: "caba" })).map(
        (p) => p.id,
      ),
    ).toEqual(["caba"]);
  });

  it("counts a draft as having nothing pending", () => {
    // Everything about a draft is unpublished, so folding drafts in would make
    // the filter mean two things at once — and it is the same rule the row's
    // «Borrador guardado» line is drawn by.
    const draft = row("draft", { status: "draft", hasWip: true });
    const published = row("published", { status: "published", hasWip: true });
    const clean = row("clean", { status: "published", hasWip: false });

    expect(hasUnpublishedChanges(draft)).toBe(false);
    expect(
      filterContentRows(
        [draft, published, clean],
        parseCmsListQuery({ cambios: "si" }),
      ).map((p) => p.id),
    ).toEqual(["published"]);
    expect(
      filterContentRows(
        [draft, published, clean],
        parseCmsListQuery({ cambios: "no" }),
      ).map((p) => p.id),
    ).toEqual(["draft", "clean"]);
  });

  it("drops a row whose metadata failed to parse from a metadata filter", () => {
    const broken = row("broken", {
      metadata: undefined as never,
      metadataError: "no anda",
    });
    expect(
      filterContentRows([broken], parseCmsListQuery({ categoria: "tarifas" })),
    ).toEqual([]);
    // Still listed when nothing is filtered, so it can be found and fixed.
    expect(filterContentRows([broken], parseCmsListQuery({}))).toHaveLength(1);
  });
});

describe("active filters", () => {
  it("names the facets in play, and false counts as one", () => {
    expect(
      activeCmsFilterKeys(
        parseCmsListQuery({ estado: "draft", cambios: "no" }),
      ),
    ).toEqual(["status", "unpublishedChanges"]);
  });

  it("releases one facet and keeps the sort", () => {
    const query = parseCmsListQuery({
      estado: "draft",
      autor: "daria",
      orden: "creada",
      dir: "asc",
    });
    const next = withoutCmsFilter(query, "status");
    expect(next.status).toBeUndefined();
    expect(next.authorId).toBe("daria");
    expect(next.sort).toEqual({ column: "creada", direction: "asc" });
  });

  it("clears every facet and keeps the sort", () => {
    const query = parseCmsListQuery({
      estado: "draft",
      autor: "daria",
      ubicacion: "caba",
      orden: "creada",
      dir: "asc",
    });
    expect(clearedCmsFilters(query)).toEqual({
      sort: { column: "creada", direction: "asc" },
    });
  });
});

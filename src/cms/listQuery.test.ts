import { describe, expect, it } from "vitest";
import type { ContentSummary } from "@/content-system/types";
import {
  cmsListHref,
  DEFAULT_CMS_SORT,
  parseCmsListQuery,
  sortedContentRows,
  toggleSort,
} from "./listQuery";

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

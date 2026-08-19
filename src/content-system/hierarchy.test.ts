import { describe, expect, it } from "vitest";
import {
  ancestorsOf,
  buildContentTree,
  checkHierarchy,
  depthOf,
  flattenTree,
  HIERARCHY_CODES,
  type HierarchyNode,
  ownSegment,
  parentSlugFromPath,
} from "./hierarchy";

// Hierarchy is uniform across sections on purpose: statistics needed a second
// level first, but a guides hub is a matter of when, not whether. These tests
// use `guias` as often as `estadisticas` — if a rule only held for one section,
// that is the per-section branch this model exists to avoid.

const node = (
  over: Partial<HierarchyNode> & { id: string; slug: string },
): HierarchyNode => ({
  section: "guias",
  parentId: null,
  sortOrder: 0,
  ...over,
});

describe("paths", () => {
  it("reads the implied parent off a path", () => {
    expect(parentSlugFromPath("inflacion-de-vivienda/gba")).toBe(
      "inflacion-de-vivienda",
    );
    expect(parentSlugFromPath("como-leer-la-factura-de-edesur")).toBeNull();
  });

  it("reads the page's own segment", () => {
    expect(ownSegment("inflacion-de-vivienda/gba")).toBe("gba");
    expect(ownSegment("precio-m2-caba")).toBe("precio-m2-caba");
  });

  it("counts depth from one", () => {
    expect(depthOf("precio-m2-caba")).toBe(1);
    expect(depthOf("a/b/c")).toBe(3);
  });
});

describe("checkHierarchy", () => {
  const hub = node({ id: "hub", slug: "inflacion-de-vivienda" });

  it("accepts a top-level page", () => {
    expect(
      checkHierarchy(node({ id: "a", slug: "precio-m2-caba" }), []),
    ).toEqual([]);
  });

  it("accepts a child whose path sits under its parent", () => {
    const child = node({
      id: "c",
      slug: "inflacion-de-vivienda/gba",
      parentId: "hub",
    });
    expect(checkHierarchy(child, [hub])).toEqual([]);
  });

  it("rejects a nested path with no parent set", () => {
    // Otherwise the page renders at a URL whose parent does not exist — the
    // "every intermediate path exists" invariant, enforced for every section
    // rather than only the ones with hubs today.
    const orphan = node({ id: "c", slug: "inflacion-de-vivienda/gba" });
    expect(checkHierarchy(orphan, [hub]).map((p) => p.code)).toEqual([
      HIERARCHY_CODES.orphanPath,
    ]);
  });

  it("rejects a child whose path does not match its parent", () => {
    const child = node({
      id: "c",
      slug: "otra-cosa/gba",
      parentId: "hub",
    });
    const codes = checkHierarchy(child, [hub]).map((p) => p.code);
    expect(codes).toContain(HIERARCHY_CODES.slugPrefix);
  });

  it("names the path the child should have", () => {
    const child = node({ id: "c", slug: "otra-cosa/gba", parentId: "hub" });
    expect(checkHierarchy(child, [hub])[0].message).toContain(
      "inflacion-de-vivienda/gba",
    );
  });

  it("rejects a parent in another section", () => {
    // A guide parented to a statistics page would render a breadcrumb that
    // walks out of its own section.
    const child = node({
      id: "c",
      section: "guias",
      slug: "inflacion-de-vivienda/gba",
      parentId: "hub",
    });
    const stats = { ...hub, section: "estadisticas" };
    expect(checkHierarchy(child, [stats]).map((p) => p.code)).toContain(
      HIERARCHY_CODES.parentOtherSection,
    );
  });

  it("rejects a missing parent", () => {
    const child = node({ id: "c", slug: "x/y", parentId: "no-existe" });
    expect(checkHierarchy(child, []).map((p) => p.code)).toEqual([
      HIERARCHY_CODES.parentMissing,
    ]);
  });

  it("rejects a page parented to itself", () => {
    const self = node({ id: "a", slug: "a/b", parentId: "a" });
    expect(checkHierarchy(self, []).map((p) => p.code)).toEqual([
      HIERARCHY_CODES.parentSelf,
    ]);
  });

  it("rejects a cycle", () => {
    // A loop hangs every breadcrumb, index and sitemap that walks the tree.
    const a = node({ id: "a", slug: "a", parentId: "b" });
    const b = node({ id: "b", slug: "a/b", parentId: "a" });
    expect(checkHierarchy(a, [b]).map((p) => p.code)).toContain(
      HIERARCHY_CODES.parentCycle,
    );
  });

  it("applies the same rules to guides as to statistics", () => {
    // The point of the uniform model. Identical placement, two sections, same
    // verdict — if these ever diverge, a per-section branch has crept in.
    const guideHub = node({ id: "h", section: "guias", slug: "expensas" });
    const guideChild = node({
      id: "c",
      section: "guias",
      slug: "expensas/calculo",
      parentId: "h",
    });
    const statsHub = { ...guideHub, section: "estadisticas" };
    const statsChild = { ...guideChild, section: "estadisticas" };

    expect(checkHierarchy(guideChild, [guideHub])).toEqual(
      checkHierarchy(statsChild, [statsHub]),
    );
  });
});

describe("buildContentTree", () => {
  const pages = [
    node({
      id: "gba",
      slug: "inflacion-de-vivienda/gba",
      parentId: "hub",
      sortOrder: 1,
    }),
    node({ id: "hub", slug: "inflacion-de-vivienda", sortOrder: 0 }),
    node({
      id: "pampeana",
      slug: "inflacion-de-vivienda/pampeana",
      parentId: "hub",
      sortOrder: 2,
    }),
    node({ id: "m2", slug: "precio-m2-caba", sortOrder: 1 }),
  ];

  it("nests children under their parent in editorial order", () => {
    const tree = buildContentTree(pages);
    expect(tree.map((n) => n.page.id)).toEqual(["hub", "m2"]);
    expect(tree[0].children.map((n) => n.page.id)).toEqual(["gba", "pampeana"]);
  });

  it("respects sortOrder over alphabetical order", () => {
    // INDEC's region order is not alphabetical, and the author's order is the
    // one a reader moving between the hub's charts and its children expects.
    const reordered = pages.map((p) =>
      p.id === "pampeana" ? { ...p, sortOrder: 0 } : p,
    );
    expect(
      buildContentTree(reordered)[0].children.map((n) => n.page.id),
    ).toEqual(["pampeana", "gba"]);
  });

  it("breaks ties on slug so a listing never reshuffles", () => {
    const tied = [
      node({ id: "b", slug: "b", sortOrder: 0 }),
      node({ id: "a", slug: "a", sortOrder: 0 }),
    ];
    expect(buildContentTree(tied).map((n) => n.page.slug)).toEqual(["a", "b"]);
  });

  it("keeps a child whose parent is filtered out", () => {
    // A published-only list can legitimately exclude a draft hub; silently
    // losing its published children would be worse than showing them flat.
    const tree = buildContentTree(pages.filter((p) => p.id !== "hub"));
    expect(tree.map((n) => n.page.id).sort()).toEqual([
      "gba",
      "m2",
      "pampeana",
    ]);
  });

  it("flattens parents immediately before their children", () => {
    expect(flattenTree(buildContentTree(pages)).map((p) => p.id)).toEqual([
      "hub",
      "gba",
      "pampeana",
      "m2",
    ]);
  });
});

describe("ancestorsOf", () => {
  const pages = [
    node({ id: "a", slug: "a" }),
    node({ id: "b", slug: "a/b", parentId: "a" }),
    node({ id: "c", slug: "a/b/c", parentId: "b" }),
  ];

  it("walks up, nearest first", () => {
    expect(ancestorsOf(pages[2], pages).map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("is empty for a top-level page", () => {
    expect(ancestorsOf(pages[0], pages)).toEqual([]);
  });

  it("terminates on a cycle rather than hanging", () => {
    const looped = [
      node({ id: "x", slug: "x", parentId: "y" }),
      node({ id: "y", slug: "y", parentId: "x" }),
    ];
    expect(ancestorsOf(looped[0], looped).length).toBeLessThanOrEqual(2);
  });
});
